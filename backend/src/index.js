const express = require('express');
const { Client } = require('pg');
const { loadEnv } = require('./env');
const { bootstrapDatabaseSchema, resetPublicSchema } = require('./db-bootstrap');
const { getPool } = require('./db');
const {
  corsMiddleware,
  requireJsonBody,
  requireAdminWriteAccess,
  notFoundHandler,
  errorHandler,
} = require('./middleware');
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
const adminDataRouter = require('./routes/admin-data');

const DEFAULT_DB_RETRIES = 30;
const DEFAULT_DB_RETRY_DELAY_MS = 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isBootstrapEnabled = () => String(process.env.DB_BOOTSTRAP || '').toLowerCase() === 'true';
const shouldResetTestDatabase = () =>
  process.env.NODE_ENV === 'test' &&
  String(process.env.DB_RESET_ON_BOOTSTRAP || '').toLowerCase() === 'true';

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
      if (shouldResetTestDatabase()) {
        console.log('Resetting test database schema...');
        await resetPublicSchema(client);
      }
      console.log('Running database migrations and seeds...');
      await bootstrapDatabaseSchema(client);
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

  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '2mb' }));
  app.use(corsMiddleware);

  const apiRouter = express.Router();
  apiRouter.use(requireJsonBody);

  apiRouter.get('/health', validateBody({}), (_req, res) => {
    res.json({ status: 'ok' });
  });
  apiRouter.get('/ready', validateBody({}), async (_req, res) => {
    const readiness = {
      database: false,
      schemaMigrations: false,
      coreTables: {
        games: false,
        players: false,
        matches: false,
        multiplayerGames: false,
        multiplayerMatches: false,
      },
      appliedMigrations: 0,
    };

    try {
      const pool = getPool();
      const tablesResult = await pool.query(
        `SELECT
          to_regclass('public.schema_migrations') IS NOT NULL AS schema_migrations,
          to_regclass('public.games') IS NOT NULL AS games,
          to_regclass('public.players') IS NOT NULL AS players,
          to_regclass('public.matches') IS NOT NULL AS matches,
          to_regclass('public.multiplayer_games') IS NOT NULL AS multiplayer_games,
          to_regclass('public.multiplayer_matches') IS NOT NULL AS multiplayer_matches`
      );
      const row = tablesResult.rows[0] || {};
      readiness.database = true;
      readiness.schemaMigrations = row.schema_migrations === true;
      readiness.coreTables = {
        games: row.games === true,
        players: row.players === true,
        matches: row.matches === true,
        multiplayerGames: row.multiplayer_games === true,
        multiplayerMatches: row.multiplayer_matches === true,
      };

      if (readiness.schemaMigrations) {
        const migrationsResult = await pool.query(
          'SELECT COUNT(*)::int AS applied_migrations FROM schema_migrations'
        );
        readiness.appliedMigrations = migrationsResult.rows[0]?.applied_migrations ?? 0;
      }

      const ready =
        readiness.database &&
        readiness.schemaMigrations &&
        Object.values(readiness.coreTables).every(Boolean) &&
        readiness.appliedMigrations > 0;

      return res.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        checks: readiness,
      });
    } catch (error) {
      return res.status(503).json({
        status: 'not_ready',
        checks: readiness,
        error: {
          message: error?.message || 'Database readiness check failed',
        },
      });
    }
  });
  apiRouter.use(requireAdminWriteAccess);
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
  apiRouter.use(adminDataRouter);

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
