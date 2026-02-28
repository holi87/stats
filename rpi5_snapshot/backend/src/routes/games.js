const express = require('express');
const { validationError, notFound, conflict } = require('../errors');
const {
  listGames,
  deleteGameAndMatches,
  updateGame,
} = require('../services/games-service');

const router = express.Router();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function parseBooleanQuery(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return null;
}

router.get('/games', async (req, res, next) => {
  try {
    const includeInactive = parseBooleanQuery(req.query.includeInactive, false);
    if (includeInactive === null) {
      return next(
        validationError([{ field: 'includeInactive', message: 'must be a boolean (true/false)' }])
      );
    }

    const games = await listGames({ includeInactive });
    res.json(games);
  } catch (error) {
    next(error);
  }
});

router.patch('/games/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    const { isActive, name } = req.body || {};
    const details = [];
    const hasIsActive = isActive !== undefined;
    const hasName = name !== undefined;

    if (!hasIsActive && !hasName) {
      return next(
        validationError([{ field: 'body', message: 'must include at least one of: isActive, name' }])
      );
    }

    let normalizedName;
    if (hasName) {
      if (typeof name !== 'string') {
        details.push({ field: 'name', message: 'must be a string' });
      } else if (name.trim() === '') {
        details.push({ field: 'name', message: 'cannot be empty' });
      } else if (name.trim().length > 80) {
        details.push({ field: 'name', message: 'max length is 80' });
      } else {
        normalizedName = name.trim();
      }
    }

    if (hasIsActive && typeof isActive !== 'boolean') {
      details.push({ field: 'isActive', message: 'must be a boolean' });
    }

    if (details.length > 0) {
      return next(validationError(details));
    }

    let updated;
    try {
      updated = await updateGame({ id, isActive, name: normalizedName });
    } catch (error) {
      if (error && error.code === 'GAME_NAME_CONFLICT') {
        return next(conflict('Game name already exists'));
      }
      throw error;
    }

    if (!updated) {
      return next(notFound('Game not found'));
    }

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.delete('/games/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    const deleted = await deleteGameAndMatches({ id });
    return res.json(deleted);
  } catch (error) {
    if (error && error.code === 'GAME_NOT_FOUND') {
      return next(notFound('Game not found'));
    }
    return next(error);
  }
});

module.exports = router;
