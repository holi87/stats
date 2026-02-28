const { test } = require('node:test');
const assert = require('node:assert/strict');

const { startServer } = require('../src/index');

test('health endpoint responds with ok', async (t) => {
  const { server } = await startServer({ port: 0 });

  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  const response = await fetch(`http://localhost:${port}/api/v1/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
