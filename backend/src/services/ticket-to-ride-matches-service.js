const { getPool } = require('../db');
const {
  createMultiplayerMatchTicketToRide,
  updateMultiplayerMatchTicketToRide,
  deleteMultiplayerMatch,
  getMultiplayerMatchCore,
} = require('./multiplayer-matches-service');
const { validateMultiplayerMatchInput } = require('./multiplayer-validation');

const SOURCE_SYSTEM = 'legacy_ticket_to_ride';

const TRAINS_POINTS = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 10,
  6: 15,
  7: 18,
  8: 21,
  9: 27,
};

function formatDate(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value);
}

function formatTimestamp(value) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return new Date(value).toISOString();
}

function compareByPointsThenPlayerId(a, b) {
  if (b.totalPoints !== a.totalPoints) {
    return b.totalPoints - a.totalPoints;
  }
  return String(a.playerId).localeCompare(String(b.playerId));
}

function assignDisplayPlaces(players) {
  const sortedByPoints = [...players].sort(compareByPointsThenPlayerId);
  const placeByPlayerId = new Map();
  let previousPoints = null;
  let currentPlace = 0;

  sortedByPoints.forEach((player, index) => {
    if (previousPoints === null || player.totalPoints !== previousPoints) {
      currentPlace = index + 1;
      previousPoints = player.totalPoints;
    }
    placeByPlayerId.set(player.playerId, currentPlace);
  });

  return [...players]
    .map((player) => ({
      ...player,
      place: placeByPlayerId.get(player.playerId) ?? null,
    }))
    .sort((a, b) => {
      const placeDiff = (a.place ?? 0) - (b.place ?? 0);
      if (placeDiff !== 0) {
        return placeDiff;
      }
      return compareByPointsThenPlayerId(a, b);
    });
}

function buildMatchPayload(rows, includeDetails = false) {
  if (!rows || rows.length === 0) {
    return null;
  }

  const first = rows[0];
  const players = assignDisplayPlaces(
    rows.map((row) => ({
      id: row.match_player_id,
      playerId: row.player_id,
      player: {
        id: row.player_id,
        name: row.player_name,
      },
      ticketsPoints: row.tickets_points,
      bonusPoints: row.bonus_points,
      trainsCounts: row.trains_counts,
      trainsPoints: row.trains_points,
      totalPoints: row.total_points,
      place: row.place ?? null,
    }))
  );

  return {
    id: first.id,
    playedOn: formatDate(first.played_on),
    notes: first.notes ?? null,
    variant: {
      id: first.variant_id,
      code: first.variant_code,
      name: first.variant_name,
    },
    ...(includeDetails
      ? {
          createdAt: formatTimestamp(first.created_at),
          updatedAt: formatTimestamp(first.updated_at),
        }
      : {}),
    players: players.map((player) => ({
      id: player.id,
      player: player.player,
      ticketsPoints: player.ticketsPoints,
      bonusPoints: player.bonusPoints,
      trainsCounts: player.trainsCounts,
      trainsPoints: player.trainsPoints,
      totalPoints: player.totalPoints,
      place: player.place,
    })),
  };
}

async function resolveMultiplayerMatchId(pool, legacyId) {
  const result = await pool.query(
    `SELECT target_id
     FROM legacy_migration_map
     WHERE source_system = $1 AND source_id = $2`,
    [SOURCE_SYSTEM, legacyId]
  );
  return result.rows[0]?.target_id ?? legacyId;
}

async function getTicketToRideGame(pool) {
  const result = await pool.query(
    `SELECT
      id,
      code,
      display_name AS "displayName",
      scoring_type AS "scoringType",
      min_players AS "minPlayers",
      max_players AS "maxPlayers"
     FROM multiplayer_games
     WHERE code = 'ticket_to_ride'
     LIMIT 1`
  );
  return result.rows[0] || null;
}

async function ensureVariant(pool, variantId) {
  const result = await pool.query(
    'SELECT id, code, name FROM ticket_to_ride_variants WHERE id = $1 AND is_active = true',
    [variantId]
  );
  if (result.rowCount === 0) {
    const error = new Error('Variant not found');
    error.code = 'TICKET_TO_RIDE_VALIDATION';
    error.details = [{ field: 'variantId', message: 'must refer to active variant' }];
    throw error;
  }
  return result.rows[0];
}

async function fetchMatchRows(client, matchIds, includeDetails = false) {
  if (!matchIds || matchIds.length === 0) {
    return [];
  }

  const detailFields = includeDetails
    ? 'm.notes, m.created_at, m.updated_at,'
    : 'm.notes, NULL AS created_at, NULL AS updated_at,';

  const result = await client.query(
    `
    SELECT
      m.id,
      m.played_on,
      ${detailFields}
      v.id AS variant_id,
      v.code AS variant_code,
      v.name AS variant_name,
      mp.id AS match_player_id,
      mp.player_id,
      p.name AS player_name,
      ttr.tickets_points,
      ttr.bonus_points,
      ttr.trains_counts,
      ttr.trains_points,
      mp.total_points,
      mp.place
    FROM multiplayer_matches m
    JOIN multiplayer_games g ON g.id = m.game_id
    JOIN multiplayer_ticket_to_ride_matches mtm ON mtm.match_id = m.id
    JOIN ticket_to_ride_variants v ON v.id = mtm.variant_id
    JOIN multiplayer_match_players mp ON mp.match_id = m.id
    JOIN multiplayer_ticket_to_ride_player_details ttr ON ttr.match_player_id = mp.id
    JOIN players p ON p.id = mp.player_id
    WHERE g.code = 'ticket_to_ride' AND m.id = ANY($1::uuid[])
    ORDER BY m.played_on DESC, m.id DESC, mp.place ASC
    `,
    [matchIds]
  );

  return result.rows;
}

async function listTicketToRideMatches({ dateFrom, dateTo, variantId, playerId, limit, offset }) {
  const pool = getPool();
  const game = await getTicketToRideGame(pool);
  if (!game || game.scoringType !== 'TTR_CALCULATOR') {
    return { items: [], total: 0 };
  }

  const conditions = ['m.game_id = $1'];
  const params = [game.id];

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`m.played_on >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`m.played_on <= $${params.length}`);
  }
  if (variantId) {
    params.push(variantId);
    conditions.push(`mtm.variant_id = $${params.length}`);
  }
  if (playerId) {
    params.push(playerId);
    conditions.push(
      `EXISTS (SELECT 1 FROM multiplayer_match_players mpf WHERE mpf.match_id = m.id AND mpf.player_id = $${params.length})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM multiplayer_matches m
     JOIN multiplayer_ticket_to_ride_matches mtm ON mtm.match_id = m.id
     ${whereClause}`,
    params
  );
  const total = totalResult.rows[0]?.total ?? 0;

  const pagingParams = [...params, limit, offset];
  const itemsResult = await pool.query(
    `SELECT m.id
     FROM multiplayer_matches m
     JOIN multiplayer_ticket_to_ride_matches mtm ON mtm.match_id = m.id
     ${whereClause}
     ORDER BY m.played_on DESC, m.id DESC
     LIMIT $${pagingParams.length - 1} OFFSET $${pagingParams.length}`,
    pagingParams
  );

  const matchIds = itemsResult.rows.map((row) => row.id);
  if (matchIds.length === 0) {
    return { items: [], total };
  }

  const rows = await fetchMatchRows(pool, matchIds, false);
  const grouped = new Map();
  rows.forEach((row) => {
    const bucket = grouped.get(row.id) ?? [];
    bucket.push(row);
    grouped.set(row.id, bucket);
  });

  const items = matchIds.map((id) => buildMatchPayload(grouped.get(id), false)).filter(Boolean);

  return { items, total };
}

async function getTicketToRideMatchById(id) {
  const pool = getPool();
  const resolvedId = await resolveMultiplayerMatchId(pool, id);
  const rows = await fetchMatchRows(pool, [resolvedId], true);

  if (!rows || rows.length === 0) {
    const error = new Error('Match not found');
    error.code = 'TICKET_TO_RIDE_MATCH_NOT_FOUND';
    throw error;
  }

  return buildMatchPayload(rows, true);
}

async function createTicketToRideMatch({ playedOn, variantId, notes, players }) {
  const pool = getPool();
  const game = await getTicketToRideGame(pool);
  if (!game || game.scoringType !== 'TTR_CALCULATOR') {
    const error = new Error('Ticket to Ride game not found');
    error.code = 'TICKET_TO_RIDE_VALIDATION';
    error.details = [{ field: 'gameId', message: 'ticket_to_ride game not found' }];
    throw error;
  }

  const variant = await ensureVariant(pool, variantId);
  const playerIds = players.map((player) => player.playerId);
  await validateMultiplayerMatchInput({ gameId: game.id, playerIds });

  const payload = await createMultiplayerMatchTicketToRide({
    game,
    variant,
    playedOn,
    notes,
    players,
  });

  return getTicketToRideMatchById(payload.id);
}

async function updateTicketToRideMatch({ id, playedOn, variantId, notes, players }) {
  const pool = getPool();
  const resolvedId = await resolveMultiplayerMatchId(pool, id);

  let match;
  try {
    match = await getMultiplayerMatchCore(resolvedId);
  } catch (error) {
    if (error && error.code === 'MULTIPLAYER_MATCH_NOT_FOUND') {
      const notFound = new Error('Match not found');
      notFound.code = 'TICKET_TO_RIDE_MATCH_NOT_FOUND';
      throw notFound;
    }
    throw error;
  }

  if (match.game_scoring_type !== 'TTR_CALCULATOR') {
    const notFound = new Error('Match not found');
    notFound.code = 'TICKET_TO_RIDE_MATCH_NOT_FOUND';
    throw notFound;
  }

  const variant = variantId ? await ensureVariant(pool, variantId) : undefined;

  if (players) {
    const playerIds = players.map((player) => player.playerId);
    await validateMultiplayerMatchInput({ gameId: match.game_id, playerIds });
  }

  await updateMultiplayerMatchTicketToRide({
    match,
    playedOn,
    notes,
    players,
    variant,
  });

  return getTicketToRideMatchById(resolvedId);
}

async function deleteTicketToRideMatch(id) {
  const pool = getPool();
  const resolvedId = await resolveMultiplayerMatchId(pool, id);

  try {
    await deleteMultiplayerMatch(resolvedId);
  } catch (error) {
    if (error && error.code === 'MULTIPLAYER_MATCH_NOT_FOUND') {
      const notFound = new Error('Match not found');
      notFound.code = 'TICKET_TO_RIDE_MATCH_NOT_FOUND';
      throw notFound;
    }
    throw error;
  }
}

module.exports = {
  createTicketToRideMatch,
  listTicketToRideMatches,
  getTicketToRideMatchById,
  updateTicketToRideMatch,
  deleteTicketToRideMatch,
  TRAINS_POINTS,
};
