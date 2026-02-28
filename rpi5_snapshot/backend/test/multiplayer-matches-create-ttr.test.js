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

test('POST /api/v1/multiplayer/matches creates TTR match with computed points', async (t) => {
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
     VALUES ('Ada', true), ('Borys', true), ('Celina', true)
     RETURNING id, name`
  );

  const playerA = playersResult.rows.find((row) => row.name === 'Ada');
  const playerB = playersResult.rows.find((row) => row.name === 'Borys');
  const playerC = playersResult.rows.find((row) => row.name === 'Celina');

  const gameResult = await pool.query(
    `SELECT id, code, display_name AS "displayName", scoring_type AS "scoringType"
     FROM multiplayer_games
     WHERE code = 'ticket_to_ride'`
  );
  assert.equal(gameResult.rowCount, 1);
  const game = gameResult.rows[0];
  assert.equal(game.scoringType, 'TTR_CALCULATOR');

  const variantResult = await pool.query(
    `SELECT id, code, name, is_active FROM ticket_to_ride_variants WHERE code = 'europe'`
  );
  assert.equal(variantResult.rowCount, 1);
  const variant = variantResult.rows[0];
  assert.equal(variant.is_active, true);

  const response = await fetch(`http://localhost:${port}/api/v1/multiplayer/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: game.id,
      playedOn: '2026-01-21',
      notes: 'TTR multiplayer',
      ticketToRide: { variantId: variant.id },
      players: [
        {
          playerId: playerA.id,
          ticketsPoints: -2,
          bonusPoints: 4,
          trainsCounts: buildTrainsCounts([[5, 1]]),
        },
        {
          playerId: playerB.id,
          ticketsPoints: 0,
          bonusPoints: 2,
          trainsCounts: buildTrainsCounts([[5, 1]]),
        },
        {
          playerId: playerC.id,
          ticketsPoints: 5,
          bonusPoints: 0,
          trainsCounts: buildTrainsCounts([[4, 1]]),
        },
      ],
    }),
  });

  assert.equal(response.status, 201);
  const payload = await response.json();

  assert.equal(payload.game.code, 'ticket_to_ride');
  assert.equal(payload.ticketToRide.variant.code, 'europe');
  assert.equal(payload.players.length, 3);
  assert.equal(payload.ticketToRide.playersDetails.length, 3);

  const byPlayerId = new Map(payload.players.map((row) => [row.playerId, row]));
  assert.equal(byPlayerId.get(playerA.id).place, 1);
  assert.equal(byPlayerId.get(playerB.id).place, 2);
  assert.equal(byPlayerId.get(playerC.id).place, 3);

  const ttrById = new Map(payload.ticketToRide.playersDetails.map((row) => [row.playerId, row]));
  assert.equal(ttrById.get(playerA.id).trainsPoints, 10);
  assert.equal(ttrById.get(playerA.id).totalPoints, 12);
  assert.equal(ttrById.get(playerB.id).trainsPoints, 10);
  assert.equal(ttrById.get(playerB.id).totalPoints, 12);
  assert.equal(ttrById.get(playerC.id).trainsPoints, 7);
  assert.equal(ttrById.get(playerC.id).totalPoints, 12);
});
