const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('GET /api/v1/stats/players returns wins and points per game', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run stats tests');
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

  const gameCode = `test_1v1_${randomUUID()}`;
  const gameName = `Test 1v1 ${randomUUID()}`;
  const gameResult = await pool.query(
    'INSERT INTO games (code, name) VALUES ($1, $2) RETURNING id',
    [gameCode, gameName]
  );
  const gameId = gameResult.rows[0].id;

  const playersResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ('A', true), ('B', true)
     RETURNING id, name`
  );

  const playerA = playersResult.rows.find((row) => row.name === 'A');
  const playerB = playersResult.rows.find((row) => row.name === 'B');

  await pool.query(
    `INSERT INTO matches (game_id, played_on, player_a_id, player_b_id, score_a, score_b)
     VALUES
      ($1, '2026-01-15', $2, $3, 4, 1),
      ($1, '2026-01-16', $3, $2, 3, 2)
    `,
    [gameId, playerA.id, playerB.id]
  );

  const response = await fetch(
    `http://localhost:${port}/api/v1/stats/players?gameId=${gameId}`
  );
  assert.equal(response.status, 200);
  const stats = await response.json();

  const statsByName = new Map(stats.map((row) => [row.name, row]));
  const statsA = statsByName.get('A');
  const statsB = statsByName.get('B');

  assert.ok(statsA);
  assert.equal(statsA.matches, 2);
  assert.equal(statsA.wins, 1);
  assert.equal(statsA.draws, 0);
  assert.equal(statsA.pointsFor, 6);
  assert.equal(statsA.pointsAgainst, 4);

  assert.ok(statsB);
  assert.equal(statsB.matches, 2);
  assert.equal(statsB.wins, 1);
  assert.equal(statsB.draws, 0);
  assert.equal(statsB.pointsFor, 4);
  assert.equal(statsB.pointsAgainst, 6);
});
