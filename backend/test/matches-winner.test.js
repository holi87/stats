const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('GET /api/v1/matches/:id calculates winner A/B/DRAW', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run matches winner tests');
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
    `INSERT INTO players (name) VALUES ('Ada'), ('Bartek') RETURNING id, name`
  );
  const playerA = playersResult.rows.find((row) => row.name === 'Ada');
  const playerB = playersResult.rows.find((row) => row.name === 'Bartek');

  const insertMatch = async (playedOn, scoreA, scoreB) => {
    const result = await pool.query(
      `INSERT INTO matches (game_id, played_on, player_a_id, player_b_id, score_a, score_b)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [gameId, playedOn, playerA.id, playerB.id, scoreA, scoreB]
    );
    return result.rows[0].id;
  };

  const matchA = await insertMatch('2026-01-10', 10, 5);
  const matchB = await insertMatch('2026-01-11', 2, 8);
  const matchDraw = await insertMatch('2026-01-12', 7, 7);

  const fetchWinner = async (id) => {
    const response = await fetch(`http://localhost:${port}/api/v1/matches/${id}`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    return payload.winner;
  };

  assert.equal(await fetchWinner(matchA), 'A');
  assert.equal(await fetchWinner(matchB), 'B');
  assert.equal(await fetchWinner(matchDraw), 'DRAW');
});
