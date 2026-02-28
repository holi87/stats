const { getPool } = require('../db');
const {
  getMultiplayerGameByIdOrThrow,
  listMultiplayerGameOptions,
} = require('./multiplayer-games-service');

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
    `SELECT
      p.id AS player_id,
      p.name AS name,
      COUNT(mp.id)::int AS matches,
      COALESCE(SUM(CASE WHEN mp.place = 1 THEN 1 ELSE 0 END), 0)::int AS wins,
      COALESCE(SUM(CASE WHEN mp.place = 2 THEN 1 ELSE 0 END), 0)::int AS seconds,
      COALESCE(SUM(CASE WHEN mp.place = 3 THEN 1 ELSE 0 END), 0)::int AS thirds,
      COALESCE(SUM(CASE WHEN mp.place <= 3 THEN 1 ELSE 0 END), 0)::int AS podiums,
      COALESCE(AVG(mp.total_points), 0)::float AS avg_points,
      COALESCE(MAX(mp.total_points), 0)::int AS best_points
    FROM multiplayer_match_players mp
    JOIN multiplayer_matches m ON m.id = mp.match_id
    JOIN players p ON p.id = mp.player_id
    WHERE p.is_active = true AND m.game_id = $1
    GROUP BY p.id, p.name
    ORDER BY wins DESC, seconds DESC, thirds DESC, avg_points DESC
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

  const optionStatsResult = await pool.query(
    `SELECT
      go.id AS option_id,
      go.code AS option_code,
      go.display_name AS option_display_name,
      p.id AS player_id,
      p.name AS name,
      COUNT(mp.id)::int AS matches,
      COALESCE(SUM(CASE WHEN mp.place = 1 THEN 1 ELSE 0 END), 0)::int AS wins,
      COALESCE(SUM(CASE WHEN mp.place = 2 THEN 1 ELSE 0 END), 0)::int AS seconds,
      COALESCE(SUM(CASE WHEN mp.place = 3 THEN 1 ELSE 0 END), 0)::int AS thirds,
      COALESCE(SUM(CASE WHEN mp.place <= 3 THEN 1 ELSE 0 END), 0)::int AS podiums,
      COALESCE(AVG(mp.total_points), 0)::float AS avg_points,
      COALESCE(MAX(mp.total_points), 0)::int AS best_points
    FROM multiplayer_match_options mo
    JOIN multiplayer_game_options go ON go.id = mo.option_id
    JOIN multiplayer_match_players mp ON mp.match_id = mo.match_id
    JOIN multiplayer_matches m ON m.id = mo.match_id
    JOIN players p ON p.id = mp.player_id
    WHERE p.is_active = true AND m.game_id = $1
    GROUP BY go.id, go.code, go.display_name, p.id, p.name
    ORDER BY go.display_name ASC, wins DESC, seconds DESC, thirds DESC, avg_points DESC`,
    [gameId]
  );

  const rowsByOption = new Map();
  optionStatsResult.rows.forEach((row) => {
    const optionId = row.option_id;
    if (!rowsByOption.has(optionId)) {
      rowsByOption.set(optionId, []);
    }
    rowsByOption.get(optionId).push(mapPlayerStats(row));
  });

  const byOption = options.map((option) => ({
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
