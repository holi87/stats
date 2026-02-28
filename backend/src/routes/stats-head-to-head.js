const express = require('express');
const { validationError, notFound } = require('../errors');
const { getHeadToHeadStats } = require('../services/stats-service');

const router = express.Router();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

router.get('/stats/head-to-head', async (req, res, next) => {
  try {
    const { player1Id, player2Id, gameId } = req.query;

    if (!player1Id || !player2Id) {
      const details = [];
      if (!player1Id) {
        details.push({ field: 'player1Id', message: 'is required' });
      }
      if (!player2Id) {
        details.push({ field: 'player2Id', message: 'is required' });
      }
      return next(validationError(details));
    }

    if (typeof player1Id !== 'string' || !isUuid(player1Id)) {
      return next(validationError([{ field: 'player1Id', message: 'must be a valid UUID' }]));
    }

    if (typeof player2Id !== 'string' || !isUuid(player2Id)) {
      return next(validationError([{ field: 'player2Id', message: 'must be a valid UUID' }]));
    }

    if (player1Id === player2Id) {
      return next(
        validationError([{ field: 'player2Id', message: 'must be different from player1Id' }])
      );
    }

    if (gameId && (typeof gameId !== 'string' || !isUuid(gameId))) {
      return next(validationError([{ field: 'gameId', message: 'must be a valid UUID' }]));
    }

    try {
      const stats = await getHeadToHeadStats({ player1Id, player2Id, gameId });
      return res.json(stats);
    } catch (error) {
      if (error && error.code === 'PLAYER_NOT_FOUND') {
        return next(notFound(error.message));
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
