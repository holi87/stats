const { getPool } = require('../db');

const EXPORT_SCHEMA_VERSION = 1;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TTR_TRAINS_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

const COLLECTION_KEYS = [
  'games',
  'players',
  'matches',
  'ticketToRideVariants',
  'multiplayerGames',
  'multiplayerGameOptions',
  'multiplayerMatches',
  'multiplayerMatchOptions',
  'multiplayerMatchPlayers',
  'multiplayerTicketToRideMatches',
  'multiplayerTicketToRidePlayerDetails',
  'multiplayerTerraformingMarsPlayerDetails',
  'multiplayerCustomScoringFields',
  'multiplayerCustomMatchPlayerValues',
];

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function isDateString(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isTimestampString(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function isOptionalTimestamp(value) {
  return value === undefined || value === null || isTimestampString(value);
}

function pushError(details, field, message) {
  details.push({ field, message });
}

function ensureUnique(records, fieldPath, keySelector, details) {
  const seen = new Map();
  records.forEach((record, index) => {
    const key = keySelector(record);
    if (key === null || key === undefined) {
      return;
    }
    if (seen.has(key)) {
      const previousIndex = seen.get(key);
      pushError(
        details,
        `${fieldPath}[${index}]`,
        `duplicates entry from index ${previousIndex} for key ${key}`
      );
      return;
    }
    seen.set(key, index);
  });
}

function ensureInteger(details, fieldPath, value, options = {}) {
  if (!Number.isInteger(value)) {
    pushError(details, fieldPath, 'must be an integer');
    return;
  }

  if (options.min !== undefined && value < options.min) {
    pushError(details, fieldPath, `must be >= ${options.min}`);
  }

  if (options.max !== undefined && value > options.max) {
    pushError(details, fieldPath, `must be <= ${options.max}`);
  }
}

function buildRequiredCollections(payload, details, warnings) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    pushError(details, 'payload', 'must be an object');
    return null;
  }

  if (payload.version !== EXPORT_SCHEMA_VERSION) {
    pushError(
      details,
      'payload.version',
      `unsupported version, expected ${EXPORT_SCHEMA_VERSION}`
    );
  }

  if (!payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    pushError(details, 'payload.data', 'must be an object');
    return null;
  }

  const collections = {};
  COLLECTION_KEYS.forEach((key) => {
    const value = payload.data[key];
    if (value === undefined) {
      collections[key] = [];
      return;
    }
    if (!Array.isArray(value)) {
      pushError(details, `payload.data.${key}`, 'must be an array');
      collections[key] = [];
      return;
    }
    collections[key] = value;
  });

  const extraKeys = Object.keys(payload.data).filter((key) => !COLLECTION_KEYS.includes(key));
  if (extraKeys.length > 0) {
    warnings.push(
      `Unknown top-level collections ignored: ${extraKeys.sort().join(', ')}`
    );
  }

  return collections;
}

function validateGames(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.games[${index}]`;
    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (typeof row.code !== 'string' || row.code.trim() === '') {
      pushError(details, `${base}.code`, 'must be a non-empty string');
    }
    if (typeof row.name !== 'string' || row.name.trim() === '') {
      pushError(details, `${base}.name`, 'must be a non-empty string');
    }
    if (row.isActive !== undefined && typeof row.isActive !== 'boolean') {
      pushError(details, `${base}.isActive`, 'must be a boolean');
    }
    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(records, 'payload.data.games', (row) => row.id, details);
  ensureUnique(records, 'payload.data.games', (row) => row.code, details);
}

function validatePlayers(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.players[${index}]`;
    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (typeof row.name !== 'string' || row.name.trim() === '') {
      pushError(details, `${base}.name`, 'must be a non-empty string');
    }
    if (row.isActive !== undefined && typeof row.isActive !== 'boolean') {
      pushError(details, `${base}.isActive`, 'must be a boolean');
    }
    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(records, 'payload.data.players', (row) => row.id, details);
  ensureUnique(records, 'payload.data.players', (row) => row.name, details);
}

function validateMatches(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.matches[${index}]`;

    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (!isUuid(row.gameId)) {
      pushError(details, `${base}.gameId`, 'must be a valid UUID');
    }
    if (!isDateString(row.playedOn)) {
      pushError(details, `${base}.playedOn`, 'must be in YYYY-MM-DD format');
    }
    if (!isUuid(row.playerAId)) {
      pushError(details, `${base}.playerAId`, 'must be a valid UUID');
    }
    if (!isUuid(row.playerBId)) {
      pushError(details, `${base}.playerBId`, 'must be a valid UUID');
    }
    if (row.playerAId === row.playerBId) {
      pushError(details, `${base}.playerBId`, 'must differ from playerAId');
    }

    ensureInteger(details, `${base}.scoreA`, row.scoreA, { min: 0 });
    ensureInteger(details, `${base}.scoreB`, row.scoreB, { min: 0 });

    if (row.notes !== undefined && row.notes !== null && typeof row.notes !== 'string') {
      pushError(details, `${base}.notes`, 'must be a string or null');
    }
    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
    if (!isOptionalTimestamp(row.updatedAt)) {
      pushError(details, `${base}.updatedAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(records, 'payload.data.matches', (row) => row.id, details);
}

function validateTicketToRideVariants(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.ticketToRideVariants[${index}]`;
    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (typeof row.code !== 'string' || row.code.trim() === '') {
      pushError(details, `${base}.code`, 'must be a non-empty string');
    }
    if (typeof row.name !== 'string' || row.name.trim() === '') {
      pushError(details, `${base}.name`, 'must be a non-empty string');
    }
    if (row.isActive !== undefined && typeof row.isActive !== 'boolean') {
      pushError(details, `${base}.isActive`, 'must be a boolean');
    }
    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(records, 'payload.data.ticketToRideVariants', (row) => row.id, details);
  ensureUnique(records, 'payload.data.ticketToRideVariants', (row) => row.code, details);
}

function validateMultiplayerGames(records, details) {
  const allowedScoringTypes = new Set([
    'MANUAL_POINTS',
    'TTR_CALCULATOR',
    'TM_CALCULATOR',
    'CUSTOM_CALCULATOR',
  ]);

  records.forEach((row, index) => {
    const base = `payload.data.multiplayerGames[${index}]`;

    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (typeof row.code !== 'string' || row.code.trim() === '') {
      pushError(details, `${base}.code`, 'must be a non-empty string');
    }
    if (typeof row.displayName !== 'string' || row.displayName.trim() === '') {
      pushError(details, `${base}.displayName`, 'must be a non-empty string');
    }
    if (!allowedScoringTypes.has(row.scoringType)) {
      pushError(details, `${base}.scoringType`, 'is invalid');
    }

    ensureInteger(details, `${base}.minPlayers`, row.minPlayers, { min: 1 });
    ensureInteger(details, `${base}.maxPlayers`, row.maxPlayers, { min: 1 });

    if (
      Number.isInteger(row.minPlayers) &&
      Number.isInteger(row.maxPlayers) &&
      row.minPlayers > row.maxPlayers
    ) {
      pushError(details, `${base}.minPlayers`, 'must be <= maxPlayers');
    }

    if (row.isActive !== undefined && typeof row.isActive !== 'boolean') {
      pushError(details, `${base}.isActive`, 'must be a boolean');
    }
    if (row.showInOneVsOne !== undefined && typeof row.showInOneVsOne !== 'boolean') {
      pushError(details, `${base}.showInOneVsOne`, 'must be a boolean');
    }
    if (row.showInMultiplayer !== undefined && typeof row.showInMultiplayer !== 'boolean') {
      pushError(details, `${base}.showInMultiplayer`, 'must be a boolean');
    }
    if (
      row.optionsExclusive !== undefined &&
      row.optionsExclusive !== null &&
      typeof row.optionsExclusive !== 'boolean'
    ) {
      pushError(details, `${base}.optionsExclusive`, 'must be a boolean or null');
    }
    if (
      row.calculatorButtonLabel !== undefined &&
      row.calculatorButtonLabel !== null &&
      (typeof row.calculatorButtonLabel !== 'string' || row.calculatorButtonLabel.trim() === '')
    ) {
      pushError(details, `${base}.calculatorButtonLabel`, 'must be a non-empty string or null');
    } else if (
      typeof row.calculatorButtonLabel === 'string' &&
      row.calculatorButtonLabel.trim().length > 40
    ) {
      pushError(details, `${base}.calculatorButtonLabel`, 'max length is 40');
    }
    if (
      row.calculatorUrl !== undefined &&
      row.calculatorUrl !== null &&
      (typeof row.calculatorUrl !== 'string' || row.calculatorUrl.trim() === '')
    ) {
      pushError(details, `${base}.calculatorUrl`, 'must be a non-empty string or null');
    } else if (typeof row.calculatorUrl === 'string' && row.calculatorUrl.trim().length > 400) {
      pushError(details, `${base}.calculatorUrl`, 'max length is 400');
    }
    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(records, 'payload.data.multiplayerGames', (row) => row.id, details);
  ensureUnique(records, 'payload.data.multiplayerGames', (row) => row.code, details);
}

function validateMultiplayerGameOptions(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.multiplayerGameOptions[${index}]`;

    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (!isUuid(row.gameId)) {
      pushError(details, `${base}.gameId`, 'must be a valid UUID');
    }
    if (typeof row.code !== 'string' || row.code.trim() === '') {
      pushError(details, `${base}.code`, 'must be a non-empty string');
    }
    if (typeof row.displayName !== 'string' || row.displayName.trim() === '') {
      pushError(details, `${base}.displayName`, 'must be a non-empty string');
    }

    ensureInteger(details, `${base}.sortOrder`, row.sortOrder);

    if (row.isActive !== undefined && typeof row.isActive !== 'boolean') {
      pushError(details, `${base}.isActive`, 'must be a boolean');
    }

    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(records, 'payload.data.multiplayerGameOptions', (row) => row.id, details);
  ensureUnique(
    records,
    'payload.data.multiplayerGameOptions',
    (row) => `${row.gameId || ''}:${row.code || ''}`,
    details
  );
}

function validateMultiplayerMatches(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.multiplayerMatches[${index}]`;

    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (!isUuid(row.gameId)) {
      pushError(details, `${base}.gameId`, 'must be a valid UUID');
    }
    if (!isDateString(row.playedOn)) {
      pushError(details, `${base}.playedOn`, 'must be in YYYY-MM-DD format');
    }
    if (row.notes !== undefined && row.notes !== null && typeof row.notes !== 'string') {
      pushError(details, `${base}.notes`, 'must be a string or null');
    }
    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
    if (!isOptionalTimestamp(row.updatedAt)) {
      pushError(details, `${base}.updatedAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(records, 'payload.data.multiplayerMatches', (row) => row.id, details);
}

function validateMultiplayerMatchOptions(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.multiplayerMatchOptions[${index}]`;

    if (!isUuid(row.matchId)) {
      pushError(details, `${base}.matchId`, 'must be a valid UUID');
    }
    if (!isUuid(row.gameId)) {
      pushError(details, `${base}.gameId`, 'must be a valid UUID');
    }
    if (!isUuid(row.optionId)) {
      pushError(details, `${base}.optionId`, 'must be a valid UUID');
    }

    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(
    records,
    'payload.data.multiplayerMatchOptions',
    (row) => `${row.matchId || ''}:${row.optionId || ''}`,
    details
  );
}

function validateMultiplayerMatchPlayers(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.multiplayerMatchPlayers[${index}]`;

    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (!isUuid(row.matchId)) {
      pushError(details, `${base}.matchId`, 'must be a valid UUID');
    }
    if (!isUuid(row.playerId)) {
      pushError(details, `${base}.playerId`, 'must be a valid UUID');
    }

    ensureInteger(details, `${base}.totalPoints`, row.totalPoints);

    if (row.place !== null && row.place !== undefined) {
      ensureInteger(details, `${base}.place`, row.place, { min: 1 });
    }

    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
    if (!isOptionalTimestamp(row.updatedAt)) {
      pushError(details, `${base}.updatedAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(records, 'payload.data.multiplayerMatchPlayers', (row) => row.id, details);
  ensureUnique(
    records,
    'payload.data.multiplayerMatchPlayers',
    (row) => `${row.matchId || ''}:${row.playerId || ''}`,
    details
  );
}

function isValidTrainsCounts(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value).sort();
  const expected = [...TTR_TRAINS_KEYS];
  if (keys.length !== expected.length || !keys.every((key, index) => key === expected[index])) {
    return false;
  }

  return expected.every((key) => Number.isInteger(value[key]) && value[key] >= 0);
}

function validateMultiplayerTicketToRideMatches(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.multiplayerTicketToRideMatches[${index}]`;

    if (!isUuid(row.matchId)) {
      pushError(details, `${base}.matchId`, 'must be a valid UUID');
    }
    if (!isUuid(row.variantId)) {
      pushError(details, `${base}.variantId`, 'must be a valid UUID');
    }
  });

  ensureUnique(records, 'payload.data.multiplayerTicketToRideMatches', (row) => row.matchId, details);
}

function validateMultiplayerTicketToRidePlayerDetails(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.multiplayerTicketToRidePlayerDetails[${index}]`;

    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (!isUuid(row.matchPlayerId)) {
      pushError(details, `${base}.matchPlayerId`, 'must be a valid UUID');
    }

    ensureInteger(details, `${base}.ticketsPoints`, row.ticketsPoints);
    ensureInteger(details, `${base}.bonusPoints`, row.bonusPoints, { min: 0 });
    ensureInteger(details, `${base}.trainsPoints`, row.trainsPoints, { min: 0 });

    if (!isValidTrainsCounts(row.trainsCounts)) {
      pushError(details, `${base}.trainsCounts`, 'must include keys 1..9 with integer values >= 0');
    }
  });

  ensureUnique(
    records,
    'payload.data.multiplayerTicketToRidePlayerDetails',
    (row) => row.id,
    details
  );
  ensureUnique(
    records,
    'payload.data.multiplayerTicketToRidePlayerDetails',
    (row) => row.matchPlayerId,
    details
  );
}

function validateMultiplayerTerraformingMarsPlayerDetails(records, details) {
  const numericFields = [
    'titlesCount',
    'awardsFirstCount',
    'awardsSecondCount',
    'citiesPoints',
    'forestsPoints',
    'cardsPoints',
    'trPoints',
    'titlesPoints',
    'awardsFirstPoints',
    'awardsSecondPoints',
  ];

  records.forEach((row, index) => {
    const base = `payload.data.multiplayerTerraformingMarsPlayerDetails[${index}]`;

    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (!isUuid(row.matchPlayerId)) {
      pushError(details, `${base}.matchPlayerId`, 'must be a valid UUID');
    }

    numericFields.forEach((field) => {
      ensureInteger(details, `${base}.${field}`, row[field], { min: 0 });
    });
  });

  ensureUnique(
    records,
    'payload.data.multiplayerTerraformingMarsPlayerDetails',
    (row) => row.id,
    details
  );
  ensureUnique(
    records,
    'payload.data.multiplayerTerraformingMarsPlayerDetails',
    (row) => row.matchPlayerId,
    details
  );
}

function validateMultiplayerCustomScoringFields(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.multiplayerCustomScoringFields[${index}]`;

    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (!isUuid(row.gameId)) {
      pushError(details, `${base}.gameId`, 'must be a valid UUID');
    }
    if (typeof row.code !== 'string' || row.code.trim() === '') {
      pushError(details, `${base}.code`, 'must be a non-empty string');
    }
    if (typeof row.label !== 'string' || row.label.trim() === '') {
      pushError(details, `${base}.label`, 'must be a non-empty string');
    }
    if (row.description !== undefined && row.description !== null && typeof row.description !== 'string') {
      pushError(details, `${base}.description`, 'must be a string or null');
    }

    ensureInteger(details, `${base}.pointsPerUnit`, row.pointsPerUnit);
    ensureInteger(details, `${base}.sortOrder`, row.sortOrder);

    if (row.isActive !== undefined && typeof row.isActive !== 'boolean') {
      pushError(details, `${base}.isActive`, 'must be a boolean');
    }

    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(
    records,
    'payload.data.multiplayerCustomScoringFields',
    (row) => row.id,
    details
  );
  ensureUnique(
    records,
    'payload.data.multiplayerCustomScoringFields',
    (row) => `${row.gameId || ''}:${row.code || ''}`,
    details
  );
}

function validateMultiplayerCustomMatchPlayerValues(records, details) {
  records.forEach((row, index) => {
    const base = `payload.data.multiplayerCustomMatchPlayerValues[${index}]`;

    if (!isUuid(row.id)) {
      pushError(details, `${base}.id`, 'must be a valid UUID');
    }
    if (!isUuid(row.matchPlayerId)) {
      pushError(details, `${base}.matchPlayerId`, 'must be a valid UUID');
    }
    if (!isUuid(row.fieldId)) {
      pushError(details, `${base}.fieldId`, 'must be a valid UUID');
    }

    ensureInteger(details, `${base}.value`, row.value);
    ensureInteger(details, `${base}.points`, row.points);

    if (!isOptionalTimestamp(row.createdAt)) {
      pushError(details, `${base}.createdAt`, 'must be an ISO timestamp');
    }
  });

  ensureUnique(
    records,
    'payload.data.multiplayerCustomMatchPlayerValues',
    (row) => row.id,
    details
  );
  ensureUnique(
    records,
    'payload.data.multiplayerCustomMatchPlayerValues',
    (row) => `${row.matchPlayerId || ''}:${row.fieldId || ''}`,
    details
  );
}

function validateCrossReferences(collections, details) {
  const gameIds = new Set(collections.games.filter((row) => isUuid(row.id)).map((row) => row.id));
  const playerIds = new Set(collections.players.filter((row) => isUuid(row.id)).map((row) => row.id));
  const ttrVariantIds = new Set(
    collections.ticketToRideVariants.filter((row) => isUuid(row.id)).map((row) => row.id)
  );
  const multiplayerGameIds = new Set(
    collections.multiplayerGames.filter((row) => isUuid(row.id)).map((row) => row.id)
  );

  const multiplayerGameById = new Map(
    collections.multiplayerGames
      .filter((row) => isUuid(row.id))
      .map((row) => [row.id, row])
  );

  const multiplayerMatchesById = new Map(
    collections.multiplayerMatches
      .filter((row) => isUuid(row.id))
      .map((row) => [row.id, row])
  );

  const multiplayerOptionsById = new Map(
    collections.multiplayerGameOptions
      .filter((row) => isUuid(row.id))
      .map((row) => [row.id, row])
  );

  const multiplayerMatchPlayersById = new Map(
    collections.multiplayerMatchPlayers
      .filter((row) => isUuid(row.id))
      .map((row) => [row.id, row])
  );

  const customFieldsById = new Map(
    collections.multiplayerCustomScoringFields
      .filter((row) => isUuid(row.id))
      .map((row) => [row.id, row])
  );

  collections.matches.forEach((row, index) => {
    const base = `payload.data.matches[${index}]`;
    if (isUuid(row.gameId) && !gameIds.has(row.gameId)) {
      pushError(details, `${base}.gameId`, 'must reference payload.data.games.id');
    }
    if (isUuid(row.playerAId) && !playerIds.has(row.playerAId)) {
      pushError(details, `${base}.playerAId`, 'must reference payload.data.players.id');
    }
    if (isUuid(row.playerBId) && !playerIds.has(row.playerBId)) {
      pushError(details, `${base}.playerBId`, 'must reference payload.data.players.id');
    }
  });

  collections.multiplayerGameOptions.forEach((row, index) => {
    const base = `payload.data.multiplayerGameOptions[${index}]`;
    if (isUuid(row.gameId) && !multiplayerGameIds.has(row.gameId)) {
      pushError(details, `${base}.gameId`, 'must reference payload.data.multiplayerGames.id');
    }
  });

  collections.multiplayerMatches.forEach((row, index) => {
    const base = `payload.data.multiplayerMatches[${index}]`;
    if (isUuid(row.gameId) && !multiplayerGameIds.has(row.gameId)) {
      pushError(details, `${base}.gameId`, 'must reference payload.data.multiplayerGames.id');
    }
  });

  collections.multiplayerMatchPlayers.forEach((row, index) => {
    const base = `payload.data.multiplayerMatchPlayers[${index}]`;
    if (isUuid(row.matchId) && !multiplayerMatchesById.has(row.matchId)) {
      pushError(details, `${base}.matchId`, 'must reference payload.data.multiplayerMatches.id');
    }
    if (isUuid(row.playerId) && !playerIds.has(row.playerId)) {
      pushError(details, `${base}.playerId`, 'must reference payload.data.players.id');
    }
  });

  collections.multiplayerMatchOptions.forEach((row, index) => {
    const base = `payload.data.multiplayerMatchOptions[${index}]`;

    const match = isUuid(row.matchId) ? multiplayerMatchesById.get(row.matchId) : null;
    const option = isUuid(row.optionId) ? multiplayerOptionsById.get(row.optionId) : null;

    if (!match && isUuid(row.matchId)) {
      pushError(details, `${base}.matchId`, 'must reference payload.data.multiplayerMatches.id');
    }

    if (!option && isUuid(row.optionId)) {
      pushError(details, `${base}.optionId`, 'must reference payload.data.multiplayerGameOptions.id');
    }

    if (isUuid(row.gameId) && !multiplayerGameById.has(row.gameId)) {
      pushError(details, `${base}.gameId`, 'must reference payload.data.multiplayerGames.id');
    }

    if (match && row.gameId && match.gameId !== row.gameId) {
      pushError(details, `${base}.gameId`, 'must match multiplayer match gameId');
    }

    if (option && row.gameId && option.gameId !== row.gameId) {
      pushError(details, `${base}.gameId`, 'must match multiplayer option gameId');
    }
  });

  collections.multiplayerTicketToRideMatches.forEach((row, index) => {
    const base = `payload.data.multiplayerTicketToRideMatches[${index}]`;

    if (isUuid(row.matchId) && !multiplayerMatchesById.has(row.matchId)) {
      pushError(details, `${base}.matchId`, 'must reference payload.data.multiplayerMatches.id');
    }

    if (isUuid(row.variantId) && !ttrVariantIds.has(row.variantId)) {
      pushError(details, `${base}.variantId`, 'must reference payload.data.ticketToRideVariants.id');
    }
  });

  collections.multiplayerTicketToRidePlayerDetails.forEach((row, index) => {
    const base = `payload.data.multiplayerTicketToRidePlayerDetails[${index}]`;
    if (isUuid(row.matchPlayerId) && !multiplayerMatchPlayersById.has(row.matchPlayerId)) {
      pushError(details, `${base}.matchPlayerId`, 'must reference payload.data.multiplayerMatchPlayers.id');
    }
  });

  collections.multiplayerTerraformingMarsPlayerDetails.forEach((row, index) => {
    const base = `payload.data.multiplayerTerraformingMarsPlayerDetails[${index}]`;
    if (isUuid(row.matchPlayerId) && !multiplayerMatchPlayersById.has(row.matchPlayerId)) {
      pushError(details, `${base}.matchPlayerId`, 'must reference payload.data.multiplayerMatchPlayers.id');
    }
  });

  collections.multiplayerCustomScoringFields.forEach((row, index) => {
    const base = `payload.data.multiplayerCustomScoringFields[${index}]`;
    if (isUuid(row.gameId) && !multiplayerGameIds.has(row.gameId)) {
      pushError(details, `${base}.gameId`, 'must reference payload.data.multiplayerGames.id');
    }
  });

  collections.multiplayerCustomMatchPlayerValues.forEach((row, index) => {
    const base = `payload.data.multiplayerCustomMatchPlayerValues[${index}]`;
    if (isUuid(row.matchPlayerId) && !multiplayerMatchPlayersById.has(row.matchPlayerId)) {
      pushError(details, `${base}.matchPlayerId`, 'must reference payload.data.multiplayerMatchPlayers.id');
    }
    if (isUuid(row.fieldId) && !customFieldsById.has(row.fieldId)) {
      pushError(details, `${base}.fieldId`, 'must reference payload.data.multiplayerCustomScoringFields.id');
    }
  });
}

function validateCollections(collections, details) {
  validateGames(collections.games, details);
  validatePlayers(collections.players, details);
  validateMatches(collections.matches, details);
  validateTicketToRideVariants(collections.ticketToRideVariants, details);

  validateMultiplayerGames(collections.multiplayerGames, details);
  validateMultiplayerGameOptions(collections.multiplayerGameOptions, details);
  validateMultiplayerMatches(collections.multiplayerMatches, details);
  validateMultiplayerMatchOptions(collections.multiplayerMatchOptions, details);
  validateMultiplayerMatchPlayers(collections.multiplayerMatchPlayers, details);
  validateMultiplayerTicketToRideMatches(collections.multiplayerTicketToRideMatches, details);
  validateMultiplayerTicketToRidePlayerDetails(
    collections.multiplayerTicketToRidePlayerDetails,
    details
  );
  validateMultiplayerTerraformingMarsPlayerDetails(
    collections.multiplayerTerraformingMarsPlayerDetails,
    details
  );
  validateMultiplayerCustomScoringFields(collections.multiplayerCustomScoringFields, details);
  validateMultiplayerCustomMatchPlayerValues(
    collections.multiplayerCustomMatchPlayerValues,
    details
  );

  validateCrossReferences(collections, details);
}

function mapCounts(collections) {
  return COLLECTION_KEYS.reduce((acc, key) => {
    acc[key] = collections[key].length;
    return acc;
  }, {});
}

async function getExistingKeys(pool) {
  const [
    games,
    players,
    matches,
    ttrVariants,
    multiplayerGames,
    multiplayerGameOptions,
    multiplayerMatches,
    multiplayerMatchOptions,
    multiplayerMatchPlayers,
    multiplayerTtrMatches,
    multiplayerTtrDetails,
    multiplayerTmDetails,
    multiplayerCustomFields,
    multiplayerCustomValues,
  ] = await Promise.all([
    pool.query('SELECT code FROM games'),
    pool.query('SELECT name FROM players'),
    pool.query('SELECT id FROM matches'),
    pool.query('SELECT code FROM ticket_to_ride_variants'),
    pool.query('SELECT code FROM multiplayer_games'),
    pool.query('SELECT game_id, code FROM multiplayer_game_options'),
    pool.query('SELECT id FROM multiplayer_matches'),
    pool.query('SELECT match_id, option_id FROM multiplayer_match_options'),
    pool.query('SELECT match_id, player_id FROM multiplayer_match_players'),
    pool.query('SELECT match_id FROM multiplayer_ticket_to_ride_matches'),
    pool.query('SELECT match_player_id FROM multiplayer_ticket_to_ride_player_details'),
    pool.query('SELECT match_player_id FROM multiplayer_terraforming_mars_player_details'),
    pool.query('SELECT game_id, code FROM multiplayer_custom_scoring_fields'),
    pool.query('SELECT match_player_id, field_id FROM multiplayer_custom_match_player_values'),
  ]);

  return {
    games: new Set(games.rows.map((row) => row.code)),
    players: new Set(players.rows.map((row) => row.name)),
    matches: new Set(matches.rows.map((row) => row.id)),
    ticketToRideVariants: new Set(ttrVariants.rows.map((row) => row.code)),
    multiplayerGames: new Set(multiplayerGames.rows.map((row) => row.code)),
    multiplayerGameOptions: new Set(
      multiplayerGameOptions.rows.map((row) => `${row.game_id}:${row.code}`)
    ),
    multiplayerMatches: new Set(multiplayerMatches.rows.map((row) => row.id)),
    multiplayerMatchOptions: new Set(
      multiplayerMatchOptions.rows.map((row) => `${row.match_id}:${row.option_id}`)
    ),
    multiplayerMatchPlayers: new Set(
      multiplayerMatchPlayers.rows.map((row) => `${row.match_id}:${row.player_id}`)
    ),
    multiplayerTicketToRideMatches: new Set(
      multiplayerTtrMatches.rows.map((row) => row.match_id)
    ),
    multiplayerTicketToRidePlayerDetails: new Set(
      multiplayerTtrDetails.rows.map((row) => row.match_player_id)
    ),
    multiplayerTerraformingMarsPlayerDetails: new Set(
      multiplayerTmDetails.rows.map((row) => row.match_player_id)
    ),
    multiplayerCustomScoringFields: new Set(
      multiplayerCustomFields.rows.map((row) => `${row.game_id}:${row.code}`)
    ),
    multiplayerCustomMatchPlayerValues: new Set(
      multiplayerCustomValues.rows.map((row) => `${row.match_player_id}:${row.field_id}`)
    ),
  };
}

function getCollectionKeySelectors() {
  return {
    games: (row) => row.code,
    players: (row) => row.name,
    matches: (row) => row.id,
    ticketToRideVariants: (row) => row.code,
    multiplayerGames: (row) => row.code,
    multiplayerGameOptions: (row) => `${row.gameId}:${row.code}`,
    multiplayerMatches: (row) => row.id,
    multiplayerMatchOptions: (row) => `${row.matchId}:${row.optionId}`,
    multiplayerMatchPlayers: (row) => `${row.matchId}:${row.playerId}`,
    multiplayerTicketToRideMatches: (row) => row.matchId,
    multiplayerTicketToRidePlayerDetails: (row) => row.matchPlayerId,
    multiplayerTerraformingMarsPlayerDetails: (row) => row.matchPlayerId,
    multiplayerCustomScoringFields: (row) => `${row.gameId}:${row.code}`,
    multiplayerCustomMatchPlayerValues: (row) => `${row.matchPlayerId}:${row.fieldId}`,
  };
}

function createSummary(collections, existing) {
  const summary = {
    received: mapCounts(collections),
    toInsert: {},
    toUpdate: {},
  };

  const definitions = getCollectionKeySelectors();

  COLLECTION_KEYS.forEach((key) => {
    const keyFn = definitions[key];
    const rows = collections[key];
    const existingKeys = existing[key] || new Set();

    let toUpdate = 0;
    rows.forEach((row) => {
      if (existingKeys.has(keyFn(row))) {
        toUpdate += 1;
      }
    });

    summary.toUpdate[key] = toUpdate;
    summary.toInsert[key] = rows.length - toUpdate;
  });

  return summary;
}

function createImportDiff(collections, existing) {
  const definitions = getCollectionKeySelectors();
  const diff = {};

  COLLECTION_KEYS.forEach((key) => {
    const keyFn = definitions[key];
    const rows = collections[key] || [];
    const existingKeys = existing[key] || new Set();
    diff[key] = rows.map((row) => {
      const recordKey = keyFn(row);
      return {
        key: String(recordKey),
        operation: existingKeys.has(recordKey) ? 'update' : 'insert',
      };
    });
  });

  return diff;
}

function createExportMeta(data) {
  return {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    collections: Object.fromEntries(
      COLLECTION_KEYS.map((key) => [key, { count: Array.isArray(data[key]) ? data[key].length : 0 }])
    ),
  };
}

async function fetchDataExportSnapshot() {
  const pool = getPool();
  const [
    games,
    players,
    matches,
    ticketToRideVariants,
    multiplayerGames,
    multiplayerGameOptions,
    multiplayerMatches,
    multiplayerMatchOptions,
    multiplayerMatchPlayers,
    multiplayerTicketToRideMatches,
    multiplayerTicketToRidePlayerDetails,
    multiplayerTerraformingMarsPlayerDetails,
    multiplayerCustomScoringFields,
    multiplayerCustomMatchPlayerValues,
  ] = await Promise.all([
    pool.query(
      `SELECT id, code, name, is_active, created_at
       FROM games
       ORDER BY name ASC, id ASC`
    ),
    pool.query(
      `SELECT id, name, is_active, created_at
       FROM players
       ORDER BY name ASC, id ASC`
    ),
    pool.query(
      `SELECT id, game_id, played_on, player_a_id, player_b_id, score_a, score_b, notes, created_at, updated_at
       FROM matches
       ORDER BY played_on ASC, id ASC`
    ),
    pool.query(
      `SELECT id, code, name, is_active, created_at
       FROM ticket_to_ride_variants
       ORDER BY name ASC, id ASC`
    ),
    pool.query(
      `SELECT
         id,
         code,
         display_name,
         calculator_button_label,
         calculator_url,
         scoring_type,
         min_players,
         max_players,
         is_active,
         visible_in_one_vs_one,
         visible_in_multiplayer,
         options_exclusive,
         created_at
       FROM multiplayer_games
       ORDER BY display_name ASC, id ASC`
    ),
    pool.query(
      `SELECT id, game_id, code, display_name, sort_order, is_active, created_at
       FROM multiplayer_game_options
       ORDER BY game_id ASC, sort_order ASC, id ASC`
    ),
    pool.query(
      `SELECT id, game_id, played_on, notes, created_at, updated_at
       FROM multiplayer_matches
       ORDER BY played_on ASC, id ASC`
    ),
    pool.query(
      `SELECT match_id, game_id, option_id, created_at
       FROM multiplayer_match_options
       ORDER BY match_id ASC, option_id ASC`
    ),
    pool.query(
      `SELECT id, match_id, player_id, total_points, place, created_at, updated_at
       FROM multiplayer_match_players
       ORDER BY match_id ASC, place ASC NULLS LAST, id ASC`
    ),
    pool.query(
      `SELECT match_id, variant_id
       FROM multiplayer_ticket_to_ride_matches
       ORDER BY match_id ASC`
    ),
    pool.query(
      `SELECT id, match_player_id, tickets_points, bonus_points, trains_counts, trains_points
       FROM multiplayer_ticket_to_ride_player_details
       ORDER BY match_player_id ASC`
    ),
    pool.query(
      `SELECT
         id,
         match_player_id,
         titles_count,
         awards_first_count,
         awards_second_count,
         cities_points,
         forests_points,
         cards_points,
         tr_points,
         titles_points,
         awards_first_points,
         awards_second_points
       FROM multiplayer_terraforming_mars_player_details
       ORDER BY match_player_id ASC`
    ),
    pool.query(
      `SELECT id, game_id, code, label, description, points_per_unit, sort_order, is_active, created_at
       FROM multiplayer_custom_scoring_fields
       ORDER BY game_id ASC, sort_order ASC, id ASC`
    ),
    pool.query(
      `SELECT id, match_player_id, field_id, value, points, created_at
       FROM multiplayer_custom_match_player_values
       ORDER BY match_player_id ASC, field_id ASC, id ASC`
    ),
  ]);

  const data = {
      games: games.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isActive: row.is_active === true,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
      players: players.rows.map((row) => ({
        id: row.id,
        name: row.name,
        isActive: row.is_active === true,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
      matches: matches.rows.map((row) => ({
        id: row.id,
        gameId: row.game_id,
        playedOn: row.played_on instanceof Date ? row.played_on.toISOString().slice(0, 10) : row.played_on,
        playerAId: row.player_a_id,
        playerBId: row.player_b_id,
        scoreA: row.score_a,
        scoreB: row.score_b,
        notes: row.notes ?? null,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      })),
      ticketToRideVariants: ticketToRideVariants.rows.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        isActive: row.is_active === true,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
      multiplayerGames: multiplayerGames.rows.map((row) => ({
        id: row.id,
        code: row.code,
        displayName: row.display_name,
        calculatorButtonLabel: row.calculator_button_label,
        calculatorUrl: row.calculator_url,
        scoringType: row.scoring_type,
        minPlayers: row.min_players,
        maxPlayers: row.max_players,
        isActive: row.is_active === true,
        showInOneVsOne: row.visible_in_one_vs_one === true,
        showInMultiplayer: row.visible_in_multiplayer === true,
        optionsExclusive: row.options_exclusive,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
      multiplayerGameOptions: multiplayerGameOptions.rows.map((row) => ({
        id: row.id,
        gameId: row.game_id,
        code: row.code,
        displayName: row.display_name,
        sortOrder: row.sort_order,
        isActive: row.is_active === true,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
      multiplayerMatches: multiplayerMatches.rows.map((row) => ({
        id: row.id,
        gameId: row.game_id,
        playedOn:
          row.played_on instanceof Date ? row.played_on.toISOString().slice(0, 10) : row.played_on,
        notes: row.notes ?? null,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      })),
      multiplayerMatchOptions: multiplayerMatchOptions.rows.map((row) => ({
        matchId: row.match_id,
        gameId: row.game_id,
        optionId: row.option_id,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
      multiplayerMatchPlayers: multiplayerMatchPlayers.rows.map((row) => ({
        id: row.id,
        matchId: row.match_id,
        playerId: row.player_id,
        totalPoints: row.total_points,
        place: row.place,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
      })),
      multiplayerTicketToRideMatches: multiplayerTicketToRideMatches.rows.map((row) => ({
        matchId: row.match_id,
        variantId: row.variant_id,
      })),
      multiplayerTicketToRidePlayerDetails: multiplayerTicketToRidePlayerDetails.rows.map((row) => ({
        id: row.id,
        matchPlayerId: row.match_player_id,
        ticketsPoints: row.tickets_points,
        bonusPoints: row.bonus_points,
        trainsCounts: row.trains_counts,
        trainsPoints: row.trains_points,
      })),
      multiplayerTerraformingMarsPlayerDetails: multiplayerTerraformingMarsPlayerDetails.rows.map((row) => ({
        id: row.id,
        matchPlayerId: row.match_player_id,
        titlesCount: row.titles_count,
        awardsFirstCount: row.awards_first_count,
        awardsSecondCount: row.awards_second_count,
        citiesPoints: row.cities_points,
        forestsPoints: row.forests_points,
        cardsPoints: row.cards_points,
        trPoints: row.tr_points,
        titlesPoints: row.titles_points,
        awardsFirstPoints: row.awards_first_points,
        awardsSecondPoints: row.awards_second_points,
      })),
      multiplayerCustomScoringFields: multiplayerCustomScoringFields.rows.map((row) => ({
        id: row.id,
        gameId: row.game_id,
        code: row.code,
        label: row.label,
        description: row.description ?? null,
        pointsPerUnit: row.points_per_unit,
        sortOrder: row.sort_order,
        isActive: row.is_active === true,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
      multiplayerCustomMatchPlayerValues: multiplayerCustomMatchPlayerValues.rows.map((row) => ({
        id: row.id,
        matchPlayerId: row.match_player_id,
        fieldId: row.field_id,
        value: row.value,
        points: row.points,
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      })),
  };

  return {
    version: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    meta: createExportMeta(data),
    data,
  };
}

async function prepareDataImport(payload) {
  const details = [];
  const warnings = [];

  const collections = buildRequiredCollections(payload, details, warnings);
  if (collections) {
    validateCollections(collections, details);
  }

  if (details.length > 0) {
    const error = new Error('Data import validation failed');
    error.code = 'DATA_IMPORT_VALIDATION_FAILED';
    error.details = details;
    error.warnings = warnings;
    throw error;
  }

  const pool = getPool();
  const existingKeys = await getExistingKeys(pool);
  const summary = createSummary(collections, existingKeys);
  const diff = createImportDiff(collections, existingKeys);

  if (warnings.length > 0) {
    console.warn('[admin-data-import] warnings:', warnings);
  }

  return {
    collections,
    summary,
    diff,
    warnings,
  };
}

function parseTimestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

async function applyPreparedDataImport({ collections }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    for (const row of collections.games) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO games (id, code, name, is_active, created_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
         ON CONFLICT (code) DO UPDATE
         SET id = EXCLUDED.id,
             name = EXCLUDED.name,
             is_active = EXCLUDED.is_active`,
        [row.id, row.code, row.name, row.isActive !== false, parseTimestamp(row.createdAt)]
      );
    }

    for (const row of collections.players) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO players (id, name, is_active, created_at)
         VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))
         ON CONFLICT (name) DO UPDATE
         SET id = EXCLUDED.id,
             is_active = EXCLUDED.is_active`,
        [row.id, row.name, row.isActive !== false, parseTimestamp(row.createdAt)]
      );
    }

    for (const row of collections.ticketToRideVariants) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO ticket_to_ride_variants (id, code, name, is_active, created_at)
         VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, now()))
         ON CONFLICT (code) DO UPDATE
         SET id = EXCLUDED.id,
             name = EXCLUDED.name,
             is_active = EXCLUDED.is_active`,
        [row.id, row.code, row.name, row.isActive !== false, parseTimestamp(row.createdAt)]
      );
    }

    for (const row of collections.multiplayerGames) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_games (
           id,
           code,
           display_name,
           calculator_button_label,
           calculator_url,
           scoring_type,
           min_players,
           max_players,
           is_active,
           visible_in_one_vs_one,
           visible_in_multiplayer,
           options_exclusive,
           created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13::timestamptz, now()))
         ON CONFLICT (code) DO UPDATE
         SET id = EXCLUDED.id,
             display_name = EXCLUDED.display_name,
             calculator_button_label = EXCLUDED.calculator_button_label,
             calculator_url = EXCLUDED.calculator_url,
             scoring_type = EXCLUDED.scoring_type,
             min_players = EXCLUDED.min_players,
             max_players = EXCLUDED.max_players,
             is_active = EXCLUDED.is_active,
             visible_in_one_vs_one = EXCLUDED.visible_in_one_vs_one,
             visible_in_multiplayer = EXCLUDED.visible_in_multiplayer,
             options_exclusive = EXCLUDED.options_exclusive`,
        [
          row.id,
          row.code,
          row.displayName,
          row.calculatorButtonLabel === undefined ? null : row.calculatorButtonLabel,
          row.calculatorUrl === undefined ? null : row.calculatorUrl,
          row.scoringType,
          row.minPlayers,
          row.maxPlayers,
          row.isActive !== false,
          row.showInOneVsOne === true,
          row.showInMultiplayer !== false,
          row.optionsExclusive === undefined ? null : row.optionsExclusive,
          parseTimestamp(row.createdAt),
        ]
      );
    }

    for (const row of collections.multiplayerGameOptions) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_game_options (
           id,
           game_id,
           code,
           display_name,
           sort_order,
           is_active,
           created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))
         ON CONFLICT (game_id, code) DO UPDATE
         SET id = EXCLUDED.id,
             display_name = EXCLUDED.display_name,
             sort_order = EXCLUDED.sort_order,
             is_active = EXCLUDED.is_active`,
        [
          row.id,
          row.gameId,
          row.code,
          row.displayName,
          row.sortOrder,
          row.isActive !== false,
          parseTimestamp(row.createdAt),
        ]
      );
    }

    for (const row of collections.matches) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO matches (
           id,
           game_id,
           played_on,
           player_a_id,
           player_b_id,
           score_a,
           score_b,
           notes,
           created_at,
           updated_at
         ) VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           COALESCE($9::timestamptz, now()),
           COALESCE($10::timestamptz, now())
         )
         ON CONFLICT (id) DO UPDATE
         SET game_id = EXCLUDED.game_id,
             played_on = EXCLUDED.played_on,
             player_a_id = EXCLUDED.player_a_id,
             player_b_id = EXCLUDED.player_b_id,
             score_a = EXCLUDED.score_a,
             score_b = EXCLUDED.score_b,
             notes = EXCLUDED.notes,
             updated_at = EXCLUDED.updated_at`,
        [
          row.id,
          row.gameId,
          row.playedOn,
          row.playerAId,
          row.playerBId,
          row.scoreA,
          row.scoreB,
          row.notes ?? null,
          parseTimestamp(row.createdAt),
          parseTimestamp(row.updatedAt),
        ]
      );
    }

    for (const row of collections.multiplayerMatches) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_matches (
           id,
           game_id,
           played_on,
           notes,
           created_at,
           updated_at
         ) VALUES (
           $1,
           $2,
           $3,
           $4,
           COALESCE($5::timestamptz, now()),
           COALESCE($6::timestamptz, now())
         )
         ON CONFLICT (id) DO UPDATE
         SET game_id = EXCLUDED.game_id,
             played_on = EXCLUDED.played_on,
             notes = EXCLUDED.notes,
             updated_at = EXCLUDED.updated_at`,
        [
          row.id,
          row.gameId,
          row.playedOn,
          row.notes ?? null,
          parseTimestamp(row.createdAt),
          parseTimestamp(row.updatedAt),
        ]
      );
    }

    for (const row of collections.multiplayerMatchOptions) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_match_options (
           match_id,
           game_id,
           option_id,
           created_at
         ) VALUES ($1, $2, $3, COALESCE($4::timestamptz, now()))
         ON CONFLICT (match_id, option_id) DO UPDATE
         SET game_id = EXCLUDED.game_id`,
        [row.matchId, row.gameId, row.optionId, parseTimestamp(row.createdAt)]
      );
    }

    for (const row of collections.multiplayerMatchPlayers) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_match_players (
           id,
           match_id,
           player_id,
           total_points,
           place,
           created_at,
           updated_at
         ) VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           COALESCE($6::timestamptz, now()),
           COALESCE($7::timestamptz, now())
         )
         ON CONFLICT (match_id, player_id) DO UPDATE
         SET id = EXCLUDED.id,
             total_points = EXCLUDED.total_points,
             place = EXCLUDED.place,
             updated_at = EXCLUDED.updated_at`,
        [
          row.id,
          row.matchId,
          row.playerId,
          row.totalPoints,
          row.place ?? null,
          parseTimestamp(row.createdAt),
          parseTimestamp(row.updatedAt),
        ]
      );
    }

    for (const row of collections.multiplayerTicketToRideMatches) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_ticket_to_ride_matches (match_id, variant_id)
         VALUES ($1, $2)
         ON CONFLICT (match_id) DO UPDATE
         SET variant_id = EXCLUDED.variant_id`,
        [row.matchId, row.variantId]
      );
    }

    for (const row of collections.multiplayerTicketToRidePlayerDetails) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_ticket_to_ride_player_details (
           id,
           match_player_id,
           tickets_points,
           bonus_points,
           trains_counts,
           trains_points
         ) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (match_player_id) DO UPDATE
         SET id = EXCLUDED.id,
             tickets_points = EXCLUDED.tickets_points,
             bonus_points = EXCLUDED.bonus_points,
             trains_counts = EXCLUDED.trains_counts,
             trains_points = EXCLUDED.trains_points`,
        [
          row.id,
          row.matchPlayerId,
          row.ticketsPoints,
          row.bonusPoints,
          JSON.stringify(row.trainsCounts),
          row.trainsPoints,
        ]
      );
    }

    for (const row of collections.multiplayerTerraformingMarsPlayerDetails) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_terraforming_mars_player_details (
           id,
           match_player_id,
           titles_count,
           awards_first_count,
           awards_second_count,
           cities_points,
           forests_points,
           cards_points,
           tr_points,
           titles_points,
           awards_first_points,
           awards_second_points
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (match_player_id) DO UPDATE
         SET id = EXCLUDED.id,
             titles_count = EXCLUDED.titles_count,
             awards_first_count = EXCLUDED.awards_first_count,
             awards_second_count = EXCLUDED.awards_second_count,
             cities_points = EXCLUDED.cities_points,
             forests_points = EXCLUDED.forests_points,
             cards_points = EXCLUDED.cards_points,
             tr_points = EXCLUDED.tr_points,
             titles_points = EXCLUDED.titles_points,
             awards_first_points = EXCLUDED.awards_first_points,
             awards_second_points = EXCLUDED.awards_second_points`,
        [
          row.id,
          row.matchPlayerId,
          row.titlesCount,
          row.awardsFirstCount,
          row.awardsSecondCount,
          row.citiesPoints,
          row.forestsPoints,
          row.cardsPoints,
          row.trPoints,
          row.titlesPoints,
          row.awardsFirstPoints,
          row.awardsSecondPoints,
        ]
      );
    }

    for (const row of collections.multiplayerCustomScoringFields) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_custom_scoring_fields (
           id,
           game_id,
           code,
           label,
           description,
           points_per_unit,
           sort_order,
           is_active,
           created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, now()))
         ON CONFLICT (game_id, code) DO UPDATE
         SET id = EXCLUDED.id,
             label = EXCLUDED.label,
             description = EXCLUDED.description,
             points_per_unit = EXCLUDED.points_per_unit,
             sort_order = EXCLUDED.sort_order,
             is_active = EXCLUDED.is_active`,
        [
          row.id,
          row.gameId,
          row.code,
          row.label,
          row.description ?? null,
          row.pointsPerUnit,
          row.sortOrder,
          row.isActive !== false,
          parseTimestamp(row.createdAt),
        ]
      );
    }

    for (const row of collections.multiplayerCustomMatchPlayerValues) {
      // eslint-disable-next-line no-await-in-loop
      await client.query(
        `INSERT INTO multiplayer_custom_match_player_values (
           id,
           match_player_id,
           field_id,
           value,
           points,
           created_at
         ) VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))
         ON CONFLICT (match_player_id, field_id) DO UPDATE
         SET id = EXCLUDED.id,
             value = EXCLUDED.value,
             points = EXCLUDED.points`,
        [
          row.id,
          row.matchPlayerId,
          row.fieldId,
          row.value,
          row.points,
          parseTimestamp(row.createdAt),
        ]
      );
    }

    await client.query('COMMIT');
    return {
      appliedAt: new Date().toISOString(),
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  EXPORT_SCHEMA_VERSION,
  fetchDataExportSnapshot,
  prepareDataImport,
  applyPreparedDataImport,
};
