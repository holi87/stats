const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('PATCH /api/v1/matches returns 404 for missing match', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run matches update tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const response = await fetch(`http://localhost:${port}/api/v1/matches/${randomUUID()}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scoreA: 5 }),
  });

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error.code, 'NOT_FOUND');
});

test('PATCH /api/v1/matches returns 400 for same player ids', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run matches update tests');
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

  const gameResult = await pool.query('SELECT id FROM games ORDER BY name ASC LIMIT 1');
  const gameId = gameResult.rows[0].id;

  const playersResult = await pool.query(
    `INSERT INTO players (name) VALUES ('Ala'), ('Olek') RETURNING id, name`
  );
  const playerA = playersResult.rows.find((row) => row.name === 'Ala');
  const playerB = playersResult.rows.find((row) => row.name === 'Olek');

  const matchResult = await pool.query(
    `INSERT INTO matches (game_id, played_on, player_a_id, player_b_id, score_a, score_b)
     VALUES ($1, '2026-01-29', $2, $3, 3, 4)
     RETURNING id`,
    [gameId, playerA.id, playerB.id]
  );
  const matchId = matchResult.rows[0].id;

  const response = await fetch(`http://localhost:${port}/api/v1/matches/${matchId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerAId: playerA.id, playerBId: playerA.id }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
});
