const { getPool } = require('../db');
const {
  getMultiplayerGameByIdOrThrow,
  listMultiplayerGameOptions,
} = require('./multiplayer-games-service');
const { isBaseGameOption } = require('./multiplayer-options-utils');

function mapPlayerStats(row) {
  return {
    playerId: row.player_id,
    name: row.name,
    matches: row.matches,
    wins: row.wins,
    seconds: row.seconds,
    thirds: row.thirds,
    podiums: row.podiums,
    avgPoints: row.avg_points,
    bestPoints: row.best_points,
  };
}

async function listMultiplayerPlayerStats({ gameId }) {
  const pool = getPool();
  await getMultiplayerGameByIdOrThrow(gameId);

  const result = await pool.query(
    `WITH ranked_players AS (
       SELECT
         mp.match_id,
         mp.player_id,
         mp.total_points,
         RANK() OVER (PARTITION BY mp.match_id ORDER BY mp.total_points DESC)::int AS computed_place
       FROM multiplayer_match_players mp
       JOIN multiplayer_matches m ON m.id = mp.match_id
       WHERE m.game_id = $1
     )
     SELECT
       p.id AS player_id,
       p.name AS name,
       COUNT(rp.player_id)::int AS matches,
       COALESCE(SUM(CASE WHEN rp.computed_place = 1 THEN 1 ELSE 0 END), 0)::int AS wins,
       COALESCE(SUM(CASE WHEN rp.computed_place = 2 THEN 1 ELSE 0 END), 0)::int AS seconds,
       COALESCE(SUM(CASE WHEN rp.computed_place = 3 THEN 1 ELSE 0 END), 0)::int AS thirds,
       COALESCE(SUM(CASE WHEN rp.computed_place <= 3 THEN 1 ELSE 0 END), 0)::int AS podiums,
       COALESCE(AVG(rp.total_points), 0)::float AS avg_points,
       COALESCE(MAX(rp.total_points), 0)::int AS best_points
     FROM ranked_players rp
     JOIN players p ON p.id = rp.player_id
     WHERE p.is_active = true
     GROUP BY p.id, p.name
     ORDER BY wins DESC, seconds DESC, thirds DESC, avg_points DESC, p.name ASC
    `,
    [gameId]
  );

  return result.rows.map(mapPlayerStats);
}

async function listMultiplayerPlayerStatsByOption({ gameId }) {
  const pool = getPool();
  await getMultiplayerGameByIdOrThrow(gameId);

  const [overall, options] = await Promise.all([
    listMultiplayerPlayerStats({ gameId }),
    listMultiplayerGameOptions({ gameId }),
  ]);
  const selectableOptions = options.filter((option) => !isBaseGameOption(option));
  const selectableOptionIds = new Set(selectableOptions.map((option) => option.id));

  const optionStatsResult = await pool.query(
    `WITH ranked_players AS (
       SELECT
         mp.match_id,
         mp.player_id,
         mp.total_points,
         RANK() OVER (PARTITION BY mp.match_id ORDER BY mp.total_points DESC)::int AS computed_place
       FROM multiplayer_match_players mp
       JOIN multiplayer_matches m ON m.id = mp.match_id
       WHERE m.game_id = $1
     )
     SELECT
       go.id AS option_id,
       go.code AS option_code,
       go.display_name AS option_display_name,
       p.id AS player_id,
       p.name AS name,
       COUNT(rp.player_id)::int AS matches,
       COALESCE(SUM(CASE WHEN rp.computed_place = 1 THEN 1 ELSE 0 END), 0)::int AS wins,
       COALESCE(SUM(CASE WHEN rp.computed_place = 2 THEN 1 ELSE 0 END), 0)::int AS seconds,
       COALESCE(SUM(CASE WHEN rp.computed_place = 3 THEN 1 ELSE 0 END), 0)::int AS thirds,
       COALESCE(SUM(CASE WHEN rp.computed_place <= 3 THEN 1 ELSE 0 END), 0)::int AS podiums,
       COALESCE(AVG(rp.total_points), 0)::float AS avg_points,
       COALESCE(MAX(rp.total_points), 0)::int AS best_points
     FROM multiplayer_match_options mo
     JOIN multiplayer_game_options go ON go.id = mo.option_id
     JOIN ranked_players rp ON rp.match_id = mo.match_id
     JOIN players p ON p.id = rp.player_id
     WHERE p.is_active = true
     GROUP BY go.id, go.code, go.display_name, p.id, p.name
     ORDER BY go.display_name ASC, wins DESC, seconds DESC, thirds DESC, avg_points DESC, p.name ASC`,
    [gameId]
  );

  const rowsByOption = new Map();
  optionStatsResult.rows.forEach((row) => {
    const optionId = row.option_id;
    if (!selectableOptionIds.has(optionId)) {
      return;
    }
    if (!rowsByOption.has(optionId)) {
      rowsByOption.set(optionId, []);
    }
    rowsByOption.get(optionId).push(mapPlayerStats(row));
  });

  const byOption = selectableOptions.map((option) => ({
    option: {
      id: option.id,
      code: option.code,
      displayName: option.displayName,
    },
    stats: rowsByOption.get(option.id) || [],
  }));

  return {
    overall,
    byOption,
  };
}

module.exports = {
  listMultiplayerPlayerStats,
  listMultiplayerPlayerStatsByOption,
};
