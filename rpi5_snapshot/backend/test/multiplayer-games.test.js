const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');

function uniqueCode(prefix = 'game') {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`.slice(0, 64);
}

test('GET /api/v1/multiplayer/games returns only active games', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const pool = getPool();
  const activeCode = uniqueCode('active');
  const inactiveCode = uniqueCode('inactive');
  await pool.query(
    `INSERT INTO multiplayer_games (code, display_name, scoring_type, min_players, max_players, is_active)
     VALUES
      ($1, $2, 'MANUAL_POINTS', 2, 5, true),
      ($3, $4, 'MANUAL_POINTS', 2, 5, false)`,
    [activeCode, `Active ${activeCode}`, inactiveCode, `Inactive ${inactiveCode}`]
  );

  const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/games`);
  assert.equal(response.status, 200);
  const games = await response.json();

  assert.ok(Array.isArray(games));
  assert.ok(games.length > 0);

  const byCode = new Map(games.map((game) => [game.code, game]));
  assert.ok(byCode.has(activeCode), 'active games should be listed');
  assert.ok(!byCode.has(inactiveCode), 'inactive games should be filtered out');

  games.forEach((game) => {
    assert.ok(typeof game.id === 'string');
    assert.ok(typeof game.code === 'string');
    assert.ok(typeof game.displayName === 'string');
    assert.ok(typeof game.scoringType === 'string');
    assert.ok(Number.isInteger(game.minPlayers));
    assert.ok(Number.isInteger(game.maxPlayers));
    assert.equal(typeof game.isActive, 'boolean');
    assert.equal(game.isActive, true);
    assert.equal(typeof game.optionsCount, 'number');
    assert.equal(typeof game.requiresOption, 'boolean');
  });
});

test('GET /api/v1/multiplayer/games?includeInactive=true includes inactive games', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = uniqueCode('inactive');

  const pool = getPool();
  await pool.query(
    `INSERT INTO multiplayer_games (code, display_name, scoring_type, min_players, max_players, is_active)
     VALUES ($1, $2, 'MANUAL_POINTS', 2, 5, false)`,
    [code, `Inactive ${code}`]
  );

  const response = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/games?includeInactive=true`
  );
  assert.equal(response.status, 200);
  const games = await response.json();
  const game = games.find((item) => item.code === code);

  assert.ok(game, 'expected inactive game in includeInactive list');
  assert.equal(game.isActive, false);
});

test('GET /api/v1/multiplayer/games returns active games even when quick menu flag is disabled', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = uniqueCode('duel-only');
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
    ) VALUES ($1, $2, 'MANUAL_POINTS', 2, 2, false, false, true)`,
    [code, `Duel only ${code}`]
  );

  const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/games`);
  assert.equal(response.status, 200);
  const list = await response.json();
  assert.equal(list.some((item) => item.code === code), true);

  const fullResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/games?includeInactive=true`
  );
  assert.equal(fullResponse.status, 200);
  const fullList = await fullResponse.json();
  assert.equal(fullList.some((item) => item.code === code), true);
});

test('GET /api/v1/multiplayer/games/:code/options returns active game options', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const response = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/games/ticket_to_ride/options`
  );
  assert.equal(response.status, 200);
  const options = await response.json();

  assert.ok(Array.isArray(options));
  assert.ok(options.length > 0);
  assert.ok(options.some((option) => option.code === 'europe'));
  assert.ok(options.every((option) => option.gameId));
  assert.ok(options.every((option) => option.isActive === true));
});

test('POST /api/v1/multiplayer/games creates manual multiplayer game', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = uniqueCode('dixit');

  const createResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      displayName: `Dixit ${code}`,
      minPlayers: 3,
      maxPlayers: 5,
    }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  assert.equal(created.code, code);
  assert.equal(created.displayName, `Dixit ${code}`);
  assert.equal(created.scoringType, 'MANUAL_POINTS');
  assert.equal(created.minPlayers, 3);
  assert.equal(created.maxPlayers, 5);
  assert.equal(created.showInQuickMenu, true);
  assert.equal(created.requiresOption, false);
});

test('POST /api/v1/multiplayer/games creates custom calculator game with fields', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = uniqueCode('custom');

  const createResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code,
      displayName: `Custom ${code}`,
      scoringType: 'CUSTOM_CALCULATOR',
      minPlayers: 2,
      maxPlayers: 4,
      showInQuickMenu: true,
      customCalculator: {
        fields: [
          {
            label: 'Misje',
            description: 'Punkty za ukończone misje',
            pointsPerUnit: 3,
          },
          {
            label: 'Kary',
            pointsPerUnit: -2,
          },
        ],
      },
    }),
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.code, code);
  assert.equal(created.scoringType, 'CUSTOM_CALCULATOR');
  assert.equal(created.customFieldsCount, 2);

  const fieldsResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/games/${code}/calculator-fields`
  );
  assert.equal(fieldsResponse.status, 200);
  const fields = await fieldsResponse.json();
  assert.equal(Array.isArray(fields), true);
  assert.equal(fields.length, 2);
  assert.equal(fields[0].label, 'Misje');
  assert.equal(fields[0].pointsPerUnit, 3);
  assert.equal(fields[1].label, 'Kary');
  assert.equal(fields[1].pointsPerUnit, -2);
});

test('PATCH /api/v1/multiplayer/games/:code updates quick-menu flag and active status', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = uniqueCode('status');
  const pool = getPool();

  await pool.query(
    `INSERT INTO multiplayer_games (code, display_name, scoring_type, min_players, max_players, is_active)
     VALUES ($1, $2, 'MANUAL_POINTS', 2, 5, true)`,
    [code, `Status ${code}`]
  );

  const patchResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/games/${code}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ showInQuickMenu: false, isActive: false }),
  });
  assert.equal(patchResponse.status, 200);
  const patched = await patchResponse.json();
  assert.equal(patched.showInQuickMenu, false);
  assert.equal(patched.isActive, false);

  const activeListResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/games`);
  assert.equal(activeListResponse.status, 200);
  const activeList = await activeListResponse.json();
  assert.equal(activeList.some((item) => item.code === code), false);

  const fullListResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/games?includeInactive=true`
  );
  assert.equal(fullListResponse.status, 200);
  const fullList = await fullListResponse.json();
  assert.equal(fullList.some((item) => item.code === code && item.isActive === false), true);
});

test('PATCH /api/v1/multiplayer/games/:code updates display name and players range', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = uniqueCode('edit');
  const pool = getPool();

  await pool.query(
    `INSERT INTO multiplayer_games (code, display_name, scoring_type, min_players, max_players, is_active)
     VALUES ($1, $2, 'MANUAL_POINTS', 2, 5, true)`,
    [code, `Edit ${code}`]
  );

  const patchResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/games/${code}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: `Updated ${code}`,
      minPlayers: 3,
      maxPlayers: 4,
    }),
  });
  assert.equal(patchResponse.status, 200);
  const patched = await patchResponse.json();

  assert.equal(patched.code, code);
  assert.equal(patched.displayName, `Updated ${code}`);
  assert.equal(patched.minPlayers, 3);
  assert.equal(patched.maxPlayers, 4);
});

test('PATCH /api/v1/multiplayer/games/:code validates min/max players relation', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = uniqueCode('invalid');
  const pool = getPool();

  await pool.query(
    `INSERT INTO multiplayer_games (code, display_name, scoring_type, min_players, max_players, is_active)
     VALUES ($1, $2, 'MANUAL_POINTS', 2, 5, true)`,
    [code, `Invalid ${code}`]
  );

  const patchResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/games/${code}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      minPlayers: 5,
      maxPlayers: 3,
    }),
  });
  assert.equal(patchResponse.status, 400);
  const payload = await patchResponse.json();
  assert.equal(payload.error.code, 'VALIDATION_ERROR');
});

test('DELETE /api/v1/multiplayer/games/:code removes manual game and related matches', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  const code = uniqueCode('delete');
  const playerAName = `Delete A ${code}`;
  const playerBName = `Delete B ${code}`;
  const pool = getPool();

  const gameInsert = await pool.query(
    `INSERT INTO multiplayer_games (code, display_name, scoring_type, min_players, max_players, is_active)
     VALUES ($1, $2, 'MANUAL_POINTS', 2, 4, true)
     RETURNING id`,
    [code, `Delete ${code}`]
  );
  const gameId = gameInsert.rows[0].id;

  const playerAInsert = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ($1, true)
     RETURNING id`,
    [playerAName]
  );
  const playerBInsert = await pool.query(
    `INSERT INTO players (name, is_active)
     VALUES ($1, true)
     RETURNING id`,
    [playerBName]
  );
  const playerAId = playerAInsert.rows[0].id;
  const playerBId = playerBInsert.rows[0].id;

  const matchInsert = await pool.query(
    `INSERT INTO multiplayer_matches (game_id, played_on, notes)
     VALUES ($1, CURRENT_DATE, 'test delete')
     RETURNING id`,
    [gameId]
  );
  const matchId = matchInsert.rows[0].id;

  await pool.query(
    `INSERT INTO multiplayer_match_players (match_id, player_id, total_points, place)
     VALUES ($1, $2, 24, 1), ($1, $3, 12, 2)`,
    [matchId, playerAId, playerBId]
  );

  const deleteResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/games/${code}`, {
    method: 'DELETE',
  });
  assert.equal(deleteResponse.status, 200);
  const deleted = await deleteResponse.json();
  assert.equal(deleted.code, code);
  assert.equal(deleted.deletedMatches, 1);

  const gameCheck = await pool.query('SELECT COUNT(*)::int AS total FROM multiplayer_games WHERE id = $1', [
    gameId,
  ]);
  assert.equal(gameCheck.rows[0].total, 0);

  const matchesCheck = await pool.query(
    'SELECT COUNT(*)::int AS total FROM multiplayer_matches WHERE game_id = $1',
    [gameId]
  );
  assert.equal(matchesCheck.rows[0].total, 0);
});

test('DELETE /api/v1/multiplayer/games/:code blocks games with dedicated calculators', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer games tests');
  }

  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const response = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/games/ticket_to_ride`,
    { method: 'DELETE' }
  );
  assert.equal(response.status, 409);

  const payload = await response.json();
  assert.equal(payload.error.code, 'CONFLICT');
});
