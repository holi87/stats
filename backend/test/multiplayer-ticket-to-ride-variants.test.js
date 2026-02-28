const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');

test('GET /api/v1/multiplayer/ticket-to-ride/variants returns active variants', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run multiplayer variants tests');
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
    `INSERT INTO ticket_to_ride_variants (code, name, is_active)
     VALUES ('inactive_variant', 'Nieaktywne', false)
     ON CONFLICT (code) DO UPDATE SET is_active = false`
  );

  const response = await fetch(
    `http://localhost:${port}/api/v1/multiplayer/ticket-to-ride/variants`
  );
  assert.equal(response.status, 200);
  const variants = await response.json();

  assert.ok(variants.length > 0);
  const byCode = new Map(variants.map((row) => [row.code, row]));
  assert.ok(byCode.has('europe'));
  assert.ok(!byCode.has('inactive_variant'));
});
