const { loadEnv } = require('../env');
const { getPool, closePool } = require('../db');

const SOURCE_SYSTEM = 'legacy_ticket_to_ride';
const DEFAULT_BATCH_SIZE = 100;

const TRAIN_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function comparePlaceCandidates(a, b) {
  if (b.total_points !== a.total_points) {
    return b.total_points - a.total_points;
  }
  if (b.trains_points !== a.trains_points) {
    return b.trains_points - a.trains_points;
  }
  if (b.bonus_points !== a.bonus_points) {
    return b.bonus_points - a.bonus_points;
  }
  if (b.tickets_points !== a.tickets_points) {
    return b.tickets_points - a.tickets_points;
  }
  return String(a.player_id).localeCompare(String(b.player_id));
}

function computePlaces(players) {
  const sorted = [...players].sort(comparePlaceCandidates);
  const placeByPlayer = new Map();
  sorted.forEach((player, index) => {
    placeByPlayer.set(player.player_id, index + 1);
  });
  return placeByPlayer;
}

function legacyPlacesMatch(players, computedPlaces) {
  if (!players.every((player) => Number.isInteger(player.place))) {
    return false;
  }
  return players.every((player) => computedPlaces.get(player.player_id) === player.place);
}

async function fetchLegacyMatch(pool, id) {
  const matchResult = await pool.query(
    `SELECT id, played_on, variant_id, notes, created_at, updated_at
     FROM ticket_to_ride_matches
     WHERE id = $1`,
    [id]
  );
  const match = matchResult.rows[0];
  if (!match) {
    return null;
  }

  const playersResult = await pool.query(
    `SELECT
        id,
        match_id,
        player_id,
        tickets_points,
        bonus_points,
        trains_counts,
        trains_points,
        total_points,
        place,
        created_at,
        updated_at
     FROM ticket_to_ride_match_players
     WHERE match_id = $1
     ORDER BY player_id ASC`,
    [id]
  );

  return { match, players: playersResult.rows };
}

async function ensureMultiplayerGame(pool) {
  const result = await pool.query(
    `SELECT id, code, scoring_type
     FROM multiplayer_games
     WHERE code = 'ticket_to_ride'`
  );
  const game = result.rows[0];
  if (!game) {
    throw new Error('Multiplayer game ticket_to_ride not found. Seed multiplayer games first.');
  }
  if (game.scoring_type !== 'TTR_CALCULATOR') {
    throw new Error('Multiplayer game ticket_to_ride has invalid scoring_type.');
  }
  return game;
}

async function countRemaining(pool) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM ticket_to_ride_matches m
     LEFT JOIN legacy_migration_map map
       ON map.source_system = $1 AND map.source_id = m.id
     WHERE map.source_id IS NULL`,
    [SOURCE_SYSTEM]
  );
  return result.rows[0]?.count ?? 0;
}

async function fetchBatchIds(pool, limit) {
  const result = await pool.query(
    `SELECT m.id
     FROM ticket_to_ride_matches m
     LEFT JOIN legacy_migration_map map
       ON map.source_system = $1 AND map.source_id = m.id
     WHERE map.source_id IS NULL
     ORDER BY m.played_on ASC, m.id ASC
     LIMIT $2`,
    [SOURCE_SYSTEM, limit]
  );
  return result.rows.map((row) => row.id);
}

async function validateTrainsCounts(pool, matchId) {
  const invalidResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM ticket_to_ride_match_players
     WHERE match_id = $1
       AND (
         trains_counts IS NULL
         OR jsonb_typeof(trains_counts) <> 'object'
         OR (jsonb_typeof(trains_counts) = 'object' AND NOT (trains_counts ?& $2::text[]))
         OR (
           jsonb_typeof(trains_counts) = 'object'
           AND EXISTS (
             SELECT 1
             FROM jsonb_object_keys(trains_counts) AS k
             WHERE k NOT IN ('1','2','3','4','5','6','7','8','9')
           )
         )
         OR (
           jsonb_typeof(trains_counts) = 'object'
           AND EXISTS (
             SELECT 1
             FROM jsonb_each_text(trains_counts) AS kv(key, value)
             WHERE kv.value !~ '^[0-9]+$'
           )
         )
       )`,
    [matchId, TRAIN_KEYS]
  );
  return invalidResult.rows[0]?.count ?? 0;
}

async function migrateMatch(pool, gameId, legacyMatchId) {
  const legacyData = await fetchLegacyMatch(pool, legacyMatchId);
  if (!legacyData) {
    return { migrated: false, skipped: true, recalculated: false };
  }

  const { match, players } = legacyData;
  if (!players || players.length === 0) {
    throw new Error(`Legacy match ${legacyMatchId} has no players.`);
  }

  const invalidTrainsCounts = await validateTrainsCounts(pool, legacyMatchId);
  if (invalidTrainsCounts > 0) {
    throw new Error(
      `Legacy match ${legacyMatchId} has ${invalidTrainsCounts} invalid trains_counts rows.`
    );
  }

  const computedPlaces = computePlaces(players);
  const useLegacyPlaces = legacyPlacesMatch(players, computedPlaces);
  const recalculated = !useLegacyPlaces;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const matchInsert = await client.query(
      `INSERT INTO multiplayer_matches (
        game_id,
        played_on,
        notes,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id`,
      [
        gameId,
        match.played_on,
        match.notes ?? null,
        match.created_at ?? new Date(),
        match.updated_at ?? new Date(),
      ]
    );

    const multiplayerMatchId = matchInsert.rows[0].id;

    await client.query(
      `INSERT INTO multiplayer_ticket_to_ride_matches (match_id, variant_id)
       VALUES ($1, $2)`,
      [multiplayerMatchId, match.variant_id]
    );

    const playerValues = [];
    const playerPlaceholders = [];
    players.forEach((player, index) => {
      const baseIndex = index * 6;
      const place = useLegacyPlaces ? player.place : computedPlaces.get(player.player_id);
      playerValues.push(
        multiplayerMatchId,
        player.player_id,
        player.total_points,
        place,
        player.created_at ?? new Date(),
        player.updated_at ?? new Date()
      );
      playerPlaceholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6})`
      );
    });

    const matchPlayersResult = await client.query(
      `INSERT INTO multiplayer_match_players (
        match_id,
        player_id,
        total_points,
        place,
        created_at,
        updated_at
      ) VALUES ${playerPlaceholders.join(', ')}
      RETURNING id, player_id`,
      playerValues
    );

    const matchPlayerById = new Map(
      matchPlayersResult.rows.map((row) => [row.player_id, row.id])
    );

    const detailValues = [];
    const detailPlaceholders = [];
    players.forEach((player, index) => {
      const matchPlayerId = matchPlayerById.get(player.player_id);
      const baseIndex = index * 5;
      detailValues.push(
        matchPlayerId,
        player.tickets_points,
        player.bonus_points,
        player.trains_counts,
        player.trains_points
      );
      detailPlaceholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5})`
      );
    });

    await client.query(
      `INSERT INTO multiplayer_ticket_to_ride_player_details (
        match_player_id,
        tickets_points,
        bonus_points,
        trains_counts,
        trains_points
      ) VALUES ${detailPlaceholders.join(', ')}`,
      detailValues
    );

    await client.query(
      `INSERT INTO legacy_migration_map (source_system, source_id, target_id)
       VALUES ($1, $2, $3)`,
      [SOURCE_SYSTEM, match.id, multiplayerMatchId]
    );

    await client.query('COMMIT');

    return { migrated: true, skipped: false, recalculated };
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && error.code === '23505') {
      // unique violation for legacy_migration_map, treat as already migrated
      return { migrated: false, skipped: true, recalculated: false };
    }
    throw error;
  } finally {
    client.release();
  }
}

async function run() {
  loadEnv();

  const pool = getPool();
  const batchSizeRaw = Number(process.env.MIGRATION_BATCH_SIZE ?? DEFAULT_BATCH_SIZE);
  const batchSize = Number.isFinite(batchSizeRaw) && batchSizeRaw > 0 ? batchSizeRaw : DEFAULT_BATCH_SIZE;

  try {
    const legacyMatchesExists = await pool.query('SELECT to_regclass($1) AS regclass', [
      'public.ticket_to_ride_matches',
    ]);
    const legacyPlayersExists = await pool.query('SELECT to_regclass($1) AS regclass', [
      'public.ticket_to_ride_match_players',
    ]);
    const migrationMapExists = await pool.query('SELECT to_regclass($1) AS regclass', [
      'public.legacy_migration_map',
    ]);

    if (!legacyMatchesExists.rows[0]?.regclass || !legacyPlayersExists.rows[0]?.regclass) {
      console.log('Legacy Ticket to Ride tables not found. Nothing to migrate.');
      return;
    }

    if (!migrationMapExists.rows[0]?.regclass) {
      throw new Error('legacy_migration_map table not found. Apply migrations before running.');
    }

    const game = await ensureMultiplayerGame(pool);

    const totalRemaining = await countRemaining(pool);
    if (totalRemaining === 0) {
      console.log('No legacy Ticket to Ride matches to migrate.');
      return;
    }

    console.log(`Migrating legacy Ticket to Ride matches: ${totalRemaining} pending...`);

    let migratedCount = 0;
    let skippedCount = 0;
    let recalculatedCount = 0;

    // Loop until no more matches without a mapping.
    // Each match is migrated in its own transaction to avoid partial data.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batchIds = await fetchBatchIds(pool, batchSize);
      if (batchIds.length === 0) {
        break;
      }

      for (const matchId of batchIds) {
        // eslint-disable-next-line no-await-in-loop
        const result = await migrateMatch(pool, game.id, matchId);
        if (result.migrated) {
          migratedCount += 1;
          if (result.recalculated) {
            recalculatedCount += 1;
          }
        } else if (result.skipped) {
          skippedCount += 1;
        }
      }

      console.log(
        `Progress: migrated ${migratedCount}/${totalRemaining} (skipped ${skippedCount}, recalculated ${recalculatedCount})`
      );
    }

    console.log('Migration finished.');
    console.log(
      `Summary: migrated ${migratedCount}, skipped ${skippedCount}, recalculated places ${recalculatedCount}.`
    );
  } finally {
    await closePool();
  }
}

run().catch((error) => {
  console.error('Legacy Ticket to Ride migration failed:', error);
  process.exitCode = 1;
});
