const { loadEnv } = require('../env');
const { getPool, closePool } = require('../db');

const REQUIRED_TRAIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function formatDate(value) {
  if (!value) {
    return 'n/a';
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function logSection(title) {
  console.log(`\n=== ${title} ===`);
}

async function tableExists(pool, tableName) {
  const result = await pool.query('SELECT to_regclass($1) AS regclass', [tableName]);
  return Boolean(result.rows[0]?.regclass);
}

async function run() {
  loadEnv();

  const pool = getPool();

  try {
    logSection('Ticket to Ride legacy tables');
    const matchesTable = 'public.ticket_to_ride_matches';
    const playersTable = 'public.ticket_to_ride_match_players';

    const hasMatches = await tableExists(pool, matchesTable);
    const hasPlayers = await tableExists(pool, playersTable);

    console.log(`ticket_to_ride_matches: ${hasMatches ? 'FOUND' : 'MISSING'}`);
    console.log(`ticket_to_ride_match_players: ${hasPlayers ? 'FOUND' : 'MISSING'}`);

    if (!hasMatches && !hasPlayers) {
      console.log('Legacy tables not present. Nothing to diagnose.');
      return;
    }

    if (hasMatches) {
      logSection('Legacy matches summary');
      const summary = await pool.query(
        `SELECT
          COUNT(*)::int AS count,
          MIN(played_on) AS min_played_on,
          MAX(played_on) AS max_played_on
         FROM ticket_to_ride_matches`
      );
      const row = summary.rows[0] || {};
      console.log(`matches count: ${row.count ?? 0}`);
      console.log(`played_on min: ${formatDate(row.min_played_on)}`);
      console.log(`played_on max: ${formatDate(row.max_played_on)}`);
    }

    if (hasPlayers) {
      logSection('Legacy match players summary');
      const summary = await pool.query(
        `SELECT COUNT(*)::int AS count FROM ticket_to_ride_match_players`
      );
      const row = summary.rows[0] || {};
      console.log(`match players count: ${row.count ?? 0}`);
    }

    if (hasMatches && hasPlayers) {
      logSection('Potential issues');
      const orphaned = await pool.query(
        `SELECT COUNT(*)::int AS count
         FROM ticket_to_ride_match_players mp
         LEFT JOIN ticket_to_ride_matches m ON m.id = mp.match_id
         WHERE m.id IS NULL`
      );
      console.log(`match players without match: ${orphaned.rows[0]?.count ?? 0}`);
    }

    if (hasPlayers) {
      const invalidQuery = `
        SELECT COUNT(*)::int AS count
        FROM ticket_to_ride_match_players
        WHERE
          trains_counts IS NULL
          OR jsonb_typeof(trains_counts) <> 'object'
          OR NOT (trains_counts ?& $1::text[])
          OR EXISTS (
            SELECT 1
            FROM jsonb_object_keys(trains_counts) AS k
            WHERE k NOT IN ('1','2','3','4','5','6','7','8','9')
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_each_text(trains_counts) AS kv(key, value)
            WHERE kv.value !~ '^[0-9]+$'
          )
      `;

      const invalid = await pool.query(invalidQuery, [REQUIRED_TRAIN_KEYS]);
      const invalidCount = invalid.rows[0]?.count ?? 0;
      console.log(`trains_counts invalid rows: ${invalidCount}`);

      if (invalidCount > 0) {
        const samples = await pool.query(
          `SELECT id, match_id, player_id
           FROM ticket_to_ride_match_players
           WHERE
             trains_counts IS NULL
             OR jsonb_typeof(trains_counts) <> 'object'
             OR NOT (trains_counts ?& $1::text[])
             OR EXISTS (
               SELECT 1
               FROM jsonb_object_keys(trains_counts) AS k
               WHERE k NOT IN ('1','2','3','4','5','6','7','8','9')
             )
             OR EXISTS (
               SELECT 1
               FROM jsonb_each_text(trains_counts) AS kv(key, value)
               WHERE kv.value !~ '^[0-9]+$'
             )
           LIMIT 5`,
          [REQUIRED_TRAIN_KEYS]
        );

        console.log('invalid trains_counts samples (max 5):');
        samples.rows.forEach((row) => {
          console.log(`- id=${row.id} match_id=${row.match_id} player_id=${row.player_id}`);
        });
      }
    }
  } finally {
    await closePool();
  }
}

run().catch((error) => {
  console.error('Ticket to Ride legacy diagnostics failed:', error);
  process.exitCode = 1;
});
