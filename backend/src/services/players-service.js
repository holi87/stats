const { getPool } = require('../db');

function mapPlayer(row) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

async function listPlayers({ active, q }) {
  const pool = getPool();

  const params = [];
  const where = [];

  if (typeof active === 'boolean') {
    params.push(active);
    where.push(`is_active = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    where.push(`name ILIKE $${params.length}`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `SELECT id, name, is_active, created_at FROM players ${whereClause} ORDER BY name ASC`;

  const result = await pool.query(sql, params);
  return result.rows.map(mapPlayer);
}

async function createPlayer({ name }) {
  const pool = getPool();

  const existing = await pool.query('SELECT 1 FROM players WHERE lower(name) = lower($1)', [name]);
  if (existing.rowCount > 0) {
    const error = new Error('Player name already exists');
    error.code = 'PLAYER_NAME_CONFLICT';
    throw error;
  }

  try {
    const result = await pool.query(
      'INSERT INTO players (name) VALUES ($1) RETURNING id, name, is_active, created_at',
      [name]
    );

    return mapPlayer(result.rows[0]);
  } catch (error) {
    if (error && error.code === '23505') {
      const conflictError = new Error('Player name already exists');
      conflictError.code = 'PLAYER_NAME_CONFLICT';
      throw conflictError;
    }
    throw error;
  }
}

async function updatePlayer({ id, name, isActive }) {
  const pool = getPool();

  const current = await pool.query(
    'SELECT id, name, is_active, created_at FROM players WHERE id = $1',
    [id]
  );

  if (current.rowCount === 0) {
    const error = new Error('Player not found');
    error.code = 'PLAYER_NOT_FOUND';
    throw error;
  }

  if (name !== undefined) {
    const existing = await pool.query(
      'SELECT 1 FROM players WHERE lower(name) = lower($1) AND id <> $2',
      [name, id]
    );
    if (existing.rowCount > 0) {
      const conflictError = new Error('Player name already exists');
      conflictError.code = 'PLAYER_NAME_CONFLICT';
      throw conflictError;
    }
  }

  const fields = [];
  const values = [];

  if (name !== undefined) {
    values.push(name);
    fields.push(`name = $${values.length}`);
  }

  if (isActive !== undefined) {
    values.push(isActive);
    fields.push(`is_active = $${values.length}`);
  }

  if (fields.length === 0) {
    return mapPlayer(current.rows[0]);
  }

  values.push(id);

  const sql = `UPDATE players SET ${fields.join(', ')} WHERE id = $${values.length}
    RETURNING id, name, is_active, created_at`;

  const result = await pool.query(sql, values);
  return mapPlayer(result.rows[0]);
}

async function deletePlayerAndStats({ id }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const playerResult = await client.query(
      `SELECT id, name, is_active, created_at
       FROM players
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (playerResult.rowCount === 0) {
      const error = new Error('Player not found');
      error.code = 'PLAYER_NOT_FOUND';
      throw error;
    }

    const player = mapPlayer(playerResult.rows[0]);

    const oneVsOneMatchesResult = await client.query(
      `DELETE FROM matches
       WHERE player_a_id = $1 OR player_b_id = $1`,
      [id]
    );

    const multiplayerParticipationResult = await client.query(
      `DELETE FROM multiplayer_match_players
       WHERE player_id = $1`,
      [id]
    );

    const orphanMultiplayerMatchesResult = await client.query(
      `DELETE FROM multiplayer_matches m
       WHERE NOT EXISTS (
         SELECT 1
         FROM multiplayer_match_players mp
         WHERE mp.match_id = m.id
       )`
    );

    await client.query('DELETE FROM players WHERE id = $1', [id]);
    await client.query('COMMIT');

    return {
      player,
      deletedOneVsOneMatches: Number(oneVsOneMatchesResult.rowCount ?? 0),
      deletedMultiplayerParticipations: Number(multiplayerParticipationResult.rowCount ?? 0),
      deletedOrphanMultiplayerMatches: Number(orphanMultiplayerMatchesResult.rowCount ?? 0),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listPlayers,
  createPlayer,
  updatePlayer,
  deletePlayerAndStats,
};
