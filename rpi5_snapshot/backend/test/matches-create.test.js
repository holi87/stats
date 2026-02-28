const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');

test('POST /api/v1/matches rejects same player ids', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run matches create tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const pool = getPool();
  const gameResult = await pool.query('SELECT id FROM games ORDER BY name ASC LIMIT 1');
  const gameId = gameResult.rows[0].id;

  const playerName = `Player-${randomUUID()}`;
  const playerResult = await pool.query(
    'INSERT INTO players (name) VALUES ($1) RETURNING id',
    [playerName]
  );
  const playerId = playerResult.rows[0].id;

  const response = await fetch(`http://localhost:${port}/api/v1/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-01-29',
      playerAId: playerId,
      playerBId: playerId,
      scoreA: 10,
      scoreB: 5,
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
});

test('POST /api/v1/matches rejects missing game', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run matches create tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const pool = getPool();
  const playerAName = `PlayerA-${randomUUID()}`;
  const playerBName = `PlayerB-${randomUUID()}`;

  const playerResults = await pool.query(
    'INSERT INTO players (name) VALUES ($1), ($2) RETURNING id',
    [playerAName, playerBName]
  );

  const [playerAId, playerBId] = playerResults.rows.map((row) => row.id);

  const response = await fetch(`http://localhost:${port}/api/v1/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: randomUUID(),
      playedOn: '2026-01-29',
      playerAId,
      playerBId,
      scoreA: 12,
      scoreB: 9,
      notes: 'test',
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
});
