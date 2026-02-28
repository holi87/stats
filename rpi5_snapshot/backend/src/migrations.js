const fs = require('node:fs/promises');
const path = require('node:path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function getMigrationFiles() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();
}

async function hasMigration(client, id) {
  const result = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id]);
  return result.rowCount > 0;
}

async function applyMigration(client, id, sql) {
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function applyMigrations(client) {
  await ensureMigrationsTable(client);

  const files = await getMigrationFiles();
  for (const file of files) {
    // eslint-disable-next-line no-await-in-loop
    const alreadyApplied = await hasMigration(client, file);
    if (alreadyApplied) {
      continue;
    }

    const sqlPath = path.join(MIGRATIONS_DIR, file);
    // eslint-disable-next-line no-await-in-loop
    const sql = await fs.readFile(sqlPath, 'utf8');

    // eslint-disable-next-line no-await-in-loop
    await applyMigration(client, file, sql);
  }
}

module.exports = {
  applyMigrations,
};
