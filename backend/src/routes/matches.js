const express = require('express');
const { validationError, notFound } = require('../errors');
const { validateBody } = require('../validation');
const {
  listMatches,
  listMatchesForExport,
  getMatchById,
  createMatch,
  updateMatch,
  deleteMatch,
} = require('../services/matches-service');

const router = express.Router();

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

function escapeCsvValue(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  if (stringValue.includes('"')) {
    const escaped = stringValue.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return `"${stringValue}"`;
  }
  return stringValue;
}

function serializeMatchesToCsv(matches) {
  const header = [
    'playedOn',
    'game',
    'playerA',
    'scoreA',
    'playerB',
    'scoreB',
    'winner',
    'notes',
  ];

  const rows = matches.map((match) => [
    escapeCsvValue(match.playedOn),
    escapeCsvValue(match.game?.name ?? ''),
    escapeCsvValue(match.playerA?.name ?? ''),
    escapeCsvValue(match.scoreA),
    escapeCsvValue(match.playerB?.name ?? ''),
    escapeCsvValue(match.scoreB),
    escapeCsvValue(match.winner),
    escapeCsvValue(match.notes ?? ''),
  ]);

  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

router.get('/matches', async (req, res, next) => {
  try {
    const { gameId, playerId, dateFrom, dateTo, sort } = req.query;

    if (gameId && (typeof gameId !== 'string' || !isUuid(gameId))) {
      return next(validationError([{ field: 'gameId', message: 'must be a valid UUID' }]));
    }

    if (playerId && (typeof playerId !== 'string' || !isUuid(playerId))) {
      return next(validationError([{ field: 'playerId', message: 'must be a valid UUID' }]));
    }

    if (dateFrom && (typeof dateFrom !== 'string' || !isValidDateString(dateFrom))) {
      return next(validationError([{ field: 'dateFrom', message: 'must be YYYY-MM-DD' }]));
    }

    if (dateTo && (typeof dateTo !== 'string' || !isValidDateString(dateTo))) {
      return next(validationError([{ field: 'dateTo', message: 'must be YYYY-MM-DD' }]));
    }

    if (sort && sort !== 'playedOnDesc') {
      return next(validationError([{ field: 'sort', message: 'unsupported sort' }]));
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

    const { items, total } = await listMatches({
      gameId,
      playerId,
      dateFrom,
      dateTo,
      limit,
      offset,
    });

    return res.json({
      items,
      total,
      limit,
      offset,
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/matches/export.csv', async (req, res, next) => {
  try {
    const { gameId, playerId, dateFrom, dateTo } = req.query;

    if (gameId && (typeof gameId !== 'string' || !isUuid(gameId))) {
      return next(validationError([{ field: 'gameId', message: 'must be a valid UUID' }]));
    }

    if (playerId && (typeof playerId !== 'string' || !isUuid(playerId))) {
      return next(validationError([{ field: 'playerId', message: 'must be a valid UUID' }]));
    }

    if (dateFrom && (typeof dateFrom !== 'string' || !isValidDateString(dateFrom))) {
      return next(validationError([{ field: 'dateFrom', message: 'must be YYYY-MM-DD' }]));
    }

    if (dateTo && (typeof dateTo !== 'string' || !isValidDateString(dateTo))) {
      return next(validationError([{ field: 'dateTo', message: 'must be YYYY-MM-DD' }]));
    }

    const matches = await listMatchesForExport({ gameId, playerId, dateFrom, dateTo });
    const csv = serializeMatchesToCsv(matches);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=\"matches.csv\"');
    return res.status(200).send(csv);
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/matches',
  validateBody({
    gameId: { type: 'string', required: true },
    playedOn: { type: 'string', required: true },
    playerAId: { type: 'string', required: true },
    playerBId: { type: 'string', required: true },
    scoreA: { type: 'number', required: true, integer: true, min: 0 },
    scoreB: { type: 'number', required: true, integer: true, min: 0 },
    notes: { type: 'string', maxLength: 2000, nullable: true },
  }),
  async (req, res, next) => {
    try {
      const { gameId, playedOn, playerAId, playerBId, scoreA, scoreB, notes } = req.body;

      if (!isUuid(gameId)) {
        return next(validationError([{ field: 'gameId', message: 'must be a valid UUID' }]));
      }
      if (!isUuid(playerAId)) {
        return next(validationError([{ field: 'playerAId', message: 'must be a valid UUID' }]));
      }
      if (!isUuid(playerBId)) {
        return next(validationError([{ field: 'playerBId', message: 'must be a valid UUID' }]));
      }
      if (playerAId === playerBId) {
        return next(
          validationError([{ field: 'playerBId', message: 'must be different from playerAId' }])
        );
      }
      if (!isValidDateString(playedOn)) {
        return next(validationError([{ field: 'playedOn', message: 'must be YYYY-MM-DD' }]));
      }
      if (typeof notes === 'string' && notes.length > 2000) {
        return next(validationError([{ field: 'notes', message: 'max length is 2000' }]));
      }

      try {
        const match = await createMatch({
          gameId,
          playedOn,
          playerAId,
          playerBId,
          scoreA,
          scoreB,
          notes,
        });
        return res.status(201).json(match);
      } catch (error) {
        if (error && error.code === 'MATCH_VALIDATION') {
          return next(validationError(error.details || []));
        }
        throw error;
      }
    } catch (error) {
      return next(error);
    }
  }
);

router.get('/matches/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    const match = await getMatchById(id);
    return res.json(match);
  } catch (error) {
    if (error && error.code === 'MATCH_NOT_FOUND') {
      return next(notFound('Match not found'));
    }
    return next(error);
  }
});

router.patch(
  '/matches/:id',
  validateBody({
    gameId: { type: 'string' },
    playedOn: { type: 'string' },
    playerAId: { type: 'string' },
    playerBId: { type: 'string' },
    scoreA: { type: 'number', integer: true, min: 0 },
    scoreB: { type: 'number', integer: true, min: 0 },
    notes: { type: 'string', maxLength: 2000, nullable: true },
  }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isUuid(id)) {
        return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
      }

      const {
        gameId,
        playedOn,
        playerAId,
        playerBId,
        scoreA,
        scoreB,
        notes,
      } = req.body;

      const hasAnyField =
        gameId !== undefined ||
        playedOn !== undefined ||
        playerAId !== undefined ||
        playerBId !== undefined ||
        scoreA !== undefined ||
        scoreB !== undefined ||
        notes !== undefined;

      if (!hasAnyField) {
        return next(
          validationError(
            [{ field: 'body', message: 'At least one field must be provided' }],
            'Validation failed'
          )
        );
      }

      if (gameId !== undefined && !isUuid(gameId)) {
        return next(validationError([{ field: 'gameId', message: 'must be a valid UUID' }]));
      }
      if (playerAId !== undefined && !isUuid(playerAId)) {
        return next(validationError([{ field: 'playerAId', message: 'must be a valid UUID' }]));
      }
      if (playerBId !== undefined && !isUuid(playerBId)) {
        return next(validationError([{ field: 'playerBId', message: 'must be a valid UUID' }]));
      }
      if (playedOn !== undefined && !isValidDateString(playedOn)) {
        return next(validationError([{ field: 'playedOn', message: 'must be YYYY-MM-DD' }]));
      }
      if (typeof notes === 'string' && notes.length > 2000) {
        return next(validationError([{ field: 'notes', message: 'max length is 2000' }]));
      }
      if (playerAId !== undefined && playerBId !== undefined && playerAId === playerBId) {
        return next(
          validationError([{ field: 'playerBId', message: 'must be different from playerAId' }])
        );
      }

      try {
        const match = await updateMatch({
          id,
          gameId,
          playedOn,
          playerAId,
          playerBId,
          scoreA,
          scoreB,
          notes,
        });
        return res.json(match);
      } catch (error) {
        if (error && error.code === 'MATCH_NOT_FOUND') {
          return next(notFound('Match not found'));
        }
        if (error && error.code === 'MATCH_VALIDATION') {
          return next(validationError(error.details || []));
        }
        throw error;
      }
    } catch (error) {
      return next(error);
    }
  }
);

router.delete('/matches/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    await deleteMatch(id);
    return res.status(204).send();
  } catch (error) {
    if (error && error.code === 'MATCH_NOT_FOUND') {
      return next(notFound('Match not found'));
    }
    return next(error);
  }
});

module.exports = router;
