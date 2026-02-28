const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('POST /api/v1/multiplayer/matches creates MANUAL_POINTS match with places', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer matches tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const pool = getPool();
  await resetDatabase(pool);

  const playersResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ('Ada', true), ('Borys', true)
     RETURNING id, name`
  );

  const playerA = playersResult.rows.find((row) => row.name === 'Ada');
  const playerB = playersResult.rows.find((row) => row.name === 'Borys');

  const gameResult = await pool.query(
    `SELECT id, code, display_name AS "displayName", scoring_type AS "scoringType"
     FROM multiplayer_games
     WHERE code = 'uno'`
  );
  assert.equal(gameResult.rowCount, 1);
  const game = gameResult.rows[0];
  assert.equal(game.scoringType, 'MANUAL_POINTS');

  const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: game.id,
      playedOn: '2026-01-20',
      notes: 'Test manual points',
      players: [
        { playerId: playerA.id, totalPoints: 10 },
        { playerId: playerB.id, totalPoints: 10 },
      ],
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();

  assert.equal(payload.game.code, 'uno');
  assert.equal(payload.game.displayName, 'Uno');
  assert.equal(payload.game.scoringType, 'MANUAL_POINTS');
  assert.equal(payload.playedOn, '2026-01-20');
  assert.equal(payload.players.length, 2);

  const byId = new Map(payload.players.map((row) => [row.playerId, row]));
  assert.equal(byId.get(playerA.id).place, 1);
  assert.equal(byId.get(playerB.id).place, 1);
  assert.equal(byId.get(playerA.id).totalPoints, 10);
  assert.equal(byId.get(playerB.id).totalPoints, 10);

  const extraPlayersResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ('Celina', true), ('Damian', true), ('Ela', true)
     RETURNING id, name`
  );

  const playerC = extraPlayersResult.rows.find((row) => row.name === 'Celina');
  const playerD = extraPlayersResult.rows.find((row) => row.name === 'Damian');
  const playerE = extraPlayersResult.rows.find((row) => row.name === 'Ela');

  const maxResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: game.id,
      playedOn: '2026-01-21',
      players: [
        { playerId: playerA.id, totalPoints: 5 },
        { playerId: playerB.id, totalPoints: 9 },
        { playerId: playerC.id, totalPoints: 2 },
        { playerId: playerD.id, totalPoints: 7 },
        { playerId: playerE.id, totalPoints: 1 },
      ],
    }),
  });

  assert.equal(maxResponse.status, 201);
  const maxPayload = await maxResponse.json();
  assert.equal(maxPayload.players.length, 5);
  const maxById = new Map(maxPayload.players.map((row) => [row.playerId, row]));
  assert.equal(maxById.get(playerB.id).place, 1);
  assert.equal(maxById.get(playerD.id).place, 2);
  assert.equal(maxById.get(playerA.id).place, 3);
  assert.equal(maxById.get(playerC.id).place, 4);
  assert.equal(maxById.get(playerE.id).place, 5);
});

test('POST /api/v1/multiplayer/matches applies olympic ranking for multiple tie groups', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer matches tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const pool = getPool();
  await resetDatabase(pool);

  const playersResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ('Ala', true), ('Bartek', true), ('Celina', true), ('Dawid', true), ('Ewa', true), ('Filip', true)
     RETURNING id, name`
  );

  const byName = new Map(playersResult.rows.map((row) => [row.name, row.id]));
  const gameResult = await pool.query(`SELECT id FROM multiplayer_games WHERE code = 'uno'`);
  const gameId = gameResult.rows[0].id;

  const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-01-22',
      players: [
        { playerId: byName.get('Ala'), totalPoints: 100 },
        { playerId: byName.get('Bartek'), totalPoints: 90 },
        { playerId: byName.get('Celina'), totalPoints: 90 },
        { playerId: byName.get('Dawid'), totalPoints: 90 },
        { playerId: byName.get('Ewa'), totalPoints: 70 },
        { playerId: byName.get('Filip'), totalPoints: 70 },
      ],
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  const byPlayerId = new Map(payload.players.map((row) => [row.playerId, row]));

  assert.equal(byPlayerId.get(byName.get('Ala')).place, 1);
  assert.equal(byPlayerId.get(byName.get('Bartek')).place, 2);
  assert.equal(byPlayerId.get(byName.get('Celina')).place, 2);
  assert.equal(byPlayerId.get(byName.get('Dawid')).place, 2);
  assert.equal(byPlayerId.get(byName.get('Ewa')).place, 5);
  assert.equal(byPlayerId.get(byName.get('Filip')).place, 5);
});

test('POST /api/v1/multiplayer/matches creates CUSTOM_CALCULATOR match with computed totals', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer matches tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const pool = getPool();
  await resetDatabase(pool);

  const playersResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ('Anna', true), ('Bartek', true)
     RETURNING id, name`
  );
  const anna = playersResult.rows.find((row) => row.name === 'Anna');
  const bartek = playersResult.rows.find((row) => row.name === 'Bartek');

  const gameResult = await pool.query(
    `INSERT INTO multiplayer_games (
      code,
      display_name,
      scoring_type,
      min_players,
      max_players,
      is_active,
      visible_in_one_vs_one,
      visible_in_multiplayer
    ) VALUES ($1, $2, 'CUSTOM_CALCULATOR', 2, 4, true, true, true)
    RETURNING id`,
    [`custom_calc_${Date.now()}`, 'Custom Calculator']
  );
  const gameId = gameResult.rows[0].id;

  const fieldsResult = await pool.query(
    `INSERT INTO multiplayer_custom_scoring_fields (
      game_id,
      code,
      label,
      points_per_unit,
      sort_order,
      is_active
    ) VALUES
      ($1, 'objectives', 'Cele', 3, 1, true),
      ($1, 'penalties', 'Kary', -2, 2, true)
    RETURNING id, code`,
    [gameId]
  );
  const objectivesField = fieldsResult.rows.find((row) => row.code === 'objectives');
  const penaltiesField = fieldsResult.rows.find((row) => row.code === 'penalties');

  const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-02-10',
      players: [
        {
          playerId: anna.id,
          calculatorValues: {
            [objectivesField.id]: 6,
            [penaltiesField.id]: 1,
          },
        },
        {
          playerId: bartek.id,
          calculatorValues: {
            [objectivesField.id]: 4,
            [penaltiesField.id]: 0,
          },
        },
      ],
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.game.scoringType, 'CUSTOM_CALCULATOR');
  assert.ok(payload.customCalculator);
  assert.equal(payload.customCalculator.fields.length, 2);

  const byPlayerId = new Map(payload.players.map((item) => [item.playerId, item]));
  assert.equal(byPlayerId.get(anna.id).totalPoints, 16); // 6*3 + 1*(-2)
  assert.equal(byPlayerId.get(bartek.id).totalPoints, 12); // 4*3 + 0*(-2)
  assert.equal(byPlayerId.get(anna.id).place, 1);
  assert.equal(byPlayerId.get(bartek.id).place, 2);
});

test('POST /api/v1/multiplayer/matches accepts optionIds for multi-select games', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer matches tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const pool = getPool();
  await resetDatabase(pool);

  const playersResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ('Maja', true), ('Olek', true)
     RETURNING id, name`
  );
  const maja = playersResult.rows.find((row) => row.name === 'Maja');
  const olek = playersResult.rows.find((row) => row.name === 'Olek');

  const gameResult = await pool.query(
    `SELECT id FROM multiplayer_games WHERE code = 'uno'`
  );
  const gameId = gameResult.rows[0].id;

  await pool.query(`UPDATE multiplayer_games SET options_exclusive = false WHERE id = $1`, [gameId]);

  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const optionsResult = await pool.query(
    `INSERT INTO multiplayer_game_options (game_id, code, display_name, sort_order, is_active)
     VALUES
      ($1, $2, 'Dodatek A', 10, true),
      ($1, $3, 'Dodatek B', 20, true)
     RETURNING id`,
    [gameId, `opt_a_${suffix}`, `opt_b_${suffix}`]
  );
  const optionIds = optionsResult.rows.map((row) => row.id);

  const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-02-12',
      optionIds,
      players: [
        { playerId: maja.id, totalPoints: 12 },
        { playerId: olek.id, totalPoints: 9 },
      ],
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.options.length, 2);
  assert.deepEqual(
    new Set(payload.options.map((option) => option.id)),
    new Set(optionIds)
  );

  const linkedOptions = await pool.query(
    `SELECT option_id FROM multiplayer_match_options WHERE match_id = $1`,
    [payload.id]
  );
  assert.equal(linkedOptions.rowCount, 2);
});

test('POST /api/v1/multiplayer/matches rejects multiple optionIds for exclusive games', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer matches tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const pool = getPool();
  await resetDatabase(pool);

  const playersResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ('Iga', true), ('Jan', true)
     RETURNING id, name`
  );
  const iga = playersResult.rows.find((row) => row.name === 'Iga');
  const jan = playersResult.rows.find((row) => row.name === 'Jan');

  const gameResult = await pool.query(
    `SELECT id FROM multiplayer_games WHERE code = 'uno'`
  );
  const gameId = gameResult.rows[0].id;

  await pool.query(`UPDATE multiplayer_games SET options_exclusive = true WHERE id = $1`, [gameId]);

  const suffix = `${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  const optionsResult = await pool.query(
    `INSERT INTO multiplayer_game_options (game_id, code, display_name, sort_order, is_active)
     VALUES
      ($1, $2, 'Tryb A', 10, true),
      ($1, $3, 'Tryb B', 20, true)
     RETURNING id`,
    [gameId, `mode_a_${suffix}`, `mode_b_${suffix}`]
  );
  const optionIds = optionsResult.rows.map((row) => row.id);

  const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-02-13',
      optionIds,
      players: [
        { playerId: iga.id, totalPoints: 5 },
        { playerId: jan.id, totalPoints: 3 },
      ],
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
  assert.ok(
    payload.error.details.some(
      (detail) =>
        detail.field === 'optionIds' &&
        detail.message === 'supports a single option for this game'
    )
  );
});
