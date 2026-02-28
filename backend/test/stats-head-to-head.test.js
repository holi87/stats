const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('GET /api/v1/stats/head-to-head aggregates wins', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run head-to-head tests');
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
    `INSERT INTO players (name) VALUES ('Kuba'), ('Ola'), ('Zenek') RETURNING id, name`
  );
  const kuba = playersResult.rows.find((row) => row.name === 'Kuba');
  const ola = playersResult.rows.find((row) => row.name === 'Ola');
  const zenek = playersResult.rows.find((row) => row.name === 'Zenek');

  await pool.query(
    `INSERT INTO matches (game_id, played_on, player_a_id, player_b_id, score_a, score_b)
     VALUES
      ($1, '2026-01-10', $2, $3, 10, 5),
      ($1, '2026-01-11', $3, $2, 7, 7),
      ($1, '2026-01-12', $2, $3, 2, 8),
      ($1, '2026-01-13', $4, $3, 4, 2)
    `,
    [gameId, kuba.id, ola.id, zenek.id]
  );

  const response = await fetch(
    `http://localhost:${port}/api/v1/stats/head-to-head?player1Id=${kuba.id}&player2Id=${ola.id}`
  );

  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.equal(payload.matches, 3);
  assert.equal(payload.player1Wins, 1);
  assert.equal(payload.player2Wins, 1);
  assert.equal(payload.draws, 1);
});

test('GET /api/v1/stats/head-to-head returns 404 for missing player', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run head-to-head tests');
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
    `INSERT INTO players (name) VALUES ('Kuba') RETURNING id`
  );
  const kubaId = playersResult.rows[0].id;

  const response = await fetch(
    `http://localhost:${port}/api/v1/stats/head-to-head?player1Id=${kubaId}&player2Id=${randomUUID()}`
  );

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error.code, 'NOT_FOUND');
});

test('GET /api/v1/stats/head-to-head returns 400 for same player', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run head-to-head tests');
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
    `INSERT INTO players (name) VALUES ('Kuba') RETURNING id`
  );
  const kubaId = playersResult.rows[0].id;

  const response = await fetch(
    `http://localhost:${port}/api/v1/stats/head-to-head?player1Id=${kubaId}&player2Id=${kubaId}`
  );

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
});
