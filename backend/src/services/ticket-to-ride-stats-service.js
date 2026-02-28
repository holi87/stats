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
    WITH ranked_players AS (
      SELECT
        mp.id AS match_player_id,
        mp.match_id,
        mp.player_id,
        mp.total_points,
        RANK() OVER (PARTITION BY mp.match_id ORDER BY mp.total_points DESC)::int AS computed_place
      FROM multiplayer_match_players mp
      JOIN multiplayer_matches m ON m.id = mp.match_id
      JOIN multiplayer_games g ON g.id = m.game_id
      JOIN multiplayer_ticket_to_ride_matches mtm ON mtm.match_id = m.id
      ${whereClause}
    )
    SELECT
      p.id AS player_id,
      p.name,
      COUNT(rp.match_player_id)::int AS matches,
      COALESCE(SUM(CASE WHEN rp.computed_place = 1 THEN 1 ELSE 0 END), 0)::int AS wins,
      COALESCE(SUM(CASE WHEN rp.computed_place <= 3 THEN 1 ELSE 0 END), 0)::int AS podiums,
      COALESCE(AVG(rp.total_points), 0)::float AS avg_points,
      COALESCE(MAX(rp.total_points), 0)::int AS best_points
    FROM ranked_players rp
    JOIN players p ON p.id = rp.player_id
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
