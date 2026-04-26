const { applyMigrations } = require('./migrations');
const { seedGames, seedTicketToRideVariants, seedMultiplayerGames } = require('./seed');

async function resetPublicSchema(client) {
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO public');
  await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER');
}

async function bootstrapDatabaseSchema(client) {
  await applyMigrations(client);
  await seedGames(client);
  await seedTicketToRideVariants(client);
  await seedMultiplayerGames(client);
}

module.exports = {
  bootstrapDatabaseSchema,
  resetPublicSchema,
};
