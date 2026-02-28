const express = require('express');
const { validationError, notFound } = require('../errors');
const {
  createTicketToRideMatch,
  listTicketToRideMatches,
  getTicketToRideMatchById,
  updateTicketToRideMatch,
  deleteTicketToRideMatch,
} = require('../services/ticket-to-ride-matches-service');

const router = express.Router();

function logDeprecated(req) {
  console.warn(`DEPRECATED endpoint used: ${req.method} ${req.originalUrl}`);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function parseNumber(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }
  return parsed;
}

function validateTrainsCounts(trainsCounts, details, index) {
  if (trainsCounts === null || typeof trainsCounts !== 'object' || Array.isArray(trainsCounts)) {
    details.push({
      field: `players[${index}].trainsCounts`,
      message: 'must be an object',
    });
    return;
  }

  for (let i = 1; i <= 9; i += 1) {
    const key = String(i);
    if (!(key in trainsCounts)) {
      details.push({
        field: `players[${index}].trainsCounts`,
        message: 'must include keys 1..9',
      });
      break;
    }
    const value = trainsCounts[key];
    if (!Number.isInteger(value) || value < 0) {
      details.push({
        field: `players[${index}].trainsCounts.${key}`,
        message: 'must be an integer >= 0',
      });
      break;
    }
  }
}

router.post('/ticket-to-ride/matches', async (req, res, next) => {
  try {
    logDeprecated(req);
    const details = [];

    if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return next(validationError([{ field: 'body', message: 'must be an object' }]));
    }

    const { playedOn, variantId, notes, players } = req.body;

    if (!playedOn || typeof playedOn !== 'string' || !isValidDateString(playedOn)) {
      details.push({ field: 'playedOn', message: 'must be YYYY-MM-DD' });
    }

    if (!variantId || typeof variantId !== 'string' || !isUuid(variantId)) {
      details.push({ field: 'variantId', message: 'must be a valid UUID' });
    }

    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      details.push({ field: 'notes', message: 'must be a string' });
    } else if (typeof notes === 'string' && notes.length > 2000) {
      details.push({ field: 'notes', message: 'max length is 2000' });
    }

    if (!Array.isArray(players)) {
      details.push({ field: 'players', message: 'must be an array' });
    } else {
      if (players.length < 2 || players.length > 5) {
        details.push({ field: 'players', message: 'must contain between 2 and 5 players' });
      }

      const seenIds = new Set();

      players.forEach((player, index) => {
        if (player === null || typeof player !== 'object' || Array.isArray(player)) {
          details.push({ field: `players[${index}]`, message: 'must be an object' });
          return;
        }

        const { playerId, ticketsPoints, bonusPoints, trainsCounts } = player;

        if (!playerId || typeof playerId !== 'string' || !isUuid(playerId)) {
          details.push({ field: `players[${index}].playerId`, message: 'must be a valid UUID' });
        } else if (seenIds.has(playerId)) {
          details.push({ field: 'players', message: 'playerId must be unique' });
        } else {
          seenIds.add(playerId);
        }

        if (!Number.isInteger(ticketsPoints)) {
          details.push({
            field: `players[${index}].ticketsPoints`,
            message: 'must be an integer',
          });
        }

        if (!Number.isInteger(bonusPoints) || bonusPoints < 0) {
          details.push({
            field: `players[${index}].bonusPoints`,
            message: 'must be an integer >= 0',
          });
        }

        validateTrainsCounts(trainsCounts, details, index);
      });
    }

    if (details.length > 0) {
      return next(validationError(details));
    }

    try {
      const match = await createTicketToRideMatch({ playedOn, variantId, notes, players });
      return res.status(201).json(match);
    } catch (error) {
      if (error && error.code === 'TICKET_TO_RIDE_VALIDATION') {
        return next(validationError(error.details || []));
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

router.get('/ticket-to-ride/matches', async (req, res, next) => {
  try {
    logDeprecated(req);
    const { dateFrom, dateTo, playerId, variantId } = req.query;

    if (dateFrom && (typeof dateFrom !== 'string' || !isValidDateString(dateFrom))) {
      return next(validationError([{ field: 'dateFrom', message: 'must be YYYY-MM-DD' }]));
    }
    if (dateTo && (typeof dateTo !== 'string' || !isValidDateString(dateTo))) {
      return next(validationError([{ field: 'dateTo', message: 'must be YYYY-MM-DD' }]));
    }
    if (playerId && (typeof playerId !== 'string' || !isUuid(playerId))) {
      return next(validationError([{ field: 'playerId', message: 'must be a valid UUID' }]));
    }
    if (variantId && (typeof variantId !== 'string' || !isUuid(variantId))) {
      return next(validationError([{ field: 'variantId', message: 'must be a valid UUID' }]));
    }

    const limit = parseNumber(req.query.limit, 50);
    if (limit === null || limit < 1 || limit > 200) {
      return next(
        validationError([{ field: 'limit', message: 'must be an integer between 1 and 200' }])
      );
    }

    const offset = parseNumber(req.query.offset, 0);
    if (offset === null || offset < 0) {
      return next(
        validationError([{ field: 'offset', message: 'must be an integer greater or equal 0' }])
      );
    }

    const { items, total } = await listTicketToRideMatches({
      dateFrom,
      dateTo,
      playerId,
      variantId,
      limit,
      offset,
    });

    return res.json({ items, total, limit, offset });
  } catch (error) {
    return next(error);
  }
});

router.get('/ticket-to-ride/matches/:id', async (req, res, next) => {
  try {
    logDeprecated(req);
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    const match = await getTicketToRideMatchById(id);
    return res.json(match);
  } catch (error) {
    if (error && error.code === 'TICKET_TO_RIDE_MATCH_NOT_FOUND') {
      return next(notFound('Ticket to Ride match not found'));
    }
    return next(error);
  }
});

router.patch('/ticket-to-ride/matches/:id', async (req, res, next) => {
  try {
    logDeprecated(req);
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return next(validationError([{ field: 'body', message: 'must be an object' }]));
    }

    const { playedOn, variantId, notes, players } = req.body;
    const details = [];

    const hasAnyField =
      playedOn !== undefined ||
      variantId !== undefined ||
      notes !== undefined ||
      players !== undefined;

    if (!hasAnyField) {
      return next(
        validationError(
          [{ field: 'body', message: 'At least one field must be provided' }],
          'Validation failed'
        )
      );
    }

    if (playedOn !== undefined) {
      if (typeof playedOn !== 'string' || !isValidDateString(playedOn)) {
        details.push({ field: 'playedOn', message: 'must be YYYY-MM-DD' });
      }
    }

    if (variantId !== undefined) {
      if (typeof variantId !== 'string' || !isUuid(variantId)) {
        details.push({ field: 'variantId', message: 'must be a valid UUID' });
      }
    }

    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      details.push({ field: 'notes', message: 'must be a string' });
    } else if (typeof notes === 'string' && notes.length > 2000) {
      details.push({ field: 'notes', message: 'max length is 2000' });
    }

    if (players !== undefined) {
      if (!Array.isArray(players)) {
        details.push({ field: 'players', message: 'must be an array' });
      } else {
        if (players.length < 2 || players.length > 5) {
          details.push({ field: 'players', message: 'must contain between 2 and 5 players' });
        }

        const seenIds = new Set();

        players.forEach((player, index) => {
          if (player === null || typeof player !== 'object' || Array.isArray(player)) {
            details.push({ field: `players[${index}]`, message: 'must be an object' });
            return;
          }

          const { playerId, ticketsPoints, bonusPoints, trainsCounts } = player;

          if (!playerId || typeof playerId !== 'string' || !isUuid(playerId)) {
            details.push({ field: `players[${index}].playerId`, message: 'must be a valid UUID' });
          } else if (seenIds.has(playerId)) {
            details.push({ field: 'players', message: 'playerId must be unique' });
          } else {
            seenIds.add(playerId);
          }

          if (!Number.isInteger(ticketsPoints)) {
            details.push({
              field: `players[${index}].ticketsPoints`,
              message: 'must be an integer',
            });
          }

          if (!Number.isInteger(bonusPoints) || bonusPoints < 0) {
            details.push({
              field: `players[${index}].bonusPoints`,
              message: 'must be an integer >= 0',
            });
          }

          validateTrainsCounts(trainsCounts, details, index);
        });
      }
    }

    if (details.length > 0) {
      return next(validationError(details));
    }

    try {
      const match = await updateTicketToRideMatch({
        id,
        playedOn,
        variantId,
        notes,
        players,
      });
      return res.json(match);
    } catch (error) {
      if (error && error.code === 'TICKET_TO_RIDE_MATCH_NOT_FOUND') {
        return next(notFound('Ticket to Ride match not found'));
      }
      if (error && error.code === 'TICKET_TO_RIDE_VALIDATION') {
        return next(validationError(error.details || []));
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

router.delete('/ticket-to-ride/matches/:id', async (req, res, next) => {
  try {
    logDeprecated(req);
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    await deleteTicketToRideMatch(id);
    return res.status(204).send();
  } catch (error) {
    if (error && error.code === 'TICKET_TO_RIDE_MATCH_NOT_FOUND') {
      return next(notFound('Ticket to Ride match not found'));
    }
    return next(error);
  }
});

module.exports = router;
