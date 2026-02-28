const express = require('express');
const { validationError } = require('../errors');
const { listPlayerStats } = require('../services/stats-service');

const router = express.Router();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseBoolean(value, defaultValue) {
  if (value === undefined) {
    return defaultValue;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return null;
}

router.get('/stats/players', async (req, res, next) => {
  try {
    const { gameId } = req.query;

    if (!gameId) {
      return next(validationError([{ field: 'gameId', message: 'is required' }]));
    }

    if (gameId && (typeof gameId !== 'string' || !isUuid(gameId))) {
      return next(validationError([{ field: 'gameId', message: 'must be a valid UUID' }]));
    }

    const activeOnly = parseBoolean(req.query.activeOnly, true);
    if (activeOnly === null) {
      return next(validationError([{ field: 'activeOnly', message: 'must be true or false' }]));
    }

    const stats = await listPlayerStats({ gameId, activeOnly });
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
