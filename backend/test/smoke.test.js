const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');
const { closePool } = require('../src/db');

test('health endpoint responds with ok', async (t) => {
  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const response = await fetch(`http://localhost:${port}/api/v1/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('ready endpoint checks database and schema', async (t) => {
  const { server } = await startServer({ port: 0 });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await closePool();
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const response = await fetch(`http://localhost:${port}/api/v1/ready`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.status, 'ready');
  assert.equal(payload.checks.database, true);
  assert.equal(payload.checks.schemaMigrations, true);
  assert.equal(payload.checks.coreTables.players, true);
});
