const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('POST /api/v1/multiplayer/matches creates TM match in simple points mode', async (t) => {
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
     WHERE code = 'terraforming_mars'`
  );
  assert.equal(gameResult.rowCount, 1);
  const game = gameResult.rows[0];
  assert.equal(game.scoringType, 'TM_CALCULATOR');

  const optionResult = await pool.query(
    `SELECT id FROM multiplayer_game_options WHERE game_id = $1 AND code = 'base'`,
    [game.id]
  );
  assert.equal(optionResult.rowCount, 1);
  const optionId = optionResult.rows[0].id;

  const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: game.id,
      optionId,
      playedOn: '2026-01-22',
      notes: 'TM multiplayer',
      players: [
        {
          playerId: playerA.id,
          totalPoints: 85,
        },
        {
          playerId: playerB.id,
          totalPoints: 68,
        },
      ],
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();

  assert.equal(payload.game.code, 'terraforming_mars');
  assert.equal(payload.players.length, 2);
  assert.equal('terraformingMars' in payload, false);

  const byPlayerId = new Map(payload.players.map((row) => [row.playerId, row]));
  assert.equal(byPlayerId.get(playerA.id).place, 1);
  assert.equal(byPlayerId.get(playerB.id).place, 2);
  assert.equal(byPlayerId.get(playerA.id).totalPoints, 85);
  assert.equal(byPlayerId.get(playerB.id).totalPoints, 68);
});

test('POST /api/v1/multiplayer/matches requires optionId for TM game options', async (t) => {
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
    `SELECT id FROM multiplayer_games WHERE code = 'terraforming_mars'`
  );
  const gameId = gameResult.rows[0].id;

  const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-01-22',
      players: [
        {
          playerId: playerA.id,
          totalPoints: 10,
        },
        {
          playerId: playerB.id,
          totalPoints: 8,
        },
      ],
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
  assert.ok(
    payload.error.details.some(
      (detail) => detail.field === 'optionId' && detail.message === 'is required for this game'
    )
  );
});
