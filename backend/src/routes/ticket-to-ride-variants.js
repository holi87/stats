const express = require('express');
const { validationError } = require('../errors');
const { listTicketToRideVariants } = require('../services/ticket-to-ride-variants-service');
const { listTicketToRidePlayerStats } = require('../services/ticket-to-ride-stats-service');

const router = express.Router();

function logDeprecated(req) {
  console.warn(`DEPRECATED endpoint used: ${req.method} ${req.originalUrl}`);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

router.get('/ticket-to-ride/variants', async (_req, res, next) => {
  try {
    logDeprecated(_req);
    const variants = await listTicketToRideVariants();
    return res.json(variants);
  } catch (error) {
    return next(error);
  }
});

router.get('/ticket-to-ride/stats/players', async (req, res, next) => {
  try {
    logDeprecated(req);
    const { variantId } = req.query;
    if (variantId && (typeof variantId !== 'string' || !isUuid(variantId))) {
      return next(
        validationError([{ field: 'variantId', message: 'must be a valid UUID' }])
      );
    }

    const stats = await listTicketToRidePlayerStats({ variantId });
    return res.json(stats);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
