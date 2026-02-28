const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('GET /api/v1/multiplayer/stats/players aggregates results per game', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer stats tests');
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
     VALUES ('Ada', true), ('Borys', true), ('Celina', true), ('Damian', true), ('Ela', true)
     RETURNING id, name`
  );

  const playersByName = new Map(playersResult.rows.map((row) => [row.name, row]));

  const gameResult = await pool.query(
    `SELECT id FROM multiplayer_games WHERE code = 'uno'`
  );
  const gameId = gameResult.rows[0].id;

  // Match 1: 2 players
  let response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-01-25',
      players: [
        { playerId: playersByName.get('Ada').id, totalPoints: 10 },
        { playerId: playersByName.get('Borys').id, totalPoints: 5 },
      ],
    }),
  });
  assert.equal(response.status, 201);

  // Match 2: 3 players
  response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-01-26',
      players: [
        { playerId: playersByName.get('Ada').id, totalPoints: 7 },
        { playerId: playersByName.get('Celina').id, totalPoints: 12 },
        { playerId: playersByName.get('Damian').id, totalPoints: 3 },
      ],
    }),
  });
  assert.equal(response.status, 201);

  // Match 3: 5 players
  response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-01-27',
      players: [
        { playerId: playersByName.get('Ada').id, totalPoints: 4 },
        { playerId: playersByName.get('Borys').id, totalPoints: 9 },
        { playerId: playersByName.get('Celina').id, totalPoints: 2 },
        { playerId: playersByName.get('Damian').id, totalPoints: 6 },
        { playerId: playersByName.get('Ela').id, totalPoints: 1 },
      ],
    }),
  });
  assert.equal(response.status, 201);

  const statsResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/stats/players?gameId=${gameId}`
  );
  assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json();

  const statsByName = new Map(stats.map((row) => [row.name, row]));

  const ada = statsByName.get('Ada');
  assert.equal(ada.matches, 3);
  assert.equal(ada.wins, 1);
  assert.equal(ada.seconds, 1);
  assert.equal(ada.thirds, 1);
  assert.equal(ada.podiums, 3);
  assert.equal(ada.bestPoints, 10);

  const celina = statsByName.get('Celina');
  assert.equal(celina.matches, 2);
  assert.equal(celina.wins, 1);
  assert.equal(celina.seconds, 0);
  assert.equal(celina.thirds, 0);
  assert.equal(celina.podiums, 1);
  assert.equal(celina.bestPoints, 12);

  const ela = statsByName.get('Ela');
  assert.equal(ela.matches, 1);
  assert.equal(ela.wins, 0);
  assert.equal(ela.seconds, 0);
  assert.equal(ela.thirds, 0);
  assert.equal(ela.podiums, 0);
  assert.equal(ela.bestPoints, 1);
});

test('GET /api/v1/multiplayer/stats/players ignores legacy stored place for ties', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer stats tests');
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
     VALUES ('Ada', true), ('Borys', true), ('Celina', true)
     RETURNING id, name`
  );

  const playersByName = new Map(playersResult.rows.map((row) => [row.name, row]));

  const gameResult = await pool.query(`SELECT id FROM multiplayer_games WHERE code = 'uno'`);
  const gameId = gameResult.rows[0].id;

  const createResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-02-12',
      players: [
        { playerId: playersByName.get('Ada').id, totalPoints: 14 },
        { playerId: playersByName.get('Borys').id, totalPoints: 14 },
        { playerId: playersByName.get('Celina').id, totalPoints: 2 },
      ],
    }),
  });
  assert.equal(createResponse.status, 201);
  const createdMatch = await createResponse.json();

  // Simulate historical inconsistent places in DB for equal points.
  await pool.query(
    `UPDATE multiplayer_match_players
     SET place = CASE
       WHEN player_id = $1 THEN 1
       WHEN player_id = $2 THEN 2
       WHEN player_id = $3 THEN 3
       ELSE place
     END
     WHERE match_id = $4`,
    [
      playersByName.get('Ada').id,
      playersByName.get('Borys').id,
      playersByName.get('Celina').id,
      createdMatch.id,
    ]
  );

  const statsResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/stats/players?gameId=${gameId}`
  );
  assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json();
  const byName = new Map(stats.map((row) => [row.name, row]));

  assert.equal(byName.get('Ada').wins, 1);
  assert.equal(byName.get('Ada').seconds, 0);
  assert.equal(byName.get('Ada').thirds, 0);

  assert.equal(byName.get('Borys').wins, 1);
  assert.equal(byName.get('Borys').seconds, 0);
  assert.equal(byName.get('Borys').thirds, 0);

  assert.equal(byName.get('Celina').wins, 0);
  assert.equal(byName.get('Celina').seconds, 0);
  assert.equal(byName.get('Celina').thirds, 1);
});
