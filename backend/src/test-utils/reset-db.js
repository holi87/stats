const { bootstrapDatabaseSchema, resetPublicSchema } = require('../db-bootstrap');

async function resetDatabase(pool) {
  const client = await pool.connect();
  try {
    await resetPublicSchema(client);
    await bootstrapDatabaseSchema(client);
  } finally {
    client.release();
  }
}

module.exports = {
  resetDatabase,
};
