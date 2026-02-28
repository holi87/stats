const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('GET /api/v1/matches list and detail', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run matches tests');
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

  const gameResult = await pool.query('SELECT id, code, name FROM games ORDER BY name ASC LIMIT 1');
  const game = gameResult.rows[0];

  const playersResult = await pool.query(
    `INSERT INTO players (name) VALUES ('Kuba'), ('Ola') RETURNING id, name`
  );
  const playerA = playersResult.rows.find((row) => row.name === 'Kuba');
  const playerB = playersResult.rows.find((row) => row.name === 'Ola');

  const matchResult = await pool.query(
    `INSERT INTO matches (game_id, played_on, player_a_id, player_b_id, score_a, score_b, notes)
     VALUES ($1, '2026-01-29', $2, $3, 12, 9, 'test')
     RETURNING id`,
    [game.id, playerA.id, playerB.id]
  );
  const matchId = matchResult.rows[0].id;

  const listResponse = await fetch(`http://localhost:${port}/api/v1/matches`);
  assert.equal(listResponse.status, 200);
  const listPayload = await listResponse.json();

  assert.ok(Array.isArray(listPayload.items));
  assert.ok(listPayload.items.length >= 1);
  assert.equal(listPayload.total >= 1, true);
  assert.equal(listPayload.limit, 50);
  assert.equal(listPayload.offset, 0);

  const item = listPayload.items[0];
  assert.equal(item.game.code, game.code);
  assert.equal(item.playerA.name, 'Kuba');
  assert.equal(item.playerB.name, 'Ola');
  assert.equal(item.winner, 'A');

  const detailResponse = await fetch(`http://localhost:${port}/api/v1/matches/${matchId}`);
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();

  assert.equal(detail.id, matchId);
  assert.equal(detail.notes, 'test');
  assert.ok(detail.createdAt);
  assert.ok(detail.updatedAt);

  const filteredResponse = await fetch(
    `http://localhost:${port}/api/v1/matches?playerId=${playerA.id}`
  );
  assert.equal(filteredResponse.status, 200);
  const filtered = await filteredResponse.json();
  assert.ok(filtered.items.some((match) => match.id === matchId));
});
