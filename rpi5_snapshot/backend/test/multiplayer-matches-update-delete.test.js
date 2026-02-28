const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

function buildTrainsCounts(entries) {
  const counts = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 };
  entries.forEach(([key, value]) => {
    counts[String(key)] = value;
  });
  return counts;
}

test('PATCH /api/v1/multiplayer/matches updates players and places', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer matches tests');
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
     VALUES ('Ada', true), ('Borys', true)
     RETURNING id, name`
  );

  const playerA = playersResult.rows.find((row) => row.name === 'Ada');
  const playerB = playersResult.rows.find((row) => row.name === 'Borys');

  const gameResult = await pool.query(
    `SELECT id FROM multiplayer_games WHERE code = 'uno'`
  );
  const gameId = gameResult.rows[0].id;

  const createResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-01-23',
      players: [
        { playerId: playerA.id, totalPoints: 10 },
        { playerId: playerB.id, totalPoints: 5 },
      ],
    }),
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.players.find((row) => row.playerId === playerA.id).place, 1);
  assert.equal(created.players.find((row) => row.playerId === playerB.id).place, 2);

  const patchResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/matches/${created.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        players: [
          { playerId: playerA.id, totalPoints: 3 },
          { playerId: playerB.id, totalPoints: 12 },
        ],
      }),
    }
  );

  assert.equal(patchResponse.status, 200);
  const updated = await patchResponse.json();
  const byId = new Map(updated.players.map((row) => [row.playerId, row]));
  assert.equal(byId.get(playerB.id).place, 1);
  assert.equal(byId.get(playerA.id).place, 2);
});

test('DELETE /api/v1/multiplayer/matches removes match and related records', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer matches tests');
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
     VALUES ('Ada', true), ('Borys', true)
     RETURNING id, name`
  );

  const playerA = playersResult.rows.find((row) => row.name === 'Ada');
  const playerB = playersResult.rows.find((row) => row.name === 'Borys');

  const gameResult = await pool.query(
    `SELECT id FROM multiplayer_games WHERE code = 'ticket_to_ride'`
  );
  const gameId = gameResult.rows[0].id;

  const variantResult = await pool.query(
    `SELECT id FROM ticket_to_ride_variants WHERE code = 'europe'`
  );
  const variantId = variantResult.rows[0].id;

  const createResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-01-24',
      ticketToRide: { variantId },
      players: [
        {
          playerId: playerA.id,
          ticketsPoints: -1,
          bonusPoints: 2,
          trainsCounts: buildTrainsCounts([[3, 1]]),
        },
        {
          playerId: playerB.id,
          ticketsPoints: 0,
          bonusPoints: 0,
          trainsCounts: buildTrainsCounts([[4, 1]]),
        },
      ],
    }),
  });

  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();

  const matchPlayersResult = await pool.query(
    'SELECT id FROM multiplayer_match_players WHERE match_id = $1',
    [created.id]
  );
  const matchPlayerIds = matchPlayersResult.rows.map((row) => row.id);
  assert.ok(matchPlayerIds.length > 0);

  const deleteResponse = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/matches/${created.id}`,
    { method: 'DELETE' }
  );
  assert.equal(deleteResponse.status, 204);

  const matchCheck = await pool.query('SELECT 1 FROM multiplayer_matches WHERE id = $1', [
    created.id,
  ]);
  assert.equal(matchCheck.rowCount, 0);

  const mpCheck = await pool.query(
    'SELECT 1 FROM multiplayer_match_players WHERE match_id = $1',
    [created.id]
  );
  assert.equal(mpCheck.rowCount, 0);

  const ttrMatchCheck = await pool.query(
    'SELECT 1 FROM multiplayer_ticket_to_ride_matches WHERE match_id = $1',
    [created.id]
  );
  assert.equal(ttrMatchCheck.rowCount, 0);

  const ttrDetailsCheck = await pool.query(
    'SELECT 1 FROM multiplayer_ticket_to_ride_player_details WHERE match_player_id = ANY($1::uuid[])',
    [matchPlayerIds]
  );
  assert.equal(ttrDetailsCheck.rowCount, 0);
});
