const express = require('express');
const { validationError } = require('../errors');
const { listMultiplayerPodiumStats } = require('../services/multiplayer-podiums-service');

const router = express.Router();

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

router.get('/multiplayer/stats/podiums', async (req, res, next) => {
  try {
    const { dateFrom, dateTo } = req.query;

    if (dateFrom && (typeof dateFrom !== 'string' || !isValidDateString(dateFrom))) {
      return next(validationError([{ field: 'dateFrom', message: 'must be YYYY-MM-DD' }]));
    }

    if (dateTo && (typeof dateTo !== 'string' || !isValidDateString(dateTo))) {
      return next(validationError([{ field: 'dateTo', message: 'must be YYYY-MM-DD' }]));
    }

    const stats = await listMultiplayerPodiumStats({ dateFrom, dateTo });
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
