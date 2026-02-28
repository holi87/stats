const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('GET /api/v1/stats/players returns aggregated stats', async (t) => {
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

  const gameRows = await pool.query(
    "SELECT id, code FROM games WHERE code IN ('rummikub', 'cortex') ORDER BY code"
  );
  const gameByCode = new Map(gameRows.rows.map((row) => [row.code, row.id]));
  const game1 = gameByCode.get('rummikub');
  const game2 = gameByCode.get('cortex');

  const playersResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ('Kuba', true), ('Ola', true), ('Ina', false)
     RETURNING id, name, is_active`
  );

  const kuba = playersResult.rows.find((row) => row.name === 'Kuba');
  const ola = playersResult.rows.find((row) => row.name === 'Ola');
  const ina = playersResult.rows.find((row) => row.name === 'Ina');

  await pool.query(
    `INSERT INTO matches (game_id, played_on, player_a_id, player_b_id, score_a, score_b)
     VALUES
      ($1, '2026-01-10', $2, $3, 10, 5),
      ($1, '2026-01-11', $2, $3, 7, 7),
      ($1, '2026-01-12', $3, $2, 3, 6),
      ($4, '2026-01-13', $5, $2, 4, 2)
    `,
    [game1, kuba.id, ola.id, game2, ina.id]
  );

  const response = await fetch(`http://localhost:${port}/api/v1/stats/players?gameId=${game1}`);
  assert.equal(response.status, 200);
  const stats = await response.json();

  assert.equal(stats.length, 2);
  assert.equal(stats[0].name, 'Kuba');
  assert.equal(stats[0].wins, 2);
  assert.equal(stats[0].draws, 1);
  assert.equal(stats[0].matches, 3);
  assert.equal(stats[0].pointsFor, 23);
  assert.equal(stats[0].pointsAgainst, 15);

  assert.equal(stats[1].name, 'Ola');
  assert.equal(stats[1].wins, 0);
  assert.equal(stats[1].draws, 1);
  assert.equal(stats[1].matches, 3);
  assert.equal(stats[1].pointsFor, 15);
  assert.equal(stats[1].pointsAgainst, 23);

  const allResponse = await fetch(
    `http://localhost:${port}/api/v1/stats/players?gameId=${game1}&activeOnly=false`
  );
  assert.equal(allResponse.status, 200);
  const allStats = await allResponse.json();

  const inactive = allStats.find((row) => row.name === 'Ina');
  assert.ok(inactive);
  assert.equal(inactive.wins, 0);
  assert.equal(inactive.draws, 0);
  assert.equal(inactive.matches, 0);
  assert.equal(inactive.pointsFor, 0);
  assert.equal(inactive.pointsAgainst, 0);
});
