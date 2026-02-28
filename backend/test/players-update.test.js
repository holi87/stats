const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('PATCH /api/v1/players returns 404 for missing player', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run players update tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const response = await fetch(`http://localhost:${port}/api/v1/players/${randomUUID()}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Missing' }),
  });

  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error.code, 'NOT_FOUND');
});

test('PATCH /api/v1/players returns 409 for name conflict', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run players update tests');
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

  const create = async (name) =>
    fetch(`http://localhost:${port}/api/v1/players`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });

  const responseA = await create('Kuba');
  assert.equal(responseA.status, 201);
  const kuba = await responseA.json();

  const responseB = await create('Ania');
  assert.equal(responseB.status, 201);
  const ania = await responseB.json();

  const conflictResponse = await fetch(`http://localhost:${port}/api/v1/players/${ania.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'kUBA' }),
  });

  assert.equal(conflictResponse.status, 409);
  const payload = await conflictResponse.json();
  assert.equal(payload.error.code, 'CONFLICT');
});

test('DELETE /api/v1/players/:id removes player and related stats', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run players update tests');
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

  const playerAResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ($1, true)
     RETURNING id`,
    [`Delete Me ${Date.now()}`]
  );
  const playerBResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ($1, true)
     RETURNING id`,
    [`Teammate ${Date.now()}`]
  );
  const playerAId = playerAResult.rows[0].id;
  const playerBId = playerBResult.rows[0].id;

  const gameResult = await pool.query(`SELECT id FROM games WHERE code = 'uno'`);
  const gameId = gameResult.rows[0].id;

  await pool.query(
    `INSERT INTO matches (game_id, played_on, player_a_id, player_b_id, score_a, score_b)
     VALUES ($1, CURRENT_DATE, $2, $3, 10, 8)`,
    [gameId, playerAId, playerBId]
  );

  const multiplayerGameResult = await pool.query(
    `SELECT id FROM multiplayer_games WHERE code = 'uno'`
  );
  const multiplayerGameId = multiplayerGameResult.rows[0].id;

  const multiplayerMatchResult = await pool.query(
    `INSERT INTO multiplayer_matches (game_id, played_on, notes)
     VALUES ($1, CURRENT_DATE, 'delete player')
     RETURNING id`,
    [multiplayerGameId]
  );
  const multiplayerMatchId = multiplayerMatchResult.rows[0].id;

  await pool.query(
    `INSERT INTO multiplayer_match_players (match_id, player_id, total_points, place)
     VALUES ($1, $2, 12, 1), ($1, $3, 9, 2)`,
    [multiplayerMatchId, playerAId, playerBId]
  );

  const response = await fetch(`http://localhost:${port}/api/v1/players/${playerAId}`, {
    method: 'DELETE',
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.player.id, playerAId);
  assert.equal(payload.deletedOneVsOneMatches, 1);
  assert.equal(payload.deletedMultiplayerParticipations, 1);
  assert.equal(payload.deletedOrphanMultiplayerMatches, 0);

  const playerCheck = await pool.query('SELECT COUNT(*)::int AS total FROM players WHERE id = $1', [
    playerAId,
  ]);
  assert.equal(playerCheck.rows[0].total, 0);
});
