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

test('GET /api/v1/multiplayer/stats/podiums aggregates across games', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer podium tests');
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

  const playersByName = new Map(playersResult.rows.map((row) => [row.name, row]));

  const manualGameResult = await pool.query(
    `SELECT id FROM multiplayer_games WHERE code = 'uno'`
  );
  const manualGameId = manualGameResult.rows[0].id;

  const ttrGameResult = await pool.query(
    `SELECT id FROM multiplayer_games WHERE code = 'ticket_to_ride'`
  );
  const ttrGameId = ttrGameResult.rows[0].id;

  const variantResult = await pool.query(
    `SELECT id FROM ticket_to_ride_variants WHERE code = 'europe'`
  );
  const variantId = variantResult.rows[0].id;

  // Manual match
  let response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: manualGameId,
      playedOn: '2026-01-28',
      players: [
        { playerId: playersByName.get('Ada').id, totalPoints: 10 },
        { playerId: playersByName.get('Borys').id, totalPoints: 5 },
      ],
    }),
  });
  assert.equal(response.status, 201);

  // Ticket to Ride match
  response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: ttrGameId,
      playedOn: '2026-01-29',
      ticketToRide: { variantId },
      players: [
        {
          playerId: playersByName.get('Borys').id,
          ticketsPoints: 0,
          bonusPoints: 2,
          trainsCounts: buildTrainsCounts([[4, 1]]),
        },
        {
          playerId: playersByName.get('Celina').id,
          ticketsPoints: 1,
          bonusPoints: 0,
          trainsCounts: buildTrainsCounts([[3, 1]]),
        },
        {
          playerId: playersByName.get('Ada').id,
          ticketsPoints: -1,
          bonusPoints: 0,
          trainsCounts: buildTrainsCounts([[2, 1]]),
        },
      ],
    }),
  });
  assert.equal(response.status, 201);

  const statsResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/stats/podiums`);
  assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json();

  const byName = new Map(stats.map((row) => [row.name, row]));
  assert.equal(byName.get('Ada').wins, 1);
  assert.equal(byName.get('Ada').seconds, 0);
  assert.equal(byName.get('Ada').thirds, 1);
  assert.equal(byName.get('Ada').podiums, 2);

  assert.equal(byName.get('Borys').wins, 1);
  assert.equal(byName.get('Borys').seconds, 1);
  assert.equal(byName.get('Borys').thirds, 0);
  assert.equal(byName.get('Borys').podiums, 2);

  assert.equal(byName.get('Celina').wins, 0);
  assert.equal(byName.get('Celina').seconds, 1);
  assert.equal(byName.get('Celina').thirds, 0);
  assert.equal(byName.get('Celina').podiums, 1);
});

test('GET /api/v1/multiplayer/stats/podiums recomputes places from points for legacy tie rows', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer podium tests');
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

  const playersByName = new Map(playersResult.rows.map((row) => [row.name, row]));

  const manualGameResult = await pool.query(`SELECT id FROM multiplayer_games WHERE code = 'uno'`);
  const manualGameId = manualGameResult.rows[0].id;

  const createResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: manualGameId,
      playedOn: '2026-02-10',
      players: [
        { playerId: playersByName.get('Ada').id, totalPoints: 10 },
        { playerId: playersByName.get('Borys').id, totalPoints: 10 },
        { playerId: playersByName.get('Celina').id, totalPoints: 4 },
      ],
    }),
  });
  assert.equal(createResponse.status, 201);
  const createdMatch = await createResponse.json();

  // Simulate legacy inconsistent places saved in DB for a tie.
  await pool.query(
    `UPDATE multiplayer_match_players
     SET place = CASE
       WHEN player_id = $1 THEN 1
       WHEN player_id = $2 THEN 2
       WHEN player_id = $3 THEN 3
       ELSE place
     END
     WHERE match_id = $4`,
    [
      playersByName.get('Ada').id,
      playersByName.get('Borys').id,
      playersByName.get('Celina').id,
      createdMatch.id,
    ]
  );

  const statsResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/stats/podiums`);
  assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json();
  const byName = new Map(stats.map((row) => [row.name, row]));

  assert.equal(byName.get('Ada').wins, 1);
  assert.equal(byName.get('Ada').seconds, 0);
  assert.equal(byName.get('Ada').thirds, 0);

  assert.equal(byName.get('Borys').wins, 1);
  assert.equal(byName.get('Borys').seconds, 0);
  assert.equal(byName.get('Borys').thirds, 0);

  assert.equal(byName.get('Celina').wins, 0);
  assert.equal(byName.get('Celina').seconds, 0);
  assert.equal(byName.get('Celina').thirds, 1);
});
