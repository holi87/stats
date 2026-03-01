const express = require('express');
const { conflict, notFound, validationError } = require('../errors');
const {
  createManualMultiplayerGame,
  createCustomMultiplayerGame,
  listMultiplayerGames,
  getMultiplayerGameByCode,
  updateMultiplayerGame,
  deleteConfigurableMultiplayerGameAndStats,
  listCustomScoringFields,
  listMultiplayerGameOptions,
  updateMultiplayerGameOption,
  createMultiplayerGameOption,
} = require('../services/multiplayer-games-service');

const router = express.Router();

function slugifyCode(input) {
  return String(input)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

function parseIntegerOrDefault(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
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

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function normalizeCalculatorButtonLabel(value, details, field = 'calculatorButtonLabel') {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    details.push({ field, message: 'must be a string' });
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.length > 40) {
    details.push({ field, message: 'max length is 40' });
    return undefined;
  }

  return trimmed;
}

function normalizeCalculatorUrl(value, details, field = 'calculatorUrl') {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    details.push({ field, message: 'must be a string' });
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.length > 400) {
    details.push({ field, message: 'max length is 400' });
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        details.push({ field, message: 'must use http or https' });
        return undefined;
      }
      return parsed.toString();
    } catch (_error) {
      details.push({ field, message: 'must be a valid URL or local path' });
      return undefined;
    }
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    details.push({ field, message: 'only http/https URLs are allowed' });
    return undefined;
  }
  if (trimmed.includes(' ')) {
    details.push({ field, message: 'cannot contain spaces' });
    return undefined;
  }

  const normalizedPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (normalizedPath.startsWith('//')) {
    details.push({ field, message: 'protocol-relative paths are not allowed' });
    return undefined;
  }

  return normalizedPath;
}

router.get('/multiplayer/games', async (req, res, next) => {
  try {
    const includeInactive = parseBooleanQuery(req.query.includeInactive, false);
    if (includeInactive === null) {
      return next(
        validationError([{ field: 'includeInactive', message: 'must be a boolean (true/false)' }])
      );
    }

    const games = await listMultiplayerGames({ includeInactive });
    res.json(games);
  } catch (error) {
    next(error);
  }
});

router.post('/multiplayer/games', async (req, res, next) => {
  try {
    const {
      code,
      displayName,
      minPlayers,
      maxPlayers,
      showInQuickMenu,
      isActive,
      optionsExclusive,
      calculatorButtonLabel,
      calculatorUrl,
      scoringType,
      customCalculator,
    } = req.body || {};
    const details = [];

    if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') {
      details.push({ field: 'displayName', message: 'is required' });
    } else if (displayName.trim().length > 80) {
      details.push({ field: 'displayName', message: 'max length is 80' });
    }

    let normalizedCode = '';
    if (code !== undefined && code !== null && code !== '') {
      if (typeof code !== 'string') {
        details.push({ field: 'code', message: 'must be a string' });
      } else {
        normalizedCode = slugifyCode(code);
      }
    } else if (typeof displayName === 'string' && displayName.trim()) {
      normalizedCode = slugifyCode(displayName);
    }

    if (!normalizedCode) {
      details.push({ field: 'code', message: 'must include letters or numbers' });
    }

    if (!/^[a-z0-9_]{2,64}$/.test(normalizedCode)) {
      details.push({
        field: 'code',
        message: 'must contain 2-64 chars: lowercase letters, digits or underscore',
      });
    }

    const normalizedMinPlayers = parseIntegerOrDefault(minPlayers, 1);
    const normalizedMaxPlayers = parseIntegerOrDefault(maxPlayers, 4);

    if (normalizedMinPlayers === null || normalizedMinPlayers < 1) {
      details.push({ field: 'minPlayers', message: 'must be an integer greater than or equal to 1' });
    }

    if (normalizedMaxPlayers === null || normalizedMaxPlayers < 1) {
      details.push({ field: 'maxPlayers', message: 'must be an integer greater than or equal to 1' });
    }

    if (
      normalizedMinPlayers !== null &&
      normalizedMaxPlayers !== null &&
      normalizedMinPlayers > normalizedMaxPlayers
    ) {
      details.push({ field: 'minPlayers', message: 'must be less than or equal to maxPlayers' });
    }

    let normalizedShowInQuickMenu = true;
    if (showInQuickMenu !== undefined) {
      if (typeof showInQuickMenu !== 'boolean') {
        details.push({ field: 'showInQuickMenu', message: 'must be a boolean' });
      } else {
        normalizedShowInQuickMenu = showInQuickMenu;
      }
    }

    let normalizedIsActive = true;
    if (isActive !== undefined) {
      if (typeof isActive !== 'boolean') {
        details.push({ field: 'isActive', message: 'must be a boolean' });
      } else {
        normalizedIsActive = isActive;
      }
    }

    let normalizedOptionsExclusive = true;
    if (optionsExclusive !== undefined) {
      if (typeof optionsExclusive !== 'boolean') {
        details.push({ field: 'optionsExclusive', message: 'must be a boolean' });
      } else {
        normalizedOptionsExclusive = optionsExclusive;
      }
    }

    let normalizedCalculatorButtonLabel = normalizeCalculatorButtonLabel(
      calculatorButtonLabel,
      details
    );
    let normalizedCalculatorUrl = normalizeCalculatorUrl(calculatorUrl, details);

    if (normalizedCalculatorUrl && !normalizedCalculatorButtonLabel) {
      normalizedCalculatorButtonLabel = 'Kalkulator';
    }

    let normalizedScoringType = 'MANUAL_POINTS';
    if (scoringType !== undefined) {
      if (scoringType !== 'MANUAL_POINTS' && scoringType !== 'CUSTOM_CALCULATOR') {
        details.push({
          field: 'scoringType',
          message: 'must be one of: MANUAL_POINTS, CUSTOM_CALCULATOR',
        });
      } else {
        normalizedScoringType = scoringType;
      }
    }

    const normalizedCustomFields = [];
    if (normalizedScoringType === 'CUSTOM_CALCULATOR') {
      if (!customCalculator || typeof customCalculator !== 'object' || Array.isArray(customCalculator)) {
        details.push({ field: 'customCalculator', message: 'must be an object' });
      } else if (!Array.isArray(customCalculator.fields)) {
        details.push({ field: 'customCalculator.fields', message: 'must be an array' });
      } else {
        if (customCalculator.fields.length < 1 || customCalculator.fields.length > 12) {
          details.push({
            field: 'customCalculator.fields',
            message: 'must include between 1 and 12 fields',
          });
        }

        customCalculator.fields.forEach((field, index) => {
          if (!field || typeof field !== 'object' || Array.isArray(field)) {
            details.push({
              field: `customCalculator.fields[${index}]`,
              message: 'must be an object',
            });
            return;
          }

          const fieldLabel = typeof field.label === 'string' ? field.label.trim() : '';
          if (!fieldLabel) {
            details.push({
              field: `customCalculator.fields[${index}].label`,
              message: 'is required',
            });
          } else if (fieldLabel.length > 80) {
            details.push({
              field: `customCalculator.fields[${index}].label`,
              message: 'max length is 80',
            });
          }

          let fieldDescription = null;
          if (field.description !== undefined && field.description !== null) {
            if (typeof field.description !== 'string') {
              details.push({
                field: `customCalculator.fields[${index}].description`,
                message: 'must be a string',
              });
            } else if (field.description.trim().length > 240) {
              details.push({
                field: `customCalculator.fields[${index}].description`,
                message: 'max length is 240',
              });
            } else {
              fieldDescription = field.description.trim() || null;
            }
          }

          const rawFieldCode =
            typeof field.code === 'string' && field.code.trim() !== ''
              ? field.code
              : fieldLabel;
          const normalizedFieldCode = slugifyCode(rawFieldCode).slice(0, 40);
          if (!/^[a-z0-9_]{2,40}$/.test(normalizedFieldCode)) {
            details.push({
              field: `customCalculator.fields[${index}].code`,
              message: 'must contain 2-40 chars: lowercase letters, digits or underscore',
            });
          }

          if (!Number.isInteger(field.pointsPerUnit)) {
            details.push({
              field: `customCalculator.fields[${index}].pointsPerUnit`,
              message: 'must be an integer',
            });
          } else if (field.pointsPerUnit < -1000 || field.pointsPerUnit > 1000) {
            details.push({
              field: `customCalculator.fields[${index}].pointsPerUnit`,
              message: 'must be between -1000 and 1000',
            });
          } else if (field.pointsPerUnit === 0) {
            details.push({
              field: `customCalculator.fields[${index}].pointsPerUnit`,
              message: 'cannot be 0',
            });
          }

          normalizedCustomFields.push({
            code: normalizedFieldCode,
            label: fieldLabel,
            description: fieldDescription,
            pointsPerUnit: field.pointsPerUnit,
          });
        });

        const codes = normalizedCustomFields.map((field) => field.code).filter(Boolean);
        const uniqueCodes = new Set(codes);
        if (uniqueCodes.size !== codes.length) {
          details.push({
            field: 'customCalculator.fields',
            message: 'field codes must be unique',
          });
        }
      }
    } else if (customCalculator !== undefined) {
      details.push({
        field: 'customCalculator',
        message: 'is supported only with scoringType=CUSTOM_CALCULATOR',
      });
    }

    if (details.length > 0) {
      return next(validationError(details));
    }

    try {
      const created =
        normalizedScoringType === 'CUSTOM_CALCULATOR'
          ? await createCustomMultiplayerGame({
              code: normalizedCode,
              displayName: displayName.trim(),
              minPlayers: normalizedMinPlayers,
              maxPlayers: normalizedMaxPlayers,
              showInQuickMenu: normalizedShowInQuickMenu,
              isActive: normalizedIsActive,
              optionsExclusive: normalizedOptionsExclusive,
              calculatorButtonLabel: normalizedCalculatorButtonLabel,
              calculatorUrl: normalizedCalculatorUrl,
              fields: normalizedCustomFields,
            })
          : await createManualMultiplayerGame({
              code: normalizedCode,
              displayName: displayName.trim(),
              minPlayers: normalizedMinPlayers,
              maxPlayers: normalizedMaxPlayers,
              showInQuickMenu: normalizedShowInQuickMenu,
              isActive: normalizedIsActive,
              optionsExclusive: normalizedOptionsExclusive,
              calculatorButtonLabel: normalizedCalculatorButtonLabel,
              calculatorUrl: normalizedCalculatorUrl,
            });

      return res.status(201).json(created);
    } catch (error) {
      if (error && error.code === 'MULTIPLAYER_GAME_CODE_CONFLICT') {
        return next(conflict('Multiplayer game code already exists'));
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

router.get('/multiplayer/games/:code', async (req, res, next) => {
  try {
    const { code } = req.params;
    if (!code) {
      return next(validationError([{ field: 'code', message: 'is required' }]));
    }

    const includeInactive = parseBooleanQuery(req.query.includeInactive, false);
    if (includeInactive === null) {
      return next(
        validationError([{ field: 'includeInactive', message: 'must be a boolean (true/false)' }])
      );
    }

    const game = await getMultiplayerGameByCode(code, { includeInactive });
    if (!game) {
      return next(notFound('Multiplayer game not found'));
    }
    return res.json(game);
  } catch (error) {
    return next(error);
  }
});

router.get('/multiplayer/games/:code/calculator-fields', async (req, res, next) => {
  try {
    const { code } = req.params;
    if (!code) {
      return next(validationError([{ field: 'code', message: 'is required' }]));
    }

    const includeInactive = parseBooleanQuery(req.query.includeInactive, false);
    if (includeInactive === null) {
      return next(
        validationError([{ field: 'includeInactive', message: 'must be a boolean (true/false)' }])
      );
    }

    const game = await getMultiplayerGameByCode(code, { includeInactive });
    if (!game) {
      return next(notFound('Multiplayer game not found'));
    }

    if (game.scoringType !== 'CUSTOM_CALCULATOR') {
      return res.json([]);
    }

    const fields = await listCustomScoringFields({ gameId: game.id, includeInactive });
    return res.json(fields);
  } catch (error) {
    return next(error);
  }
});

router.patch('/multiplayer/games/:code', async (req, res, next) => {
  try {
    const { code } = req.params;
    if (!code) {
      return next(validationError([{ field: 'code', message: 'is required' }]));
    }

    const existing = await getMultiplayerGameByCode(code, { includeInactive: true });
    if (!existing) {
      return next(notFound('Multiplayer game not found'));
    }

    const {
      displayName,
      minPlayers,
      maxPlayers,
      showInQuickMenu,
      isActive,
      optionsExclusive,
      calculatorButtonLabel,
      calculatorUrl,
    } = req.body || {};
    const details = [];

    const hasDisplayName = displayName !== undefined;
    const hasMinPlayers = minPlayers !== undefined;
    const hasMaxPlayers = maxPlayers !== undefined;
    const hasShowInQuickMenu = showInQuickMenu !== undefined;
    const hasIsActive = isActive !== undefined;
    const hasOptionsExclusive = optionsExclusive !== undefined;
    const hasCalculatorButtonLabel = calculatorButtonLabel !== undefined;
    const hasCalculatorUrl = calculatorUrl !== undefined;

    if (
      !hasDisplayName &&
      !hasMinPlayers &&
      !hasMaxPlayers &&
      !hasShowInQuickMenu &&
      !hasIsActive &&
      !hasOptionsExclusive &&
      !hasCalculatorButtonLabel &&
      !hasCalculatorUrl
    ) {
      return next(
        validationError([
          {
            field: 'body',
            message:
              'must include at least one of: displayName, minPlayers, maxPlayers, showInQuickMenu, isActive, optionsExclusive, calculatorButtonLabel, calculatorUrl',
          },
        ])
      );
    }

    let normalizedDisplayName;
    if (hasDisplayName) {
      if (typeof displayName !== 'string') {
        details.push({ field: 'displayName', message: 'must be a string' });
      } else if (displayName.trim() === '') {
        details.push({ field: 'displayName', message: 'cannot be empty' });
      } else if (displayName.trim().length > 80) {
        details.push({ field: 'displayName', message: 'max length is 80' });
      } else {
        normalizedDisplayName = displayName.trim();
      }
    }

    let normalizedMinPlayers;
    if (hasMinPlayers) {
      if (!Number.isInteger(minPlayers)) {
        details.push({ field: 'minPlayers', message: 'must be an integer' });
      } else if (minPlayers < 1) {
        details.push({ field: 'minPlayers', message: 'must be an integer greater than or equal to 1' });
      } else {
        normalizedMinPlayers = minPlayers;
      }
    }

    let normalizedMaxPlayers;
    if (hasMaxPlayers) {
      if (!Number.isInteger(maxPlayers)) {
        details.push({ field: 'maxPlayers', message: 'must be an integer' });
      } else if (maxPlayers < 1) {
        details.push({ field: 'maxPlayers', message: 'must be an integer greater than or equal to 1' });
      } else {
        normalizedMaxPlayers = maxPlayers;
      }
    }

    let normalizedShowInQuickMenu;
    if (hasShowInQuickMenu) {
      if (typeof showInQuickMenu !== 'boolean') {
        details.push({ field: 'showInQuickMenu', message: 'must be a boolean' });
      } else {
        normalizedShowInQuickMenu = showInQuickMenu;
      }
    }

    let normalizedIsActive;
    if (hasIsActive) {
      if (typeof isActive !== 'boolean') {
        details.push({ field: 'isActive', message: 'must be a boolean' });
      } else {
        normalizedIsActive = isActive;
      }
    }

    let normalizedOptionsExclusive;
    if (hasOptionsExclusive) {
      if (typeof optionsExclusive !== 'boolean') {
        details.push({ field: 'optionsExclusive', message: 'must be a boolean' });
      } else {
        normalizedOptionsExclusive = optionsExclusive;
      }
    }

    let normalizedCalculatorButtonLabel = normalizeCalculatorButtonLabel(
      calculatorButtonLabel,
      details
    );
    let normalizedCalculatorUrl = normalizeCalculatorUrl(calculatorUrl, details);

    if (hasCalculatorUrl && normalizedCalculatorUrl === null && !hasCalculatorButtonLabel) {
      normalizedCalculatorButtonLabel = null;
    }
    if (
      normalizedCalculatorUrl &&
      normalizedCalculatorButtonLabel === undefined &&
      !existing.calculatorButtonLabel
    ) {
      normalizedCalculatorButtonLabel = 'Kalkulator';
    }
    if (normalizedCalculatorUrl && !normalizedCalculatorButtonLabel && hasCalculatorButtonLabel) {
      normalizedCalculatorButtonLabel = 'Kalkulator';
    }

    if (details.length === 0) {
      const effectiveMinPlayers = normalizedMinPlayers ?? existing.minPlayers;
      const effectiveMaxPlayers = normalizedMaxPlayers ?? existing.maxPlayers;
      if (effectiveMinPlayers > effectiveMaxPlayers) {
        details.push({ field: 'minPlayers', message: 'must be less than or equal to maxPlayers' });
      }
    }

    if (details.length > 0) {
      return next(validationError(details));
    }

    const updated = await updateMultiplayerGame({
      code,
      displayName: normalizedDisplayName,
      minPlayers: normalizedMinPlayers,
      maxPlayers: normalizedMaxPlayers,
      showInQuickMenu: normalizedShowInQuickMenu,
      isActive: normalizedIsActive,
      optionsExclusive: normalizedOptionsExclusive,
      calculatorButtonLabel: normalizedCalculatorButtonLabel,
      calculatorUrl: normalizedCalculatorUrl,
    });
    if (!updated) {
      return next(notFound('Multiplayer game not found'));
    }

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

router.delete('/multiplayer/games/:code', async (req, res, next) => {
  try {
    const { code } = req.params;
    if (!code) {
      return next(validationError([{ field: 'code', message: 'is required' }]));
    }

    try {
      const result = await deleteConfigurableMultiplayerGameAndStats({ code });
      return res.json(result);
    } catch (error) {
      if (error && error.code === 'MULTIPLAYER_GAME_NOT_FOUND') {
        return next(notFound('Multiplayer game not found'));
      }
      if (error && error.code === 'MULTIPLAYER_GAME_DELETE_BLOCKED') {
        return next(conflict('Game uses dedicated calculator and cannot be deleted'));
      }
      throw error;
    }
  } catch (error) {
    return next(error);
  }
});

router.get('/multiplayer/games/:code/options', async (req, res, next) => {
  try {
    const { code } = req.params;
    if (!code) {
      return next(validationError([{ field: 'code', message: 'is required' }]));
    }

    const includeInactive = parseBooleanQuery(req.query.includeInactive, false);
    if (includeInactive === null) {
      return next(
        validationError([{ field: 'includeInactive', message: 'must be a boolean (true/false)' }])
      );
    }

    const game = await getMultiplayerGameByCode(code, { includeInactive });
    if (!game) {
      return next(notFound('Multiplayer game not found'));
    }

    const options = await listMultiplayerGameOptions({ gameId: game.id, includeInactive });
    return res.json(options);
  } catch (error) {
    return next(error);
  }
});

router.post('/multiplayer/games/:code/options', async (req, res, next) => {
  try {
    const { code } = req.params;
    if (!code) {
      return next(validationError([{ field: 'code', message: 'is required' }]));
    }

    const { displayName, optionCode, sortOrder } = req.body || {};
    const details = [];

    let normalizedDisplayName = '';
    if (typeof displayName !== 'string') {
      details.push({ field: 'displayName', message: 'must be a string' });
    } else {
      normalizedDisplayName = displayName.trim();
      if (!normalizedDisplayName) {
        details.push({ field: 'displayName', message: 'is required' });
      } else if (normalizedDisplayName.length > 80) {
        details.push({ field: 'displayName', message: 'max length is 80' });
      }
    }

    let normalizedOptionCode = '';
    if (optionCode !== undefined && optionCode !== null && optionCode !== '') {
      if (typeof optionCode !== 'string') {
        details.push({ field: 'optionCode', message: 'must be a string' });
      } else {
        normalizedOptionCode = slugifyCode(optionCode);
      }
    } else if (normalizedDisplayName) {
      normalizedOptionCode = slugifyCode(normalizedDisplayName);
    }

    if (!normalizedOptionCode) {
      details.push({ field: 'optionCode', message: 'must include letters or numbers' });
    } else if (!/^[a-z0-9_]{2,64}$/.test(normalizedOptionCode)) {
      details.push({
        field: 'optionCode',
        message: 'must contain 2-64 chars: lowercase letters, digits or underscore',
      });
    }

    let normalizedSortOrder;
    if (sortOrder !== undefined) {
      if (!Number.isInteger(sortOrder)) {
        details.push({ field: 'sortOrder', message: 'must be an integer' });
      } else if (sortOrder < 0 || sortOrder > 9999) {
        details.push({ field: 'sortOrder', message: 'must be between 0 and 9999' });
      } else {
        normalizedSortOrder = sortOrder;
      }
    }

    if (details.length > 0) {
      return next(validationError(details));
    }

    const game = await getMultiplayerGameByCode(code, { includeInactive: true });
    if (!game) {
      return next(notFound('Multiplayer game not found'));
    }

    const created = await createMultiplayerGameOption({
      gameId: game.id,
      code: normalizedOptionCode,
      displayName: normalizedDisplayName,
      sortOrder: normalizedSortOrder,
    });

    return res.status(201).json(created);
  } catch (error) {
    return next(error);
  }
});

router.patch('/multiplayer/games/:code/options/:optionId', async (req, res, next) => {
  try {
    const { code, optionId } = req.params;
    if (!code) {
      return next(validationError([{ field: 'code', message: 'is required' }]));
    }
    if (!isUuid(optionId)) {
      return next(validationError([{ field: 'optionId', message: 'must be a valid UUID' }]));
    }

    const { displayName } = req.body || {};
    const details = [];
    const hasDisplayName = displayName !== undefined;

    if (!hasDisplayName) {
      return next(
        validationError([
          {
            field: 'body',
            message: 'must include at least one of: displayName',
          },
        ])
      );
    }

    let normalizedDisplayName;
    if (hasDisplayName) {
      if (typeof displayName !== 'string') {
        details.push({ field: 'displayName', message: 'must be a string' });
      } else if (displayName.trim() === '') {
        details.push({ field: 'displayName', message: 'cannot be empty' });
      } else if (displayName.trim().length > 80) {
        details.push({ field: 'displayName', message: 'max length is 80' });
      } else {
        normalizedDisplayName = displayName.trim();
      }
    }

    if (details.length > 0) {
      return next(validationError(details));
    }

    const game = await getMultiplayerGameByCode(code, { includeInactive: true });
    if (!game) {
      return next(notFound('Multiplayer game not found'));
    }

    const updated = await updateMultiplayerGameOption({
      gameId: game.id,
      optionId,
      displayName: normalizedDisplayName,
    });
    if (!updated) {
      return next(notFound('Multiplayer game option not found'));
    }

    return res.json(updated);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
