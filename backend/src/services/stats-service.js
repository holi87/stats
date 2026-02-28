const { getPool } = require('../db');

function mapPlayerStats(row) {
  return {
    playerId: row.player_id,
    name: row.name,
    matches: row.matches,
    wins: row.wins,
    draws: row.draws,
    pointsFor: row.points_for,
    pointsAgainst: row.points_against,
  };
}

async function listPlayerStats({ gameId, activeOnly }) {
  const pool = getPool();
  const params = [];

  let joinCondition = '(m.player_a_id = p.id OR m.player_b_id = p.id)';
  if (gameId) {
    params.push(gameId);
    joinCondition += ` AND m.game_id = $${params.length}`;
  }

  const where = [];
  if (activeOnly) {
    where.push('p.is_active = true');
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  const query = `
    SELECT
      stats.player_id,
      stats.name,
      stats.matches,
      stats.wins,
      stats.draws,
      stats.points_for,
      stats.points_against
    FROM (
      SELECT
        p.id AS player_id,
        p.name AS name,
        COUNT(m.id)::int AS matches,
        COALESCE(SUM(
          CASE
            WHEN m.player_a_id = p.id AND m.score_a > m.score_b THEN 1
            WHEN m.player_b_id = p.id AND m.score_b > m.score_a THEN 1
            ELSE 0
          END
        ), 0)::int AS wins,
        COALESCE(SUM(
          CASE
            WHEN m.score_a = m.score_b THEN 1
            ELSE 0
          END
        ), 0)::int AS draws,
        COALESCE(SUM(
          CASE
            WHEN m.player_a_id = p.id THEN m.score_a
            WHEN m.player_b_id = p.id THEN m.score_b
            ELSE 0
          END
        ), 0)::int AS points_for,
        COALESCE(SUM(
          CASE
            WHEN m.player_a_id = p.id THEN m.score_b
            WHEN m.player_b_id = p.id THEN m.score_a
            ELSE 0
          END
        ), 0)::int AS points_against
      FROM players p
      LEFT JOIN matches m ON ${joinCondition}
      ${whereClause}
      GROUP BY p.id, p.name
    ) AS stats
    ORDER BY
      stats.wins DESC,
      (stats.points_for - stats.points_against) DESC,
      stats.points_for DESC,
      stats.name ASC
  `;

  const result = await pool.query(query, params);
  return result.rows.map(mapPlayerStats);
}

async function getHeadToHeadStats({ player1Id, player2Id, gameId }) {
  const pool = getPool();

  const playersResult = await pool.query(
    'SELECT id, name FROM players WHERE id = ANY($1::uuid[])',
    [[player1Id, player2Id]]
  );

  const playersById = new Map(playersResult.rows.map((row) => [row.id, row]));
  const player1 = playersById.get(player1Id);
  const player2 = playersById.get(player2Id);

  if (!player1) {
    const error = new Error('Player 1 not found');
    error.code = 'PLAYER_NOT_FOUND';
    throw error;
  }
  if (!player2) {
    const error = new Error('Player 2 not found');
    error.code = 'PLAYER_NOT_FOUND';
    throw error;
  }

  const params = [player1Id, player2Id];
  let gameFilter = '';
  if (gameId) {
    params.push(gameId);
    gameFilter = ` AND m.game_id = $${params.length}`;
  }

  const statsQuery = `
    SELECT
      COUNT(*)::int AS matches,
      COALESCE(SUM(
        CASE
          WHEN m.player_a_id = $1 AND m.player_b_id = $2 AND m.score_a > m.score_b THEN 1
          WHEN m.player_a_id = $2 AND m.player_b_id = $1 AND m.score_b > m.score_a THEN 1
          ELSE 0
        END
      ), 0)::int AS player1_wins,
      COALESCE(SUM(
        CASE
          WHEN m.player_a_id = $1 AND m.player_b_id = $2 AND m.score_a < m.score_b THEN 1
          WHEN m.player_a_id = $2 AND m.player_b_id = $1 AND m.score_b < m.score_a THEN 1
          ELSE 0
        END
      ), 0)::int AS player2_wins,
      COALESCE(SUM(
        CASE
          WHEN m.score_a = m.score_b THEN 1
          ELSE 0
        END
      ), 0)::int AS draws
    FROM matches m
    WHERE (
      (m.player_a_id = $1 AND m.player_b_id = $2) OR
      (m.player_a_id = $2 AND m.player_b_id = $1)
    )
    ${gameFilter}
  `;

  const statsResult = await pool.query(statsQuery, params);
  const stats = statsResult.rows[0] || { matches: 0, player1_wins: 0, player2_wins: 0, draws: 0 };

  return {
    player1: { id: player1.id, name: player1.name },
    player2: { id: player2.id, name: player2.name },
    matches: stats.matches ?? 0,
    player1Wins: stats.player1_wins ?? 0,
    player2Wins: stats.player2_wins ?? 0,
    draws: stats.draws ?? 0,
  };
}

module.exports = {
  listPlayerStats,
  getHeadToHeadStats,
};
