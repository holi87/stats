const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');

test('GET /api/v1/multiplayer/games/:code returns game or 404', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer game tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const pool = getPool();
  await pool.query(
    `INSERT INTO multiplayer_games (code, display_name, scoring_type, min_players, max_players, is_active)
     VALUES ('inactive_game', 'Inactive', 'MANUAL_POINTS', 2, 5, false)
     ON CONFLICT (code) DO UPDATE SET is_active = false`
  );

  const okResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/games/ticket_to_ride`
  );
  assert.equal(okResponse.status, 200);
  const game = await okResponse.json();
  assert.equal(game.code, 'ticket_to_ride');
  assert.equal(game.displayName, 'Pociągi');
  assert.equal(game.scoringType, 'TTR_CALCULATOR');
  assert.equal(game.minPlayers, 2);
  assert.equal(game.maxPlayers, 5);

  const notFoundResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/games/does_not_exist`
  );
  assert.equal(notFoundResponse.status, 404);

  const inactiveResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/games/inactive_game`
  );
  assert.equal(inactiveResponse.status, 404);
});
