const express = require('express');
const { validationError, notFound } = require('../errors');
const {
  listMultiplayerPlayerStats,
  listMultiplayerPlayerStatsByOption,
} = require('../services/multiplayer-stats-service');

const router = express.Router();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

router.get('/multiplayer/stats/players', async (req, res, next) => {
  try {
    const { gameId } = req.query;

    if (!gameId) {
      return next(validationError([{ field: 'gameId', message: 'is required' }]));
    }

    if (typeof gameId !== 'string' || !isUuid(gameId)) {
      return next(validationError([{ field: 'gameId', message: 'must be a valid UUID' }]));
    }

    try {
      const stats = await listMultiplayerPlayerStats({ gameId });
      return res.json(stats);
    } catch (error) {
      if (error && error.code === 'MULTIPLAYER_GAME_NOT_FOUND') {
        return next(notFound('Multiplayer game not found'));
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

router.get('/multiplayer/stats/players-by-option', async (req, res, next) => {
  try {
    const { gameId } = req.query;

    if (!gameId) {
      return next(validationError([{ field: 'gameId', message: 'is required' }]));
    }

    if (typeof gameId !== 'string' || !isUuid(gameId)) {
      return next(validationError([{ field: 'gameId', message: 'must be a valid UUID' }]));
    }

    try {
      const stats = await listMultiplayerPlayerStatsByOption({ gameId });
      return res.json(stats);
    } catch (error) {
      if (error && error.code === 'MULTIPLAYER_GAME_NOT_FOUND') {
        return next(notFound('Multiplayer game not found'));
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
