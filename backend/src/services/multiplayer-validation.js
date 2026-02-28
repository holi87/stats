const { validationError } = require('../errors');
const { getPool } = require('../db');
const { getMultiplayerGameById } = require('./multiplayer-games-service');

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function findDuplicateIds(ids) {
  const seen = new Set();
  const duplicates = new Set();
  for (const id of ids) {
    if (seen.has(id)) {
      duplicates.add(id);
    } else {
      seen.add(id);
    }
  }
  return [...duplicates];
}

async function validateMultiplayerMatchInput({ gameId, playerIds }) {
  const details = [];

  if (!gameId) {
    details.push({ field: 'gameId', message: 'is required' });
  } else if (!isUuid(gameId)) {
    details.push({ field: 'gameId', message: 'must be a valid UUID' });
  }

  if (!Array.isArray(playerIds) || playerIds.length === 0) {
    details.push({ field: 'players', message: 'must include at least 1 player' });
  }

  if (Array.isArray(playerIds)) {
    const invalidIds = playerIds.filter((id) => !isUuid(id));
    if (invalidIds.length > 0) {
      details.push({ field: 'players', message: 'must contain valid UUIDs' });
    }

    const duplicates = findDuplicateIds(playerIds);
    if (duplicates.length > 0) {
      details.push({ field: 'players', message: 'must be unique' });
    }
  }

  const game = details.length === 0 ? await getMultiplayerGameById(gameId) : null;
  if (details.length === 0 && !game) {
    details.push({ field: 'gameId', message: 'must refer to an existing multiplayer game' });
  }

  if (details.length === 0 && game && Array.isArray(playerIds)) {
    if (playerIds.length < game.minPlayers || playerIds.length > game.maxPlayers) {
      details.push({
        field: 'players',
        message: `must include between ${game.minPlayers} and ${game.maxPlayers} players`,
      });
    }
  }

  if (details.length === 0 && Array.isArray(playerIds)) {
    const pool = getPool();
    const result = await pool.query(
      'SELECT id, is_active FROM players WHERE id = ANY($1::uuid[])',
      [playerIds]
    );
    const rowsById = new Map(result.rows.map((row) => [row.id, row]));
    const missing = playerIds.filter((id) => !rowsById.has(id));
    if (missing.length > 0) {
      details.push({ field: 'players', message: 'must reference existing players' });
    }

    const inactive = result.rows.filter((row) => row.is_active === false).map((row) => row.id);
    if (inactive.length > 0) {
      details.push({ field: 'players', message: 'must include only active players' });
    }
  }

  if (details.length > 0) {
    throw validationError(details);
  }

  return { game };
}

module.exports = {
  validateMultiplayerMatchInput,
  getMultiplayerGameById,
};
