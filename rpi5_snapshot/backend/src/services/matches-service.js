const { getPool } = require('../db');

function formatDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function formatTimestamp(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

function computeWinner(scoreA, scoreB) {
  if (scoreA > scoreB) {
    return 'A';
  }
  if (scoreB > scoreA) {
    return 'B';
  }
  return 'DRAW';
}

function mapMatch(row, includeDetails = false) {
  const base = {
    id: row.id,
    playedOn: formatDate(row.played_on),
    notes: row.notes ?? null,
    game: {
      id: row.game_id,
      code: row.game_code,
      name: row.game_name,
    },
    playerA: {
      id: row.player_a_id,
      name: row.player_a_name,
    },
    playerB: {
      id: row.player_b_id,
      name: row.player_b_name,
    },
    scoreA: row.score_a,
    scoreB: row.score_b,
    winner: computeWinner(row.score_a, row.score_b),
  };

  if (!includeDetails) {
    return base;
  }

  return {
    ...base,
    notes: row.notes ?? null,
    createdAt: formatTimestamp(row.created_at),
    updatedAt: formatTimestamp(row.updated_at),
  };
}

function buildFilters({ gameId, playerId, dateFrom, dateTo }) {
  const conditions = [];
  const params = [];

  if (gameId) {
    params.push(gameId);
    conditions.push(`m.game_id = $${params.length}`);
  }

  if (playerId) {
    params.push(playerId);
    conditions.push(`(m.player_a_id = $${params.length} OR m.player_b_id = $${params.length})`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`m.played_on >= $${params.length}`);
  }

  if (dateTo) {
    params.push(dateTo);
    conditions.push(`m.played_on <= $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

async function fetchMatchById(client, id) {
  const result = await client.query(
    `
    SELECT
      m.id,
      m.played_on,
      m.score_a,
      m.score_b,
      m.notes,
      m.created_at,
      m.updated_at,
      g.id AS game_id,
      g.code AS game_code,
      g.name AS game_name,
      pa.id AS player_a_id,
      pa.name AS player_a_name,
      pb.id AS player_b_id,
      pb.name AS player_b_name
    FROM matches m
    JOIN games g ON g.id = m.game_id
    JOIN players pa ON pa.id = m.player_a_id
    JOIN players pb ON pb.id = m.player_b_id
    WHERE m.id = $1
    `,
    [id]
  );

  if (result.rowCount === 0) {
    const error = new Error('Match not found');
    error.code = 'MATCH_NOT_FOUND';
    throw error;
  }

  return mapMatch(result.rows[0], true);
}

async function fetchMatchBase(client, id) {
  const result = await client.query(
    'SELECT id, game_id, player_a_id, player_b_id FROM matches WHERE id = $1',
    [id]
  );

  if (result.rowCount === 0) {
    const error = new Error('Match not found');
    error.code = 'MATCH_NOT_FOUND';
    throw error;
  }

  return result.rows[0];
}

async function listMatches({ gameId, playerId, dateFrom, dateTo, limit, offset }) {
  const pool = getPool();
  const { whereClause, params } = buildFilters({ gameId, playerId, dateFrom, dateTo });

  const totalQuery = `SELECT COUNT(*)::int AS total FROM matches m ${whereClause}`;
  const totalResult = await pool.query(totalQuery, params);
  const total = totalResult.rows[0]?.total ?? 0;

  const pagingParams = [...params, limit, offset];
  const itemsQuery = `
    SELECT
      m.id,
      m.played_on,
      m.score_a,
      m.score_b,
      m.notes,
      g.id AS game_id,
      g.code AS game_code,
      g.name AS game_name,
      pa.id AS player_a_id,
      pa.name AS player_a_name,
      pb.id AS player_b_id,
      pb.name AS player_b_name
    FROM matches m
    JOIN games g ON g.id = m.game_id
    JOIN players pa ON pa.id = m.player_a_id
    JOIN players pb ON pb.id = m.player_b_id
    ${whereClause}
    ORDER BY m.played_on DESC, m.id DESC
    LIMIT $${pagingParams.length - 1} OFFSET $${pagingParams.length}
  `;

  const itemsResult = await pool.query(itemsQuery, pagingParams);
  const items = itemsResult.rows.map((row) => mapMatch(row, false));

  return { items, total };
}

async function listMatchesForExport({ gameId, playerId, dateFrom, dateTo }) {
  const pool = getPool();
  const { whereClause, params } = buildFilters({ gameId, playerId, dateFrom, dateTo });

  const query = `
    SELECT
      m.id,
      m.played_on,
      m.score_a,
      m.score_b,
      m.notes,
      g.id AS game_id,
      g.code AS game_code,
      g.name AS game_name,
      pa.id AS player_a_id,
      pa.name AS player_a_name,
      pb.id AS player_b_id,
      pb.name AS player_b_name
    FROM matches m
    JOIN games g ON g.id = m.game_id
    JOIN players pa ON pa.id = m.player_a_id
    JOIN players pb ON pb.id = m.player_b_id
    ${whereClause}
    ORDER BY m.played_on DESC, m.id DESC
  `;

  const result = await pool.query(query, params);
  return result.rows.map((row) => mapMatch(row, true));
}

async function getMatchById(id) {
  const pool = getPool();

  return fetchMatchById(pool, id);
}

async function createMatch({ gameId, playedOn, playerAId, playerBId, scoreA, scoreB, notes }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const gameResult = await client.query('SELECT id FROM games WHERE id = $1', [gameId]);
    if (gameResult.rowCount === 0) {
      const error = new Error('Game not found');
      error.code = 'MATCH_VALIDATION';
      error.details = [{ field: 'gameId', message: 'must refer to existing game' }];
      throw error;
    }

    const playersResult = await client.query(
      'SELECT id, is_active FROM players WHERE id = ANY($1::uuid[])',
      [[playerAId, playerBId]]
    );

    const playersById = new Map(playersResult.rows.map((row) => [row.id, row]));
    const playerA = playersById.get(playerAId);
    const playerB = playersById.get(playerBId);

    if (!playerA) {
      const error = new Error('Player A not found');
      error.code = 'MATCH_VALIDATION';
      error.details = [{ field: 'playerAId', message: 'must refer to existing player' }];
      throw error;
    }

    if (!playerB) {
      const error = new Error('Player B not found');
      error.code = 'MATCH_VALIDATION';
      error.details = [{ field: 'playerBId', message: 'must refer to existing player' }];
      throw error;
    }

    if (!playerA.is_active) {
      const error = new Error('Player A inactive');
      error.code = 'MATCH_VALIDATION';
      error.details = [{ field: 'playerAId', message: 'must refer to active player' }];
      throw error;
    }

    if (!playerB.is_active) {
      const error = new Error('Player B inactive');
      error.code = 'MATCH_VALIDATION';
      error.details = [{ field: 'playerBId', message: 'must refer to active player' }];
      throw error;
    }

    const insertResult = await client.query(
      `INSERT INTO matches (game_id, played_on, player_a_id, player_b_id, score_a, score_b, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [gameId, playedOn, playerAId, playerBId, scoreA, scoreB, notes ?? null]
    );

    const matchId = insertResult.rows[0].id;
    const match = await fetchMatchById(client, matchId);

    await client.query('COMMIT');
    return match;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateMatch({
  id,
  gameId,
  playedOn,
  playerAId,
  playerBId,
  scoreA,
  scoreB,
  notes,
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const current = await fetchMatchBase(client, id);
    const nextGameId = gameId ?? current.game_id;
    const nextPlayerAId = playerAId ?? current.player_a_id;
    const nextPlayerBId = playerBId ?? current.player_b_id;

    if (nextPlayerAId === nextPlayerBId) {
      const error = new Error('Players must be different');
      error.code = 'MATCH_VALIDATION';
      error.details = [{ field: 'playerBId', message: 'must be different from playerAId' }];
      throw error;
    }

    if (gameId) {
      const gameResult = await client.query('SELECT id FROM games WHERE id = $1', [gameId]);
      if (gameResult.rowCount === 0) {
        const error = new Error('Game not found');
        error.code = 'MATCH_VALIDATION';
        error.details = [{ field: 'gameId', message: 'must refer to existing game' }];
        throw error;
      }
    }

    const playerIdsToCheck = [];
    if (playerAId) {
      playerIdsToCheck.push(playerAId);
    }
    if (playerBId) {
      playerIdsToCheck.push(playerBId);
    }

    if (playerIdsToCheck.length > 0) {
      const playersResult = await client.query(
        'SELECT id, is_active FROM players WHERE id = ANY($1::uuid[])',
        [playerIdsToCheck]
      );
      const playersById = new Map(playersResult.rows.map((row) => [row.id, row]));

      if (playerAId) {
        const playerA = playersById.get(playerAId);
        if (!playerA) {
          const error = new Error('Player A not found');
          error.code = 'MATCH_VALIDATION';
          error.details = [{ field: 'playerAId', message: 'must refer to existing player' }];
          throw error;
        }
        if (!playerA.is_active) {
          const error = new Error('Player A inactive');
          error.code = 'MATCH_VALIDATION';
          error.details = [{ field: 'playerAId', message: 'must refer to active player' }];
          throw error;
        }
      }

      if (playerBId) {
        const playerB = playersById.get(playerBId);
        if (!playerB) {
          const error = new Error('Player B not found');
          error.code = 'MATCH_VALIDATION';
          error.details = [{ field: 'playerBId', message: 'must refer to existing player' }];
          throw error;
        }
        if (!playerB.is_active) {
          const error = new Error('Player B inactive');
          error.code = 'MATCH_VALIDATION';
          error.details = [{ field: 'playerBId', message: 'must refer to active player' }];
          throw error;
        }
      }
    }

    const fields = [];
    const values = [];

    if (gameId !== undefined) {
      values.push(gameId);
      fields.push(`game_id = $${values.length}`);
    }
    if (playedOn !== undefined) {
      values.push(playedOn);
      fields.push(`played_on = $${values.length}`);
    }
    if (playerAId !== undefined) {
      values.push(playerAId);
      fields.push(`player_a_id = $${values.length}`);
    }
    if (playerBId !== undefined) {
      values.push(playerBId);
      fields.push(`player_b_id = $${values.length}`);
    }
    if (scoreA !== undefined) {
      values.push(scoreA);
      fields.push(`score_a = $${values.length}`);
    }
    if (scoreB !== undefined) {
      values.push(scoreB);
      fields.push(`score_b = $${values.length}`);
    }
    if (notes !== undefined) {
      values.push(notes);
      fields.push(`notes = $${values.length}`);
    }

    if (fields.length === 0) {
      const match = await fetchMatchById(client, id);
      await client.query('COMMIT');
      return match;
    }

    fields.push('updated_at = now()');
    values.push(id);

    const sql = `UPDATE matches SET ${fields.join(', ')} WHERE id = $${values.length}`;
    await client.query(sql, values);

    const match = await fetchMatchById(client, id);
    await client.query('COMMIT');
    return match;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMatch(id) {
  const pool = getPool();
  const result = await pool.query('DELETE FROM matches WHERE id = $1 RETURNING id', [id]);

  if (result.rowCount === 0) {
    const error = new Error('Match not found');
    error.code = 'MATCH_NOT_FOUND';
    throw error;
  }
}

module.exports = {
  listMatches,
  listMatchesForExport,
  getMatchById,
  createMatch,
  updateMatch,
  deleteMatch,
};
