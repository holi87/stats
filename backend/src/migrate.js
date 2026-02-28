const { Client } = require('pg');
const { loadEnv } = require('./env');
const { applyMigrations } = require('./migrations');

async function migrate() {
  loadEnv();

  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run dev migrations in production.');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await applyMigrations(client);
    console.log('Migrations applied.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
