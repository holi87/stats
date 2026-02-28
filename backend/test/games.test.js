const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');

test('GET /api/v1/games returns sorted list', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run games endpoint test');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const response = await fetch(`http://localhost:${port}/api/v1/games`);

  assert.equal(response.status, 200);

  const games = await response.json();
  assert.ok(Array.isArray(games));

  const names = games.map((game) => game.name);
  const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sortedNames);

  const codes = new Set(games.map((game) => game.code));
  for (const code of ['rummikub', 'cortex', 'boggle', 'uno']) {
    assert.ok(codes.has(code));
  }

  for (const game of games) {
    assert.ok(typeof game.id === 'string');
    assert.ok(typeof game.code === 'string');
    assert.ok(typeof game.name === 'string');
    assert.equal(game.isActive, true);
  }
});

test('GET /api/v1/games includes active manual 2-player multiplayer games', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run games endpoint test');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = `duel_${Date.now()}`;

  const pool = getPool();
  await pool.query(
    `INSERT INTO multiplayer_games (
      code,
      display_name,
      scoring_type,
      min_players,
      max_players,
      visible_in_one_vs_one,
      visible_in_multiplayer,
      is_active
    ) VALUES ($1, $2, 'MANUAL_POINTS', 2, 2, true, false, true)`,
    [code, `Duel ${code}`]
  );

  const response = await fetch(`http://localhost:${port}/api/v1/games`);
  assert.equal(response.status, 200);
  const games = await response.json();

  const duelGame = games.find((game) => game.code === code);
  assert.ok(duelGame, 'Expected active multiplayer 2-2 game to appear in /games');
  assert.equal(duelGame.name, `Duel ${code}`);
  assert.equal(duelGame.isActive, true);
});

test('GET /api/v1/games?includeInactive=true includes hidden games', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run games endpoint test');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = `hidden_game_${Date.now()}`;
  const pool = getPool();

  const insertResult = await pool.query(
    `INSERT INTO games (code, name, is_active)
     VALUES ($1, $2, false)
     RETURNING id`,
    [code, `Hidden ${code}`]
  );
  const gameId = insertResult.rows[0].id;

  const activeResponse = await fetch(`http://localhost:${port}/api/v1/games`);
  assert.equal(activeResponse.status, 200);
  const activeGames = await activeResponse.json();
  assert.equal(
    activeGames.some((game) => game.id === gameId),
    false,
    'Hidden game should not be returned without includeInactive'
  );

  const allResponse = await fetch(`http://localhost:${port}/api/v1/games?includeInactive=true`);
  assert.equal(allResponse.status, 200);
  const allGames = await allResponse.json();
  const hidden = allGames.find((game) => game.id === gameId);
  assert.ok(hidden);
  assert.equal(hidden.isActive, false);
});

test('PATCH /api/v1/games/:id toggles active flag', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run games endpoint test');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = `toggle_game_${Date.now()}`;
  const pool = getPool();

  const insertResult = await pool.query(
    `INSERT INTO games (code, name, is_active)
     VALUES ($1, $2, true)
     RETURNING id`,
    [code, `Toggle ${code}`]
  );
  const gameId = insertResult.rows[0].id;

  const patchResponse = await fetch(`http://localhost:${port}/api/v1/games/${gameId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive: false }),
  });
  assert.equal(patchResponse.status, 200);
  const patched = await patchResponse.json();
  assert.equal(patched.id, gameId);
  assert.equal(patched.isActive, false);

  const activeResponse = await fetch(`http://localhost:${port}/api/v1/games`);
  assert.equal(activeResponse.status, 200);
  const activeGames = await activeResponse.json();
  assert.equal(activeGames.some((game) => game.id === gameId), false);

  const includeInactiveResponse = await fetch(
    `http://localhost:${port}/api/v1/games?includeInactive=true`
  );
  assert.equal(includeInactiveResponse.status, 200);
  const includeInactiveGames = await includeInactiveResponse.json();
  assert.equal(includeInactiveGames.some((game) => game.id === gameId), true);
});

test('PATCH /api/v1/games/:id updates legacy game name', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run games endpoint test');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = `rename_game_${Date.now()}`;
  const pool = getPool();

  const insertResult = await pool.query(
    `INSERT INTO games (code, name, is_active)
     VALUES ($1, $2, true)
     RETURNING id`,
    [code, `Before ${code}`]
  );
  const gameId = insertResult.rows[0].id;
  const newName = `After ${code}`;

  const patchResponse = await fetch(`http://localhost:${port}/api/v1/games/${gameId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  assert.equal(patchResponse.status, 200);
  const patched = await patchResponse.json();
  assert.equal(patched.id, gameId);
  assert.equal(patched.name, newName);
  assert.equal(patched.isActive, true);

  const gamesResponse = await fetch(`http://localhost:${port}/api/v1/games?includeInactive=true`);
  assert.equal(gamesResponse.status, 200);
  const games = await gamesResponse.json();
  const updatedGame = games.find((game) => game.id === gameId);
  assert.ok(updatedGame);
  assert.equal(updatedGame.name, newName);
});

test('DELETE /api/v1/games/:id removes game and related 1v1 matches', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run games endpoint test');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = `delete_game_${Date.now()}`;

  const pool = getPool();
  const gameResult = await pool.query(
    `INSERT INTO games (code, name)
     VALUES ($1, $2)
     RETURNING id`,
    [code, `Delete ${code}`]
  );
  const gameId = gameResult.rows[0].id;

  const playerAResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ($1, true)
     RETURNING id`,
    [`Player A ${code}`]
  );
  const playerBResult = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ($1, true)
     RETURNING id`,
    [`Player B ${code}`]
  );

  await pool.query(
    `INSERT INTO matches (game_id, played_on, player_a_id, player_b_id, score_a, score_b)
     VALUES ($1, CURRENT_DATE, $2, $3, 3, 1)`,
    [gameId, playerAResult.rows[0].id, playerBResult.rows[0].id]
  );

  const deleteResponse = await fetch(`http://localhost:${port}/api/v1/games/${gameId}`, {
    method: 'DELETE',
  });
  assert.equal(deleteResponse.status, 200);
  const payload = await deleteResponse.json();
  assert.equal(payload.id, gameId);
  assert.equal(payload.code, code);
  assert.equal(payload.deletedMatches, 1);

  const gameCountResult = await pool.query('SELECT COUNT(*)::int AS total FROM games WHERE id = $1', [gameId]);
  assert.equal(gameCountResult.rows[0].total, 0);

  const matchesCountResult = await pool.query(
    'SELECT COUNT(*)::int AS total FROM matches WHERE game_id = $1',
    [gameId]
  );
  assert.equal(matchesCountResult.rows[0].total, 0);
});

test('DELETE /api/v1/games/:id returns 404 for missing game', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run games endpoint test');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const response = await fetch(`http://localhost:${port}/api/v1/games/${randomUUID()}`, {
    method: 'DELETE',
  });
  assert.equal(response.status, 404);
  const payload = await response.json();
  assert.equal(payload.error.code, 'NOT_FOUND');
});
