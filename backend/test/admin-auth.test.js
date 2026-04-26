const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/index');

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => resolve(server));
    server.on('error', reject);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function getBaseUrl(server) {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;
  return `http://localhost:${port}`;
}

test('write endpoints require admin token when ADMIN_TOKEN is configured', async (t) => {
  const previousToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'secret-token';

  const server = await listen(createApp());
  t.after(async () => {
    if (previousToken === undefined) {
      delete process.env.ADMIN_TOKEN;
    } else {
      process.env.ADMIN_TOKEN = previousToken;
    }
    await close(server);
  });

  const baseUrl = getBaseUrl(server);
  const missingTokenResponse = await fetch(`${baseUrl}/api/v1/players`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(missingTokenResponse.status, 403);

  const invalidPayloadResponse = await fetch(`${baseUrl}/api/v1/players`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': 'secret-token',
    },
    body: JSON.stringify({}),
  });
  assert.equal(invalidPayloadResponse.status, 400);
});

test('read endpoints do not require admin token', async (t) => {
  const previousToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'secret-token';

  const server = await listen(createApp());
  t.after(async () => {
    if (previousToken === undefined) {
      delete process.env.ADMIN_TOKEN;
    } else {
      process.env.ADMIN_TOKEN = previousToken;
    }
    await close(server);
  });

  const response = await fetch(`${getBaseUrl(server)}/api/v1/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
