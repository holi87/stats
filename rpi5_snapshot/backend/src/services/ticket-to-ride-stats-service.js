const { getPool } = require('../db');

async function listTicketToRidePlayerStats({ variantId }) {
  const pool = getPool();

  const params = [];
  const where = [`g.code = 'ticket_to_ride'`];

  if (variantId) {
    params.push(variantId);
    where.push(`mtm.variant_id = $${params.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const query = `
    SELECT
      p.id AS player_id,
      p.name,
      COUNT(mp.id)::int AS matches,
      COALESCE(SUM(CASE WHEN mp.place = 1 THEN 1 ELSE 0 END), 0)::int AS wins,
      COALESCE(SUM(CASE WHEN mp.place <= 3 THEN 1 ELSE 0 END), 0)::int AS podiums,
      COALESCE(AVG(mp.total_points), 0)::float AS avg_points,
      COALESCE(MAX(mp.total_points), 0)::int AS best_points
    FROM multiplayer_match_players mp
    JOIN multiplayer_matches m ON m.id = mp.match_id
    JOIN multiplayer_games g ON g.id = m.game_id
    JOIN multiplayer_ticket_to_ride_matches mtm ON mtm.match_id = m.id
    JOIN players p ON p.id = mp.player_id
    ${whereClause}
    GROUP BY p.id, p.name
    ORDER BY wins DESC, podiums DESC, avg_points DESC, p.name ASC
  `;

  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    playerId: row.player_id,
    name: row.name,
    matches: row.matches,
    wins: row.wins,
    podiums: row.podiums,
    avgPoints: row.avg_points !== null ? Number(row.avg_points) : 0,
    bestPoints: row.best_points ?? 0,
  }));
}

module.exports = {
  listTicketToRidePlayerStats,
};
