const { getPool } = require('../db');

function mapPodiumStats(row) {
  return {
    playerId: row.player_id,
    name: row.name,
    wins: row.wins,
    seconds: row.seconds,
    thirds: row.thirds,
    podiums: row.podiums,
  };
}

async function listMultiplayerPodiumStats({ dateFrom, dateTo }) {
  const pool = getPool();
  const conditions = [];
  const params = [];

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`m.played_on >= $${params.length}`);
  }

  if (dateTo) {
    params.push(dateTo);
    conditions.push(`m.played_on <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query(
    `SELECT
      p.id AS player_id,
      p.name AS name,
      COALESCE(SUM(CASE WHEN mp.place = 1 THEN 1 ELSE 0 END), 0)::int AS wins,
      COALESCE(SUM(CASE WHEN mp.place = 2 THEN 1 ELSE 0 END), 0)::int AS seconds,
      COALESCE(SUM(CASE WHEN mp.place = 3 THEN 1 ELSE 0 END), 0)::int AS thirds,
      COALESCE(SUM(CASE WHEN mp.place <= 3 THEN 1 ELSE 0 END), 0)::int AS podiums
    FROM players p
    JOIN multiplayer_match_players mp ON mp.player_id = p.id
    JOIN multiplayer_matches m ON m.id = mp.match_id
    ${whereClause}
    GROUP BY p.id, p.name
    ORDER BY wins DESC, seconds DESC, thirds DESC, p.name ASC`,
    params
  );

  return result.rows.map(mapPodiumStats);
}

module.exports = {
  listMultiplayerPodiumStats,
};
