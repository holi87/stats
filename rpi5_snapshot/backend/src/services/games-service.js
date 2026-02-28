const { getPool } = require('../db');

function mapGame(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active === true,
  };
}

async function syncOneVsOneGamesFromMultiplayer() {
  const pool = getPool();
  await pool.query(
    `INSERT INTO games (code, name, is_active)
     SELECT
       mg.code,
       mg.display_name,
       true
     FROM multiplayer_games mg
     WHERE mg.scoring_type = 'MANUAL_POINTS'
       AND mg.visible_in_one_vs_one = true
     ON CONFLICT (code) DO UPDATE
     SET name = EXCLUDED.name,
         is_active = EXCLUDED.is_active`
  );

  await pool.query(
    `UPDATE games g
     SET is_active = false
     WHERE EXISTS (
       SELECT 1
       FROM multiplayer_games mg
       WHERE mg.code = g.code
     )
     AND NOT EXISTS (
       SELECT 1
       FROM multiplayer_games mg
       WHERE mg.code = g.code
         AND mg.scoring_type = 'MANUAL_POINTS'
         AND mg.visible_in_one_vs_one = true
     )`
  );
}

async function listGames(options = {}) {
  const includeInactive = options.includeInactive === true;
  await syncOneVsOneGamesFromMultiplayer();
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, code, name, is_active
     FROM games
     ${includeInactive ? '' : 'WHERE is_active = true'}
     ORDER BY name ASC`
  );
  return result.rows.map(mapGame);
}

async function deleteGameAndMatches({ id }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const gameResult = await client.query(
      `SELECT id, code, name
       FROM games
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

    if (gameResult.rowCount === 0) {
      const error = new Error('Game not found');
      error.code = 'GAME_NOT_FOUND';
      throw error;
    }

    const game = gameResult.rows[0];

    const deletedMatches = await client.query(
      `DELETE FROM matches
       WHERE game_id = $1`,
      [game.id]
    );

    await client.query('DELETE FROM games WHERE id = $1', [game.id]);
    await client.query('COMMIT');

    return {
      id: game.id,
      code: game.code,
      name: game.name,
      deletedMatches: Number(deletedMatches.rowCount ?? 0),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateGame({ id, isActive, name }) {
  const fields = [];
  const params = [id];

  if (typeof name === 'string') {
    params.push(name);
    fields.push(`name = $${params.length}`);
  }

  if (typeof isActive === 'boolean') {
    params.push(isActive);
    fields.push(`is_active = $${params.length}`);
  }

  if (fields.length === 0) {
    return null;
  }

  const pool = getPool();
  let result;
  try {
    result = await pool.query(
      `UPDATE games
       SET ${fields.join(', ')}
       WHERE id = $1
       RETURNING id, code, name, is_active`,
      params
    );
  } catch (error) {
    if (error && error.code === '23505' && error.constraint === 'games_name_key') {
      const conflictError = new Error('Game name already exists');
      conflictError.code = 'GAME_NAME_CONFLICT';
      throw conflictError;
    }
    throw error;
  }

  if (result.rowCount === 0) {
    return null;
  }

  return mapGame(result.rows[0]);
}

module.exports = {
  listGames,
  deleteGameAndMatches,
  updateGame,
};
