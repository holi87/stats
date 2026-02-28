const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { getPool, closePool } = require('../src/db');
const { resetDatabase } = require('../src/test-utils/reset-db');

test('players list and create', async (t) => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run players tests');
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

  const responseA = await create('  Kuba  ');
  assert.equal(responseA.status, 201);
  const kuba = await responseA.json();
  assert.equal(kuba.name, 'Kuba');
  assert.equal(kuba.isActive, true);

  const responseB = await create('Ania');
  assert.equal(responseB.status, 201);

  const listResponse = await fetch(`http://localhost:${port}/api/v1/players`);
  assert.equal(listResponse.status, 200);
  const players = await listResponse.json();

  const names = players.map((player) => player.name);
  const sortedNames = [...names].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(names, sortedNames);

  const inactiveResponse = await fetch(
    `http://localhost:${port}/api/v1/players?active=false`
  );
  assert.equal(inactiveResponse.status, 200);
  const inactivePlayers = await inactiveResponse.json();
  assert.equal(inactivePlayers.length, 0);

  const conflictResponse = await create('kUBA');
  assert.equal(conflictResponse.status, 409);
  const conflictPayload = await conflictResponse.json();
  assert.equal(conflictPayload.error.code, 'CONFLICT');
});
