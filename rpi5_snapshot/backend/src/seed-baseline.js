const { Client } = require('pg');
const { loadEnv } = require('./env');
const { seedGames, seedTicketToRideVariants, seedMultiplayerGames } = require('./seed');

async function seedBaseline() {
  loadEnv();

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query('BEGIN');
    await seedGames(client);
    await seedTicketToRideVariants(client);
    await seedMultiplayerGames(client);
    await client.query('COMMIT');
    console.log('Baseline seed completed.');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // ignore rollback errors
    }
    console.error('Baseline seed failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedBaseline();
