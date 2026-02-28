const { Client } = require('pg');
const { loadEnv } = require('./env');
const { applyMigrations } = require('./migrations');
const { seedGames, seedTicketToRideVariants, seedMultiplayerGames } = require('./seed');

async function resetDev() {
  loadEnv();

  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to reset database in production.');
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
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');

    await applyMigrations(client);
    await seedGames(client);
    await seedTicketToRideVariants(client);
    await seedMultiplayerGames(client);

    console.log('Database reset completed.');
  } catch (error) {
    console.error('Database reset failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

resetDev();
