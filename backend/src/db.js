const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set.');
    }
    pool = new Pool({ connectionString: databaseUrl });
  }

  return pool;
}

async function closePool() {
  if (pool) {
    const currentPool = pool;
    pool = undefined;
    await currentPool.end();
  }
}

module.exports = {
  getPool,
  closePool,
};
