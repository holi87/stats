const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('GET /api/v1/matches/export.csv returns CSV', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run matches export tests');
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

  const gameResult = await pool.query('SELECT id, name FROM games WHERE code = $1', ['rummikub']);
  const game = gameResult.rows[0];

  const playersResult = await pool.query(
    `INSERT INTO players (name) VALUES ('Kuba'), ('Ola') RETURNING id, name`
  );
  const playerA = playersResult.rows.find((row) => row.name === 'Kuba');
  const playerB = playersResult.rows.find((row) => row.name === 'Ola');

  await pool.query(
    `INSERT INTO matches (game_id, played_on, player_a_id, player_b_id, score_a, score_b)
     VALUES ($1, '2026-01-29', $2, $3, 12, 9)`,
    [game.id, playerA.id, playerB.id]
  );

  const response = await fetch(`http://localhost:${port}/api/v1/matches/export.csv?gameId=${game.id}`);

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get('content-type'),
    'text/csv; charset=utf-8'
  );
  assert.equal(
    response.headers.get('content-disposition'),
    'attachment; filename="matches.csv"'
  );

  const csv = await response.text();
  const lines = csv.trim().split('\n');

  assert.equal(lines[0], 'playedOn,game,playerA,scoreA,playerB,scoreB,winner,notes');
  assert.equal(lines.length, 2);

  assert.equal(
    lines[1],
    `2026-01-29,${game.name},Kuba,12,Ola,9,A,`
  );
});
