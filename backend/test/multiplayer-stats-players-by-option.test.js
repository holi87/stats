const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('multiplayer option-aware stats and match filtering', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer stats tests');
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
    `INSERT INTO players (name, is_active)
     VALUES ('Ada', true), ('Borys', true), ('Celina', true)
     RETURNING id, name`
  );
  const playersByName = new Map(playersResult.rows.map((row) => [row.name, row.id]));

  const gameResult = await pool.query(`SELECT id FROM multiplayer_games WHERE code = 'terraforming_mars'`);
  const gameId = gameResult.rows[0].id;

  const optionsResult = await pool.query(
    `SELECT id, code FROM multiplayer_game_options WHERE game_id = $1 AND code IN ('base', 'prelude')`,
    [gameId]
  );
  const optionByCode = new Map(optionsResult.rows.map((row) => [row.code, row.id]));

  const createMatch = async ({ playedOn, optionId, scores }) => {
    const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId,
        optionId,
        playedOn,
        players: scores,
      }),
    });
    assert.equal(response.status, 201);
    return response.json();
  };

  await createMatch({
    playedOn: '2026-02-01',
    optionId: optionByCode.get('base'),
    scores: [
      {
        playerId: playersByName.get('Ada'),
        totalPoints: 64,
      },
      {
        playerId: playersByName.get('Borys'),
        totalPoints: 47,
      },
    ],
  });

  await createMatch({
    playedOn: '2026-02-02',
    optionId: optionByCode.get('prelude'),
    scores: [
      {
        playerId: playersByName.get('Ada'),
        totalPoints: 37,
      },
      {
        playerId: playersByName.get('Celina'),
        totalPoints: 59,
      },
    ],
  });

  const statsResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/stats/players-by-option?gameId=${gameId}`
  );
  assert.equal(statsResponse.status, 200);
  const statsPayload = await statsResponse.json();

  assert.ok(Array.isArray(statsPayload.overall));
  assert.ok(Array.isArray(statsPayload.byOption));
  assert.ok(statsPayload.byOption.some((entry) => entry.option.code === 'base'));
  assert.ok(statsPayload.byOption.some((entry) => entry.option.code === 'prelude'));

  const baseStats = statsPayload.byOption.find((entry) => entry.option.code === 'base');
  assert.equal(baseStats.stats.length, 2);

  const filteredResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/matches?gameId=${gameId}&optionId=${optionByCode.get('base')}`
  );
  assert.equal(filteredResponse.status, 200);
  const filteredPayload = await filteredResponse.json();

  assert.equal(filteredPayload.items.length, 1);
  assert.equal(filteredPayload.items[0].option.code, 'base');
});
