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

test('GET /api/v1/ticket-to-ride/stats/players recomputes tie places from points', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run Ticket to Ride stats tests');
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

  const gameResult = await pool.query(`SELECT id FROM multiplayer_games WHERE code = 'ticket_to_ride'`);
  const gameId = gameResult.rows[0].id;

  const variantResult = await pool.query(`SELECT id FROM ticket_to_ride_variants WHERE code = 'europe'`);
  const variantId = variantResult.rows[0].id;

  const createResponse = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      playedOn: '2026-02-11',
      ticketToRide: { variantId },
      players: [
        {
          playerId: playersByName.get('Ada'),
          ticketsPoints: 0,
          bonusPoints: 0,
          trainsCounts: buildTrainsCounts([[4, 1]]),
        },
        {
          playerId: playersByName.get('Borys'),
          ticketsPoints: 3,
          bonusPoints: 0,
          trainsCounts: buildTrainsCounts([[3, 1]]),
        },
        {
          playerId: playersByName.get('Celina'),
          ticketsPoints: 0,
          bonusPoints: 0,
          trainsCounts: buildTrainsCounts([[2, 1]]),
        },
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
      playersByName.get('Ada'),
      playersByName.get('Borys'),
      playersByName.get('Celina'),
      createdMatch.id,
    ]
  );

  const statsResponse = await fetch(
    `http://localhost:${port}/api/v1/ticket-to-ride/stats/players?variantId=${variantId}`
  );
  assert.equal(statsResponse.status, 200);
  const stats = await statsResponse.json();
  const byName = new Map(stats.map((row) => [row.name, row]));

  assert.equal(byName.get('Ada').matches, 1);
  assert.equal(byName.get('Ada').wins, 1);
  assert.equal(byName.get('Ada').podiums, 1);

  assert.equal(byName.get('Borys').matches, 1);
  assert.equal(byName.get('Borys').wins, 1);
  assert.equal(byName.get('Borys').podiums, 1);

  assert.equal(byName.get('Celina').matches, 1);
  assert.equal(byName.get('Celina').wins, 0);
  assert.equal(byName.get('Celina').podiums, 1);
});
