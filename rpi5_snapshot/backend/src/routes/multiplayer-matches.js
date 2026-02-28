const express = require('express');
const { validationError, notFound } = require('../errors');
const { getPool } = require('../db');
const { validateMultiplayerMatchInput } = require('../services/multiplayer-validation');
const {
  countActiveOptionsForGame,
  listCustomScoringFields,
  getMultiplayerGameOptionByCodeForGame,
  getMultiplayerGameOptionByIdForGame,
} = require('../services/multiplayer-games-service');
const {
  createMultiplayerMatchManual,
  createMultiplayerMatchCustomCalculator,
  createMultiplayerMatchTicketToRide,
  createMultiplayerMatchTerraformingMars,
  listMultiplayerMatches,
  getMultiplayerMatchById,
  getMultiplayerMatchCore,
  updateMultiplayerMatchManual,
  updateMultiplayerMatchCustomCalculator,
  updateMultiplayerMatchTicketToRide,
  updateMultiplayerMatchTerraformingMars,
  deleteMultiplayerMatch,
} = require('../services/multiplayer-matches-service');

const router = express.Router();

function isValidDateString(value) {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
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

router.get('/multiplayer/matches', async (req, res, next) => {
  try {
    const { gameId, playerId, optionId, dateFrom, dateTo } = req.query;

    if (gameId && (typeof gameId !== 'string' || !isUuid(gameId))) {
      return next(validationError([{ field: 'gameId', message: 'must be a valid UUID' }]));
    }

    if (playerId && (typeof playerId !== 'string' || !isUuid(playerId))) {
      return next(validationError([{ field: 'playerId', message: 'must be a valid UUID' }]));
    }

    if (optionId && (typeof optionId !== 'string' || !isUuid(optionId))) {
      return next(validationError([{ field: 'optionId', message: 'must be a valid UUID' }]));
    }

    if (dateFrom && (typeof dateFrom !== 'string' || !isValidDateString(dateFrom))) {
      return next(validationError([{ field: 'dateFrom', message: 'must be YYYY-MM-DD' }]));
    }

    if (dateTo && (typeof dateTo !== 'string' || !isValidDateString(dateTo))) {
      return next(validationError([{ field: 'dateTo', message: 'must be YYYY-MM-DD' }]));
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

    const { items, total } = await listMultiplayerMatches({
      gameId,
      playerId,
      optionId,
      dateFrom,
      dateTo,
      limit,
      offset,
    });

    return res.json({ items, total, limit, offset });
  } catch (error) {
    return next(error);
  }
});

router.get('/multiplayer/matches/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    const match = await getMultiplayerMatchById(id);
    return res.json(match);
  } catch (error) {
    if (error && error.code === 'MULTIPLAYER_MATCH_NOT_FOUND') {
      return next(notFound('Multiplayer match not found'));
    }
    return next(error);
  }
});

function validateTrainsCounts(trainsCounts) {
  const requiredKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const requiredKeysSet = new Set(requiredKeys);
  
  if (!trainsCounts || typeof trainsCounts !== 'object' || Array.isArray(trainsCounts)) {
    return 'must be an object with keys 1..9';
  }
  
  // Check for extra keys not in requiredKeys
  for (const key of Object.keys(trainsCounts)) {
    if (!requiredKeysSet.has(key)) {
      return 'must include only keys 1..9';
    }
  }
  
  // Check all required keys exist and have valid values
  for (const key of requiredKeys) {
    if (!(key in trainsCounts)) {
      return 'must include keys 1..9';
    }
    const value = trainsCounts[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return 'must include integer values >= 0 for keys 1..9';
    }
  }
  
  return null;
}

async function resolveOptionForGame({
  game,
  optionId,
  optionField = 'optionId',
  fallbackCode,
  fallbackField = optionField,
  requireWhenAvailable = false,
}) {
  const hasInputOptionId = optionId !== undefined && optionId !== null && optionId !== '';
  let option = null;

  if (hasInputOptionId) {
    option = await getMultiplayerGameOptionByIdForGame(game.id, optionId, { activeOnly: true });
    if (!option) {
      throw validationError([{ field: optionField, message: 'must refer to active game option' }]);
    }
  }

  if (!option && fallbackCode) {
    option = await getMultiplayerGameOptionByCodeForGame(game.id, fallbackCode, { activeOnly: true });
    if (!option) {
      throw validationError([{ field: fallbackField, message: 'does not map to active game option' }]);
    }
  }

  if (!option && requireWhenAvailable) {
    const optionsCount = await countActiveOptionsForGame(game.id);
    if (optionsCount > 0) {
      throw validationError([{ field: optionField, message: 'is required for this game' }]);
    }
  }

  return option;
}

function normalizeCustomCalculatorPlayers({ players, activeFields }) {
  const details = [];
  const activeFieldIds = new Set(activeFields.map((field) => field.id));

  const normalizedPlayers = players.map((player, index) => {
    const fieldPath = `players[${index}].calculatorValues`;
    const rawValues = player.calculatorValues;

    if (!rawValues || typeof rawValues !== 'object' || Array.isArray(rawValues)) {
      details.push({ field: fieldPath, message: 'must be an object' });
      return { playerId: player.playerId, calculatorValues: {} };
    }

    const normalizedValues = {};
    Object.entries(rawValues).forEach(([fieldId, value]) => {
      if (!isUuid(fieldId)) {
        details.push({
          field: `${fieldPath}.${fieldId}`,
          message: 'field id must be a valid UUID',
        });
        return;
      }

      if (!activeFieldIds.has(fieldId)) {
        details.push({
          field: `${fieldPath}.${fieldId}`,
          message: 'must refer to active calculator field',
        });
        return;
      }

      if (!Number.isInteger(value)) {
        details.push({
          field: `${fieldPath}.${fieldId}`,
          message: 'must be an integer',
        });
        return;
      }

      normalizedValues[fieldId] = value;
    });

    activeFields.forEach((field) => {
      if (normalizedValues[field.id] === undefined) {
        normalizedValues[field.id] = 0;
      }
    });

    return {
      playerId: player.playerId,
      calculatorValues: normalizedValues,
    };
  });

  return { details, normalizedPlayers };
}

router.post('/multiplayer/matches', async (req, res, next) => {
  try {
    const { gameId, playedOn, notes, players, ticketToRide, optionId } = req.body || {};
    const details = [];

    if (!gameId) {
      details.push({ field: 'gameId', message: 'is required' });
    }

    if (!playedOn) {
      details.push({ field: 'playedOn', message: 'is required' });
    } else if (typeof playedOn !== 'string' || !isValidDateString(playedOn)) {
      details.push({ field: 'playedOn', message: 'must be YYYY-MM-DD' });
    }

    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      details.push({ field: 'notes', message: 'must be a string' });
    }

    if (typeof notes === 'string' && notes.length > 2000) {
      details.push({ field: 'notes', message: 'max length is 2000' });
    }

    if (optionId !== undefined) {
      if (typeof optionId !== 'string' || !isUuid(optionId)) {
        details.push({ field: 'optionId', message: 'must be a valid UUID' });
      }
    }

    if (!Array.isArray(players)) {
      details.push({ field: 'players', message: 'must be an array' });
    }

    const normalizedPlayers = Array.isArray(players) ? players : [];
    const playerIds = [];

    normalizedPlayers.forEach((player, index) => {
      if (!player || typeof player !== 'object') {
        details.push({ field: `players[${index}]`, message: 'must be an object' });
        return;
      }

      if (!player.playerId) {
        details.push({ field: `players[${index}].playerId`, message: 'is required' });
      } else if (typeof player.playerId !== 'string') {
        details.push({ field: `players[${index}].playerId`, message: 'must be a string' });
      } else {
        playerIds.push(player.playerId);
      }
    });

    if (details.length > 0) {
      return next(validationError(details));
    }

    const { game } = await validateMultiplayerMatchInput({ gameId, playerIds });

    if (!game) {
      return next(validationError([{ field: 'gameId', message: 'must refer to an existing game' }]));
    }

    if (game.scoringType === 'MANUAL_POINTS') {
      const manualDetails = [];
      normalizedPlayers.forEach((player, index) => {
        if (player.totalPoints === undefined || player.totalPoints === null) {
          manualDetails.push({ field: `players[${index}].totalPoints`, message: 'is required' });
        } else if (
          typeof player.totalPoints !== 'number' ||
          !Number.isInteger(player.totalPoints)
        ) {
          manualDetails.push({ field: `players[${index}].totalPoints`, message: 'must be an integer' });
        }
      });

      if (manualDetails.length > 0) {
        return next(validationError(manualDetails));
      }

      const option = await resolveOptionForGame({
        game,
        optionId,
        optionField: 'optionId',
        requireWhenAvailable: true,
      });

      const payload = await createMultiplayerMatchManual({
        game,
        option,
        playedOn,
        notes,
        players: normalizedPlayers,
      });

      return res.status(201).json(payload);
    }

    if (game.scoringType === 'CUSTOM_CALCULATOR') {
      if (ticketToRide !== undefined) {
        return next(validationError([{ field: 'ticketToRide', message: 'not applicable' }]));
      }

      const activeFields = await listCustomScoringFields({ gameId: game.id });
      if (activeFields.length === 0) {
        return next(
          validationError([
            {
              field: 'gameId',
              message: 'custom calculator has no active fields configured',
            },
          ])
        );
      }

      const { details: customDetails, normalizedPlayers: normalizedCustomPlayers } =
        normalizeCustomCalculatorPlayers({
          players: normalizedPlayers,
          activeFields,
        });

      if (customDetails.length > 0) {
        return next(validationError(customDetails));
      }

      const option = await resolveOptionForGame({
        game,
        optionId,
        optionField: 'optionId',
        requireWhenAvailable: true,
      });

      const payload = await createMultiplayerMatchCustomCalculator({
        game,
        option,
        playedOn,
        notes,
        activeFields,
        players: normalizedCustomPlayers,
      });

      return res.status(201).json(payload);
    }

    if (game.scoringType === 'TTR_CALCULATOR') {
      const ttrDetails = [];
      if (!ticketToRide || typeof ticketToRide !== 'object') {
        ttrDetails.push({ field: 'ticketToRide', message: 'is required' });
      } else if (!ticketToRide.variantId) {
        ttrDetails.push({ field: 'ticketToRide.variantId', message: 'is required' });
      } else if (typeof ticketToRide.variantId !== 'string') {
        ttrDetails.push({ field: 'ticketToRide.variantId', message: 'must be a string' });
      }

      normalizedPlayers.forEach((player, index) => {
        if (player.ticketsPoints === undefined || player.ticketsPoints === null) {
          ttrDetails.push({ field: `players[${index}].ticketsPoints`, message: 'is required' });
        } else if (
          typeof player.ticketsPoints !== 'number' ||
          !Number.isInteger(player.ticketsPoints)
        ) {
          ttrDetails.push({ field: `players[${index}].ticketsPoints`, message: 'must be an integer' });
        }

        if (player.bonusPoints === undefined || player.bonusPoints === null) {
          ttrDetails.push({ field: `players[${index}].bonusPoints`, message: 'is required' });
        } else if (
          typeof player.bonusPoints !== 'number' ||
          !Number.isInteger(player.bonusPoints) ||
          player.bonusPoints < 0
        ) {
          ttrDetails.push({ field: `players[${index}].bonusPoints`, message: 'must be >= 0' });
        }

        const trainsCountsError = validateTrainsCounts(player.trainsCounts);
        if (trainsCountsError) {
          ttrDetails.push({ field: `players[${index}].trainsCounts`, message: trainsCountsError });
        }
      });

      if (ttrDetails.length > 0) {
        return next(validationError(ttrDetails));
      }

      const pool = getPool();
      const variantResult = await pool.query(
        'SELECT id, code, name, is_active FROM ticket_to_ride_variants WHERE id = $1',
        [ticketToRide.variantId]
      );
      if (variantResult.rowCount === 0) {
        return next(
          validationError([{ field: 'ticketToRide.variantId', message: 'must refer to existing variant' }])
        );
      }
      const variant = variantResult.rows[0];
      if (!variant.is_active) {
        return next(
          validationError([{ field: 'ticketToRide.variantId', message: 'must refer to active variant' }])
        );
      }

      const option = await resolveOptionForGame({
        game,
        optionId,
        optionField: 'optionId',
        fallbackCode: variant.code,
        fallbackField: 'ticketToRide.variantId',
        requireWhenAvailable: true,
      });

      if (optionId && option && option.code !== variant.code) {
        return next(
          validationError([
            {
              field: 'optionId',
              message: 'must match selected Ticket to Ride variant',
            },
          ])
        );
      }

      const payload = await createMultiplayerMatchTicketToRide({
        game,
        variant,
        option,
        playedOn,
        notes,
        players: normalizedPlayers,
      });

      return res.status(201).json(payload);
    }

    if (game.scoringType === 'TM_CALCULATOR') {
      if (ticketToRide !== undefined) {
        return next(validationError([{ field: 'ticketToRide', message: 'not applicable' }]));
      }

      const tmDetails = [];
      const fields = [
        'titlesCount',
        'awardsFirstCount',
        'awardsSecondCount',
        'citiesPoints',
        'forestsPoints',
        'cardsPoints',
        'trPoints',
      ];

      normalizedPlayers.forEach((player, index) => {
        if (player == null || typeof player !== 'object') {
          tmDetails.push({ field: `players[${index}]`, message: 'must be an object' });
          return;
        }

        fields.forEach((field) => {
          const value = player[field];
          if (value === undefined || value === null) {
            return;
          }
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
            tmDetails.push({
              field: `players[${index}].${field}`,
              message: 'must be an integer >= 0',
            });
          }
        });
      });

      if (tmDetails.length > 0) {
        return next(validationError(tmDetails));
      }

      const option = await resolveOptionForGame({
        game,
        optionId,
        optionField: 'optionId',
        requireWhenAvailable: true,
      });

      const payload = await createMultiplayerMatchTerraformingMars({
        game,
        option,
        playedOn,
        notes,
        players: normalizedPlayers,
      });

      return res.status(201).json(payload);
    }

    return next(
      validationError([
        { field: 'gameId', message: 'unsupported scoring type for this endpoint' },
      ])
    );
  } catch (error) {
    return next(error);
  }
});

router.patch('/multiplayer/matches/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    const { playedOn, notes, players, ticketToRide, optionId } = req.body || {};
    const details = [];

    const hasAnyField =
      playedOn !== undefined ||
      notes !== undefined ||
      players !== undefined ||
      ticketToRide !== undefined ||
      optionId !== undefined;

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

    if (notes !== undefined && notes !== null && typeof notes !== 'string') {
      details.push({ field: 'notes', message: 'must be a string' });
    }

    if (typeof notes === 'string' && notes.length > 2000) {
      details.push({ field: 'notes', message: 'max length is 2000' });
    }

    if (optionId !== undefined) {
      if (typeof optionId !== 'string' || !isUuid(optionId)) {
        details.push({ field: 'optionId', message: 'must be a valid UUID' });
      }
    }

    const normalizedPlayers = Array.isArray(players) ? players : null;
    const playerIds = [];

    if (players !== undefined && !Array.isArray(players)) {
      details.push({ field: 'players', message: 'must be an array' });
    }

    if (normalizedPlayers) {
      normalizedPlayers.forEach((player, index) => {
        if (!player || typeof player !== 'object') {
          details.push({ field: `players[${index}]`, message: 'must be an object' });
          return;
        }

        if (!player.playerId) {
          details.push({ field: `players[${index}].playerId`, message: 'is required' });
        } else if (typeof player.playerId !== 'string') {
          details.push({ field: `players[${index}].playerId`, message: 'must be a string' });
        } else {
          playerIds.push(player.playerId);
        }
      });
    }

    if (details.length > 0) {
      return next(validationError(details));
    }

    const match = await getMultiplayerMatchCore(id);
    const game = {
      id: match.game_id,
      code: match.game_code,
      displayName: match.game_display_name,
      scoringType: match.game_scoring_type,
      minPlayers: match.game_min_players,
      maxPlayers: match.game_max_players,
    };

    if (normalizedPlayers) {
      await validateMultiplayerMatchInput({ gameId: game.id, playerIds });
    }

    if (game.scoringType === 'MANUAL_POINTS') {
      if (normalizedPlayers) {
        const manualDetails = [];
        normalizedPlayers.forEach((player, index) => {
          if (player.totalPoints === undefined || player.totalPoints === null) {
            manualDetails.push({ field: `players[${index}].totalPoints`, message: 'is required' });
          } else if (
            typeof player.totalPoints !== 'number' ||
            !Number.isInteger(player.totalPoints)
          ) {
            manualDetails.push({
              field: `players[${index}].totalPoints`,
              message: 'must be an integer',
            });
          }
        });

        if (manualDetails.length > 0) {
          return next(validationError(manualDetails));
        }
      }

      const option =
        optionId !== undefined
          ? await resolveOptionForGame({
              game,
              optionId,
              optionField: 'optionId',
              requireWhenAvailable: false,
            })
          : undefined;

      const payload = await updateMultiplayerMatchManual({
        match: { id: match.id, gameId: game.id },
        playedOn,
        notes,
        players: normalizedPlayers,
        option,
      });
      return res.json(payload);
    }

    if (game.scoringType === 'CUSTOM_CALCULATOR') {
      if (ticketToRide !== undefined) {
        return next(validationError([{ field: 'ticketToRide', message: 'not applicable' }]));
      }

      const activeFields = await listCustomScoringFields({ gameId: game.id });
      if (activeFields.length === 0) {
        return next(
          validationError([
            {
              field: 'gameId',
              message: 'custom calculator has no active fields configured',
            },
          ])
        );
      }

      let normalizedCustomPlayers = null;
      if (normalizedPlayers) {
        const { details: customDetails, normalizedPlayers: normalized } =
          normalizeCustomCalculatorPlayers({
            players: normalizedPlayers,
            activeFields,
          });

        if (customDetails.length > 0) {
          return next(validationError(customDetails));
        }
        normalizedCustomPlayers = normalized;
      }

      const option =
        optionId !== undefined
          ? await resolveOptionForGame({
              game,
              optionId,
              optionField: 'optionId',
              requireWhenAvailable: false,
            })
          : undefined;

      const payload = await updateMultiplayerMatchCustomCalculator({
        match: { id: match.id, gameId: game.id },
        playedOn,
        notes,
        players: normalizedCustomPlayers,
        activeFields,
        option,
      });
      return res.json(payload);
    }

    if (game.scoringType === 'TTR_CALCULATOR') {
      let variant = null;
      let option = undefined;
      if (normalizedPlayers || ticketToRide !== undefined || optionId !== undefined) {
        const ttrDetails = [];
        if (!ticketToRide || typeof ticketToRide !== 'object') {
          ttrDetails.push({ field: 'ticketToRide', message: 'is required' });
        } else if (!ticketToRide.variantId) {
          ttrDetails.push({ field: 'ticketToRide.variantId', message: 'is required' });
        } else if (typeof ticketToRide.variantId !== 'string') {
          ttrDetails.push({ field: 'ticketToRide.variantId', message: 'must be a string' });
        }

        if (normalizedPlayers) {
          normalizedPlayers.forEach((player, index) => {
            if (player.ticketsPoints === undefined || player.ticketsPoints === null) {
              ttrDetails.push({
                field: `players[${index}].ticketsPoints`,
                message: 'is required',
              });
            } else if (
              typeof player.ticketsPoints !== 'number' ||
              !Number.isInteger(player.ticketsPoints)
            ) {
              ttrDetails.push({
                field: `players[${index}].ticketsPoints`,
                message: 'must be an integer',
              });
            }

            if (player.bonusPoints === undefined || player.bonusPoints === null) {
              ttrDetails.push({
                field: `players[${index}].bonusPoints`,
                message: 'is required',
              });
            } else if (
              typeof player.bonusPoints !== 'number' ||
              !Number.isInteger(player.bonusPoints) ||
              player.bonusPoints < 0
            ) {
              ttrDetails.push({
                field: `players[${index}].bonusPoints`,
                message: 'must be >= 0',
              });
            }

            const trainsCountsError = validateTrainsCounts(player.trainsCounts);
            if (trainsCountsError) {
              ttrDetails.push({
                field: `players[${index}].trainsCounts`,
                message: trainsCountsError,
              });
            }
          });
        }

        if (ttrDetails.length > 0) {
          return next(validationError(ttrDetails));
        }

        const pool = getPool();
        const variantResult = await pool.query(
          'SELECT id, code, name, is_active FROM ticket_to_ride_variants WHERE id = $1',
          [ticketToRide.variantId]
        );
        if (variantResult.rowCount === 0) {
          return next(
            validationError([
              { field: 'ticketToRide.variantId', message: 'must refer to existing variant' },
            ])
          );
        }
        variant = variantResult.rows[0];
        if (!variant.is_active) {
          return next(
            validationError([
              { field: 'ticketToRide.variantId', message: 'must refer to active variant' },
            ])
          );
        }

        option = await resolveOptionForGame({
          game,
          optionId,
          optionField: 'optionId',
          fallbackCode: variant.code,
          fallbackField: 'ticketToRide.variantId',
          requireWhenAvailable: false,
        });

        if (optionId && option && option.code !== variant.code) {
          return next(
            validationError([
              {
                field: 'optionId',
                message: 'must match selected Ticket to Ride variant',
              },
            ])
          );
        }
      }

      const payload = await updateMultiplayerMatchTicketToRide({
        match: { id: match.id, gameId: game.id },
        playedOn,
        notes,
        players: normalizedPlayers,
        variant,
        option,
      });
      return res.json(payload);
    }

    if (game.scoringType === 'TM_CALCULATOR') {
      if (ticketToRide !== undefined) {
        return next(validationError([{ field: 'ticketToRide', message: 'not applicable' }]));
      }

      if (normalizedPlayers) {
        const tmDetails = [];
        const fields = [
          'titlesCount',
          'awardsFirstCount',
          'awardsSecondCount',
          'citiesPoints',
          'forestsPoints',
          'cardsPoints',
          'trPoints',
        ];

        normalizedPlayers.forEach((player, index) => {
          if (player == null || typeof player !== 'object') {
            tmDetails.push({ field: `players[${index}]`, message: 'must be an object' });
            return;
          }

          fields.forEach((field) => {
            const value = player[field];
            if (value === undefined || value === null) {
              return;
            }
            if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
              tmDetails.push({
                field: `players[${index}].${field}`,
                message: 'must be an integer >= 0',
              });
            }
          });
        });

        if (tmDetails.length > 0) {
          return next(validationError(tmDetails));
        }
      }

      const option =
        optionId !== undefined
          ? await resolveOptionForGame({
              game,
              optionId,
              optionField: 'optionId',
              requireWhenAvailable: false,
            })
          : undefined;

      const payload = await updateMultiplayerMatchTerraformingMars({
        match: { id: match.id, gameId: game.id },
        playedOn,
        notes,
        players: normalizedPlayers,
        option,
      });
      return res.json(payload);
    }

    return next(
      validationError([
        { field: 'gameId', message: 'unsupported scoring type for this endpoint' },
      ])
    );
  } catch (error) {
    if (error && error.code === 'MULTIPLAYER_MATCH_NOT_FOUND') {
      return next(notFound('Multiplayer match not found'));
    }
    return next(error);
  }
});

router.delete('/multiplayer/matches/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) {
      return next(validationError([{ field: 'id', message: 'must be a valid UUID' }]));
    }

    await deleteMultiplayerMatch(id);
    return res.status(204).send();
  } catch (error) {
    if (error && error.code === 'MULTIPLAYER_MATCH_NOT_FOUND') {
      return next(notFound('Multiplayer match not found'));
    }
    return next(error);
  }
});

module.exports = router;
