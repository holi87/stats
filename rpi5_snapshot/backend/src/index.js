const express = require('express');
const { Client } = require('pg');
const { loadEnv } = require('./env');
const { applyMigrations } = require('./migrations');
const { seedGames, seedTicketToRideVariants, seedMultiplayerGames } = require('./seed');
const { corsMiddleware, requireJsonBody, notFoundHandler, errorHandler } = require('./middleware');
const { validateBody } = require('./validation');
const gamesRouter = require('./routes/games');
const playersRouter = require('./routes/players');
const matchesRouter = require('./routes/matches');
const statsRouter = require('./routes/stats');
const headToHeadRouter = require('./routes/stats-head-to-head');
const multiplayerGamesRouter = require('./routes/multiplayer-games');
const multiplayerMatchesRouter = require('./routes/multiplayer-matches');
const multiplayerStatsRouter = require('./routes/multiplayer-stats');
const multiplayerPodiumsRouter = require('./routes/multiplayer-podiums');
const multiplayerTicketToRideVariantsRouter = require('./routes/multiplayer-ticket-to-ride-variants');
const ticketToRideVariantsRouter = require('./routes/ticket-to-ride-variants');
const ticketToRideMatchesRouter = require('./routes/ticket-to-ride-matches');

const DEFAULT_DB_RETRIES = 30;
const DEFAULT_DB_RETRY_DELAY_MS = 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isBootstrapEnabled = () => String(process.env.DB_BOOTSTRAP || '').toLowerCase() === 'true';

async function connectWithRetry(databaseUrl) {
  const maxRetriesRaw = Number(process.env.DB_CONNECT_RETRIES ?? DEFAULT_DB_RETRIES);
  const delayRaw = Number(process.env.DB_CONNECT_DELAY_MS ?? DEFAULT_DB_RETRY_DELAY_MS);
  const maxRetries =
    Number.isFinite(maxRetriesRaw) && maxRetriesRaw > 0 ? maxRetriesRaw : DEFAULT_DB_RETRIES;
  const delayMs = Number.isFinite(delayRaw) && delayRaw >= 0 ? delayRaw : DEFAULT_DB_RETRY_DELAY_MS;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      console.warn(
        `Database not ready (attempt ${attempt}/${maxRetries}): ${error?.message || error}`
      );
      try {
        await client.end();
      } catch (_) {
        // ignore close errors
      }
      if (attempt < maxRetries) {
        console.log(`Retrying database connection in ${delayMs}ms...`);
        await wait(delayMs);
      }
    }
  }

  throw lastError;
}

async function initializeDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Backend cannot start.');
    throw new Error('Missing DATABASE_URL');
  }

  console.log('Connecting to database...');
  const client = await connectWithRetry(databaseUrl);

  try {
    console.log('Database connection established.');
    if (isBootstrapEnabled()) {
      console.log('Running database migrations...');
      await applyMigrations(client);
      console.log('Seeding games...');
      await seedGames(client);
      console.log('Seeding Ticket to Ride variants...');
      await seedTicketToRideVariants(client);
      console.log('Seeding multiplayer games...');
      await seedMultiplayerGames(client);
    } else {
      console.log('DB bootstrap disabled (set DB_BOOTSTRAP=true to run migrations and seeds).');
      await client.query('SELECT 1');
    }
    console.log('Database initialization complete.');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  } finally {
    try {
      await client.end();
    } catch (_) {
      // ignore close errors
    }
  }
}

function createApp() {
  const app = express();

  app.use(express.json());
  app.use(corsMiddleware);

  const apiRouter = express.Router();
  apiRouter.use(requireJsonBody);

  apiRouter.get('/health', validateBody({}), (_req, res) => {
    res.json({ status: 'ok' });
  });
  apiRouter.use(gamesRouter);
  apiRouter.use(playersRouter);
  apiRouter.use(matchesRouter);
  apiRouter.use(statsRouter);
  apiRouter.use(headToHeadRouter);
  apiRouter.use(multiplayerGamesRouter);
  apiRouter.use(multiplayerMatchesRouter);
  apiRouter.use(multiplayerStatsRouter);
  apiRouter.use(multiplayerPodiumsRouter);
  apiRouter.use(multiplayerTicketToRideVariantsRouter);
  apiRouter.use(ticketToRideVariantsRouter);
  apiRouter.use(ticketToRideMatchesRouter);

  app.use('/api/v1', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

async function startServer(options = {}) {
  loadEnv();
  console.log('Starting backend service...');
  await initializeDatabase();

  const requestedPort = options.port ?? process.env.PORT;
  const parsedPort =
    requestedPort !== undefined && requestedPort !== null ? Number(requestedPort) : undefined;
  const port = Number.isFinite(parsedPort) ? parsedPort : 3000;
  const app = createApp();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve({ app, server });
    });
    server.on('error', reject);
  });
}

if (require.main === module) {
  startServer()
    .then(({ server }) => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : process.env.PORT;
      console.log(`Backend listening on port ${port}`);
    })
    .catch((error) => {
      console.error('Failed to start backend:', error);
      process.exit(1);
    });
}

module.exports = {
  createApp,
  startServer,
  initializeDatabase,
  loadEnv,
};
