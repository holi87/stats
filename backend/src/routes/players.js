const express = require('express');
const { validationError, conflict, notFound } = require('../errors');
const { validateBody } = require('../validation');
const {
  listPlayers,
  createPlayer,
  updatePlayer,
  deletePlayerAndStats,
} = require('../services/players-service');

const router = express.Router();

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function parseActive(value) {
  if (value === undefined) {
    return true;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return null;
}

router.get('/players', async (req, res, next) => {
  try {
    const active = parseActive(req.query.active);
    if (active === null) {
      return next(
        validationError([{ field: 'active', message: 'must be true or false' }], 'Invalid query')
      );
    }

    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const q = query.length > 0 ? query : undefined;

    const players = await listPlayers({ active, q });
    return res.json(players);
  } catch (error) {
    return next(error);
  }
});

router.post(
  '/players',
  validateBody({
    name: {
      type: 'string',
      required: true,
      trim: true,
      minLength: 1,
      maxLength: 60,
    },
  }),
  async (req, res, next) => {
    try {
      const name = req.body.name.trim();

      if (name.length === 0 || name.length > 60) {
        return next(
          validationError([{ field: 'name', message: 'must be between 1 and 60 characters' }])
        );
      }

      try {
        const player = await createPlayer({ name });
        return res.status(201).json(player);
      } catch (error) {
        if (error && error.code === 'PLAYER_NAME_CONFLICT') {
          return next(conflict('Player name already exists'));
        }
        throw error;
      }
    } catch (error) {
      return next(error);
    }
  }
);

router.patch(
  '/players/:id',
  validateBody({
    name: {
      type: 'string',
      trim: true,
      minLength: 1,
      maxLength: 60,
    },
    isActive: {
      type: 'boolean',
    },
  }),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (!isUuid(id)) {
        return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
      }
      const hasName = req.body.name !== undefined;
      const hasIsActive = req.body.isActive !== undefined;

      if (!hasName && !hasIsActive) {
        return next(
          validationError(
            [{ field: 'body', message: 'At least one field must be provided' }],
            'Validation failed'
          )
        );
      }

      const name = hasName ? req.body.name.trim() : undefined;
      const isActive = hasIsActive ? req.body.isActive : undefined;

      const player = await updatePlayer({ id, name, isActive });
      return res.json(player);
    } catch (error) {
      if (error && error.code === 'PLAYER_NOT_FOUND') {
        return next(notFound('Player not found'));
      }
      if (error && error.code === 'PLAYER_NAME_CONFLICT') {
        return next(conflict('Player name already exists'));
      }
      return next(error);
    }
  }
);

router.delete('/players/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    const result = await deletePlayerAndStats({ id });
    return res.json(result);
  } catch (error) {
    if (error && error.code === 'PLAYER_NOT_FOUND') {
      return next(notFound('Player not found'));
    }
    return next(error);
  }
});

module.exports = router;
