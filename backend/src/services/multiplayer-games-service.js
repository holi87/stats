const { getPool } = require('../db');

function mapGameRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
    calculatorButtonLabel: row.calculator_button_label ?? null,
    calculatorUrl: row.calculator_url ?? null,
    scoringType: row.scoring_type,
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    isActive: row.is_active === true,
    showInQuickMenu: row.visible_in_multiplayer === true,
    optionsCount: Number(row.options_count ?? 0),
    requiresOption: Boolean(row.requires_option),
    optionsExclusive:
      row.options_exclusive === null || row.options_exclusive === undefined
        ? true
        : row.options_exclusive === true,
    customFieldsCount: Number(row.custom_fields_count ?? 0),
  };
}

function mapOptionRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    gameId: row.game_id,
    code: row.code,
    displayName: row.display_name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

function mapCustomFieldRow(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    gameId: row.game_id,
    code: row.code,
    label: row.label,
    description: row.description ?? null,
    pointsPerUnit: row.points_per_unit,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

async function listMultiplayerGames(options = {}) {
  const includeInactive = options.includeInactive === true;
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      g.id,
      g.code,
      g.display_name,
     g.calculator_button_label,
     g.calculator_url,
     g.scoring_type,
     g.min_players,
     g.max_players,
     g.is_active,
     g.visible_in_one_vs_one,
     g.visible_in_multiplayer,
     g.options_exclusive,
     COALESCE(opts.active_options, 0)::int AS options_count,
     (COALESCE(opts.active_options, 0) > 0) AS requires_option,
     COALESCE(custom_fields.active_custom_fields, 0)::int AS custom_fields_count
     FROM multiplayer_games g
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS active_options
       FROM multiplayer_game_options go
       WHERE go.game_id = g.id AND go.is_active = true
     ) opts ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS active_custom_fields
       FROM multiplayer_custom_scoring_fields c
       WHERE c.game_id = g.id AND c.is_active = true
     ) custom_fields ON true
     ${includeInactive ? '' : 'WHERE g.is_active = true'}
     ORDER BY g.display_name ASC`
  );

  return result.rows.map(mapGameRow);
}

async function getMultiplayerGameById(id) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      g.id,
      g.code,
      g.display_name,
      g.calculator_button_label,
      g.calculator_url,
      g.scoring_type,
      g.min_players,
      g.max_players,
      g.is_active,
      g.visible_in_one_vs_one,
      g.visible_in_multiplayer,
      g.options_exclusive,
      COALESCE(opts.active_options, 0)::int AS options_count,
      (COALESCE(opts.active_options, 0) > 0) AS requires_option,
      COALESCE(custom_fields.active_custom_fields, 0)::int AS custom_fields_count
     FROM multiplayer_games g
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS active_options
       FROM multiplayer_game_options go
       WHERE go.game_id = g.id AND go.is_active = true
     ) opts ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS active_custom_fields
       FROM multiplayer_custom_scoring_fields c
       WHERE c.game_id = g.id AND c.is_active = true
     ) custom_fields ON true
     WHERE g.id = $1`,
    [id]
  );

  return mapGameRow(result.rows[0] || null);
}

async function getMultiplayerGameByIdOrThrow(id) {
  const game = await getMultiplayerGameById(id);
  if (!game) {
    const error = new Error('Multiplayer game not found');
    error.code = 'MULTIPLAYER_GAME_NOT_FOUND';
    throw error;
  }
  return game;
}

async function getMultiplayerGameByCode(code, options = {}) {
  const includeInactive = options.includeInactive === true;
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      g.id,
      g.code,
      g.display_name,
      g.calculator_button_label,
      g.calculator_url,
      g.scoring_type,
      g.min_players,
      g.max_players,
      g.is_active,
      g.visible_in_one_vs_one,
      g.visible_in_multiplayer,
      g.options_exclusive,
      COALESCE(opts.active_options, 0)::int AS options_count,
      (COALESCE(opts.active_options, 0) > 0) AS requires_option,
      COALESCE(custom_fields.active_custom_fields, 0)::int AS custom_fields_count
     FROM multiplayer_games g
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS active_options
       FROM multiplayer_game_options go
       WHERE go.game_id = g.id AND go.is_active = true
     ) opts ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS active_custom_fields
       FROM multiplayer_custom_scoring_fields c
       WHERE c.game_id = g.id AND c.is_active = true
     ) custom_fields ON true
     WHERE g.code = $1
       ${includeInactive ? '' : 'AND g.is_active = true'}`,
    [code]
  );

  return mapGameRow(result.rows[0] || null);
}

async function createManualMultiplayerGame({
  code,
  displayName,
  minPlayers,
  maxPlayers,
  showInQuickMenu,
  isActive,
  optionsExclusive,
  calculatorButtonLabel,
  calculatorUrl,
}) {
  const normalizedShowInQuickMenu = showInQuickMenu !== false;
  const normalizedIsActive = isActive !== false;
  const normalizedOptionsExclusive = optionsExclusive !== false;
  const pool = getPool();

  try {
    const result = await pool.query(
      `INSERT INTO multiplayer_games (
        code,
        display_name,
        scoring_type,
        min_players,
        max_players,
        visible_in_one_vs_one,
        visible_in_multiplayer,
        options_exclusive,
        calculator_button_label,
        calculator_url,
        is_active
      ) VALUES ($1, $2, 'MANUAL_POINTS', $3, $4, false, $5, $6, $7, $8, $9)
      RETURNING
        id,
        code,
        display_name,
        calculator_button_label,
        calculator_url,
        scoring_type,
        min_players,
        max_players,
        is_active,
        visible_in_one_vs_one,
        visible_in_multiplayer,
        options_exclusive,
        0::int AS custom_fields_count`,
      [
        code,
        displayName,
        minPlayers,
        maxPlayers,
        normalizedShowInQuickMenu,
        normalizedOptionsExclusive,
        calculatorButtonLabel ?? null,
        calculatorUrl ?? null,
        normalizedIsActive,
      ]
    );

    return mapGameRow({
      ...result.rows[0],
      options_count: 0,
      requires_option: false,
    });
  } catch (error) {
    if (error && error.code === '23505') {
      const conflictError = new Error('Multiplayer game code already exists');
      conflictError.code = 'MULTIPLAYER_GAME_CODE_CONFLICT';
      throw conflictError;
    }
    throw error;
  }
}

async function createCustomMultiplayerGame({
  code,
  displayName,
  minPlayers,
  maxPlayers,
  showInQuickMenu,
  isActive,
  optionsExclusive,
  calculatorButtonLabel,
  calculatorUrl,
  fields,
}) {
  const normalizedShowInQuickMenu = showInQuickMenu !== false;
  const normalizedIsActive = isActive !== false;
  const normalizedOptionsExclusive = optionsExclusive !== false;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const gameInsert = await client.query(
      `INSERT INTO multiplayer_games (
        code,
        display_name,
        scoring_type,
        min_players,
        max_players,
        visible_in_one_vs_one,
        visible_in_multiplayer,
        options_exclusive,
        calculator_button_label,
        calculator_url,
        is_active
      ) VALUES ($1, $2, 'CUSTOM_CALCULATOR', $3, $4, false, $5, $6, $7, $8, $9)
      RETURNING id`,
      [
        code,
        displayName,
        minPlayers,
        maxPlayers,
        normalizedShowInQuickMenu,
        normalizedOptionsExclusive,
        calculatorButtonLabel ?? null,
        calculatorUrl ?? null,
        normalizedIsActive,
      ]
    );

    const gameId = gameInsert.rows[0].id;
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_custom_scoring_fields (
          game_id,
          code,
          label,
          description,
          points_per_unit,
          sort_order,
          is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, true)`,
        [gameId, field.code, field.label, field.description ?? null, field.pointsPerUnit, index + 1]
      );
    }

    await client.query('COMMIT');
    return getMultiplayerGameById(gameId);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error && error.code === '23505') {
      const conflictError = new Error('Multiplayer game code already exists');
      conflictError.code = 'MULTIPLAYER_GAME_CODE_CONFLICT';
      throw conflictError;
    }
    throw error;
  } finally {
    client.release();
  }
}

async function updateMultiplayerGame({
  code,
  displayName,
  minPlayers,
  maxPlayers,
  showInQuickMenu,
  isActive,
  optionsExclusive,
  calculatorButtonLabel,
  calculatorUrl,
}) {
  const current = await getMultiplayerGameByCode(code, { includeInactive: true });
  if (!current) {
    return null;
  }

  const fields = [];
  const params = [code];

  if (displayName !== undefined) {
    params.push(displayName);
    fields.push(`display_name = $${params.length}`);
  }

  if (minPlayers !== undefined) {
    params.push(minPlayers);
    fields.push(`min_players = $${params.length}`);
  }

  if (maxPlayers !== undefined) {
    params.push(maxPlayers);
    fields.push(`max_players = $${params.length}`);
  }

  if (showInQuickMenu !== undefined) {
    params.push(showInQuickMenu);
    fields.push(`visible_in_multiplayer = $${params.length}`);
  }

  if (isActive !== undefined) {
    params.push(isActive);
    fields.push(`is_active = $${params.length}`);
  }

  if (optionsExclusive !== undefined) {
    params.push(optionsExclusive);
    fields.push(`options_exclusive = $${params.length}`);
  }

  if (calculatorButtonLabel !== undefined) {
    params.push(calculatorButtonLabel);
    fields.push(`calculator_button_label = $${params.length}`);
  }

  if (calculatorUrl !== undefined) {
    params.push(calculatorUrl);
    fields.push(`calculator_url = $${params.length}`);
  }

  if (fields.length === 0) {
    return getMultiplayerGameByCode(code, { includeInactive: true });
  }

  const pool = getPool();
  const result = await pool.query(
    `UPDATE multiplayer_games
     SET ${fields.join(', ')}
     WHERE code = $1
     RETURNING id`,
    params
  );

  if (result.rowCount === 0) {
    return null;
  }

  return getMultiplayerGameById(result.rows[0].id);
}

async function deleteConfigurableMultiplayerGameAndStats({ code }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const gameResult = await client.query(
      `SELECT id, code, scoring_type
       FROM multiplayer_games
       WHERE code = $1
       FOR UPDATE`,
      [code]
    );

    if (gameResult.rowCount === 0) {
      const notFoundError = new Error('Multiplayer game not found');
      notFoundError.code = 'MULTIPLAYER_GAME_NOT_FOUND';
      throw notFoundError;
    }

    const game = gameResult.rows[0];
    if (game.scoring_type === 'TTR_CALCULATOR' || game.scoring_type === 'TM_CALCULATOR') {
      const forbiddenError = new Error('Game uses dedicated calculator and cannot be deleted');
      forbiddenError.code = 'MULTIPLAYER_GAME_DELETE_BLOCKED';
      throw forbiddenError;
    }

    const matchesDeleteResult = await client.query(
      'DELETE FROM multiplayer_matches WHERE game_id = $1',
      [game.id]
    );

    await client.query('DELETE FROM multiplayer_games WHERE id = $1', [game.id]);

    await client.query('COMMIT');
    return {
      code: game.code,
      deletedMatches: Number(matchesDeleteResult.rowCount ?? 0),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listCustomScoringFields({ gameId, includeInactive = false }) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      id,
      game_id,
      code,
      label,
      description,
      points_per_unit,
      sort_order,
      is_active
     FROM multiplayer_custom_scoring_fields
     WHERE game_id = $1
      ${includeInactive ? '' : 'AND is_active = true'}
     ORDER BY sort_order ASC, label ASC`,
    [gameId]
  );

  return result.rows.map(mapCustomFieldRow);
}

async function getCustomScoringFieldByIdForGame(gameId, fieldId, options = {}) {
  const pool = getPool();
  const activeOnly = options.activeOnly ?? true;
  const result = await pool.query(
    `SELECT
      id,
      game_id,
      code,
      label,
      description,
      points_per_unit,
      sort_order,
      is_active
     FROM multiplayer_custom_scoring_fields
     WHERE game_id = $1
       AND id = $2
       ${activeOnly ? 'AND is_active = true' : ''}`,
    [gameId, fieldId]
  );

  return mapCustomFieldRow(result.rows[0] || null);
}

async function countActiveCustomScoringFieldsForGame(gameId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM multiplayer_custom_scoring_fields
     WHERE game_id = $1 AND is_active = true`,
    [gameId]
  );

  return result.rows[0]?.total ?? 0;
}

async function listMultiplayerGameOptions({ gameId, includeInactive = false }) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      id,
      game_id,
      code,
      display_name,
      sort_order,
      is_active
     FROM multiplayer_game_options
     WHERE game_id = $1
      ${includeInactive ? '' : 'AND is_active = true'}
     ORDER BY sort_order ASC, display_name ASC`,
    [gameId]
  );

  return result.rows.map(mapOptionRow);
}

async function getMultiplayerGameOptionById(optionId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      id,
      game_id,
      code,
      display_name,
      sort_order,
      is_active
     FROM multiplayer_game_options
     WHERE id = $1`,
    [optionId]
  );

  return mapOptionRow(result.rows[0] || null);
}

async function getMultiplayerGameOptionByIdForGame(gameId, optionId, options = {}) {
  const pool = getPool();
  const activeOnly = options.activeOnly ?? true;
  const result = await pool.query(
    `SELECT
      id,
      game_id,
      code,
      display_name,
      sort_order,
      is_active
     FROM multiplayer_game_options
     WHERE game_id = $1
       AND id = $2
       ${activeOnly ? 'AND is_active = true' : ''}`,
    [gameId, optionId]
  );

  return mapOptionRow(result.rows[0] || null);
}

async function getMultiplayerGameOptionByCodeForGame(gameId, code, options = {}) {
  const pool = getPool();
  const activeOnly = options.activeOnly ?? true;
  const result = await pool.query(
    `SELECT
      id,
      game_id,
      code,
      display_name,
      sort_order,
      is_active
     FROM multiplayer_game_options
     WHERE game_id = $1
       AND code = $2
       ${activeOnly ? 'AND is_active = true' : ''}`,
    [gameId, code]
  );

  return mapOptionRow(result.rows[0] || null);
}

async function updateMultiplayerGameOption({
  gameId,
  optionId,
  displayName,
  sortOrder,
  isActive,
}) {
  const fields = [];
  const params = [gameId, optionId];

  if (displayName !== undefined) {
    params.push(displayName);
    fields.push(`display_name = $${params.length}`);
  }

  if (sortOrder !== undefined) {
    params.push(sortOrder);
    fields.push(`sort_order = $${params.length}`);
  }

  if (isActive !== undefined) {
    params.push(isActive);
    fields.push(`is_active = $${params.length}`);
  }

  if (fields.length === 0) {
    return getMultiplayerGameOptionByIdForGame(gameId, optionId, { activeOnly: false });
  }

  const pool = getPool();
  const result = await pool.query(
    `UPDATE multiplayer_game_options
     SET ${fields.join(', ')}
     WHERE game_id = $1
       AND id = $2
     RETURNING
      id,
      game_id,
      code,
      display_name,
      sort_order,
      is_active`,
    params
  );

  return mapOptionRow(result.rows[0] || null);
}

async function countActiveOptionsForGame(gameId) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM multiplayer_game_options
     WHERE game_id = $1 AND is_active = true`,
    [gameId]
  );

  return result.rows[0]?.total ?? 0;
}

module.exports = {
  listMultiplayerGames,
  getMultiplayerGameById,
  getMultiplayerGameByIdOrThrow,
  getMultiplayerGameByCode,
  createManualMultiplayerGame,
  createCustomMultiplayerGame,
  updateMultiplayerGame,
  deleteConfigurableMultiplayerGameAndStats,
  listCustomScoringFields,
  getCustomScoringFieldByIdForGame,
  countActiveCustomScoringFieldsForGame,
  listMultiplayerGameOptions,
  getMultiplayerGameOptionById,
  getMultiplayerGameOptionByIdForGame,
  getMultiplayerGameOptionByCodeForGame,
  updateMultiplayerGameOption,
  countActiveOptionsForGame,
};
