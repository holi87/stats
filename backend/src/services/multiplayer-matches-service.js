const { getPool } = require('../db');
const { featureFlags } = require('../feature-flags');

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

function computeTrainsPoints(trainsCounts) {
  return Object.entries(TRAINS_POINTS).reduce((sum, [length, points]) => {
    const count = Number(trainsCounts[length] ?? 0);
    return sum + count * points;
  }, 0);
}

function compareByTotalThenPlayerId(a, b) {
  if (b.totalPoints !== a.totalPoints) {
    return b.totalPoints - a.totalPoints;
  }
  return a.playerId.localeCompare(b.playerId);
}

function compareTicketToRidePlayers(a, b) {
  if (b.totalPoints !== a.totalPoints) {
    return b.totalPoints - a.totalPoints;
  }
  if (b.trainsPoints !== a.trainsPoints) {
    return b.trainsPoints - a.trainsPoints;
  }
  if (b.bonusPoints !== a.bonusPoints) {
    return b.bonusPoints - a.bonusPoints;
  }
  if (b.ticketsPoints !== a.ticketsPoints) {
    return b.ticketsPoints - a.ticketsPoints;
  }
  return a.playerId.localeCompare(b.playerId);
}

function compareTerraformingMarsPlayers(a, b) {
  if (b.totalPoints !== a.totalPoints) {
    return b.totalPoints - a.totalPoints;
  }
  if (b.trPoints !== a.trPoints) {
    return b.trPoints - a.trPoints;
  }
  if (b.citiesPoints !== a.citiesPoints) {
    return b.citiesPoints - a.citiesPoints;
  }
  if (b.forestsPoints !== a.forestsPoints) {
    return b.forestsPoints - a.forestsPoints;
  }
  if (b.cardsPoints !== a.cardsPoints) {
    return b.cardsPoints - a.cardsPoints;
  }
  return a.playerId.localeCompare(b.playerId);
}

function assignSequentialPlaces(sortedPlayers) {
  const placeByPlayer = new Map();
  sortedPlayers.forEach((player, index) => {
    placeByPlayer.set(player.playerId, index + 1);
  });
  return placeByPlayer;
}

function assignCompetitionPlaces(sortedPlayers) {
  const placeByPlayer = new Map();
  let lastPoints = null;
  let currentPlace = 0;

  sortedPlayers.forEach((player, index) => {
    if (lastPoints === null || player.totalPoints !== lastPoints) {
      currentPlace = index + 1;
      lastPoints = player.totalPoints;
    }
    placeByPlayer.set(player.playerId, currentPlace);
  });

  return placeByPlayer;
}

function assignPlacesByComparator(players, comparator) {
  const sorted = [...players].sort(comparator);
  const placeByPlayer = featureFlags.olympicRanking
    ? assignCompetitionPlaces(sorted)
    : assignSequentialPlaces(sorted);

  return players.map((player) => ({
    ...player,
    place: placeByPlayer.get(player.playerId) ?? null,
  }));
}

function assignPlaces(players) {
  return assignPlacesByComparator(players, compareByTotalThenPlayerId);
}

function assignPlacesTicketToRide(players) {
  return assignPlacesByComparator(players, compareTicketToRidePlayers);
}

function assignPlacesTerraformingMars(players) {
  return assignPlacesByComparator(players, compareTerraformingMarsPlayers);
}

function sortPlayersByPlace(players) {
  return [...players].sort((a, b) => {
    const placeDiff = (a.place ?? 0) - (b.place ?? 0);
    if (placeDiff !== 0) {
      return placeDiff;
    }

    const pointsDiff = (b.totalPoints ?? 0) - (a.totalPoints ?? 0);
    if (pointsDiff !== 0) {
      return pointsDiff;
    }

    return String(a.playerId).localeCompare(String(b.playerId));
  });
}

function assignDisplayPlaces(players) {
  const prepared = players.map((player) => ({
    ...player,
    totalPoints: Number.isFinite(player.totalPoints) ? player.totalPoints : 0,
  }));
  const ranked = assignPlaces(
    prepared.map((player) => ({ playerId: player.playerId, totalPoints: player.totalPoints }))
  );
  const placeByPlayerId = new Map(ranked.map((player) => [player.playerId, player.place ?? null]));

  return sortPlayersByPlace(
    prepared.map((player) => ({
      ...player,
      place: placeByPlayerId.get(player.playerId) ?? null,
    }))
  );
}

function mapCustomScoringField(row) {
  return {
    id: row.id,
    gameId: row.game_id,
    code: row.code,
    label: row.label,
    description: row.description ?? null,
    pointsPerUnit: row.points_per_unit,
    sortOrder: row.sort_order,
    isActive: row.is_active === true,
  };
}

function computeCustomCalculatorPlayers(players, activeFields) {
  return players.map((player) => {
    const fieldValues = {};
    const values = activeFields.map((field) => {
      const rawValue = player.calculatorValues?.[field.id] ?? 0;
      const value = Number.isInteger(rawValue) ? rawValue : 0;
      const points = value * field.pointsPerUnit;
      fieldValues[field.id] = value;
      return {
        fieldId: field.id,
        value,
        points,
      };
    });

    const totalPoints = values.reduce((sum, item) => sum + item.points, 0);

    return {
      playerId: player.playerId,
      calculatorValues: fieldValues,
      values,
      totalPoints,
    };
  });
}

function mapMatchOptionFromRow(row) {
  if (!row || !row.id) {
    return null;
  }

  return {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
  };
}

function mapMatchOptionsRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const seen = new Set();
  const options = [];

  rows.forEach((row) => {
    const option = mapMatchOptionFromRow(row);
    if (!option || seen.has(option.id)) {
      return;
    }
    seen.add(option.id);
    options.push(option);
  });

  return options;
}

function buildMatchListItems(rows, orderedIds, optionsByMatchId = new Map()) {
  if (!rows || rows.length === 0) {
    return [];
  }

  const grouped = new Map();

  rows.forEach((row) => {
    let match = grouped.get(row.id);
    if (!match) {
      match = {
        id: row.id,
        playedOn: formatDate(row.played_on),
        notes: row.notes ?? null,
        game: {
          id: row.game_id,
          code: row.game_code,
          displayName: row.game_display_name,
        },
        options: optionsByMatchId.get(row.id) ?? [],
        option: null,
        players: [],
      };
      match.option = match.options[0] ?? null;
      grouped.set(row.id, match);
    }

    match.players.push({
      playerId: row.player_id,
      name: row.player_name,
      totalPoints: row.total_points,
      place: row.place ?? null,
    });
  });

  grouped.forEach((match) => {
    match.players = assignDisplayPlaces(match.players);
  });

  return orderedIds.map((id) => grouped.get(id)).filter(Boolean);
}

function buildBaseMatchPayload(matchRow, playersRows, options = []) {
  const players = assignDisplayPlaces(
    playersRows.map((row) => ({
      playerId: row.player_id,
      name: row.player_name,
      totalPoints: row.total_points,
      place: row.place ?? null,
    }))
  );

  return {
    id: matchRow.id,
    game: {
      id: matchRow.game_id,
      code: matchRow.game_code,
      displayName: matchRow.game_display_name,
      scoringType: matchRow.game_scoring_type,
      minPlayers: matchRow.game_min_players,
      maxPlayers: matchRow.game_max_players,
      isActive: matchRow.game_is_active === true,
      showInQuickMenu: matchRow.game_in_quick_menu === true,
      optionsCount: matchRow.game_options_count,
      requiresOption: matchRow.game_requires_option,
      optionsExclusive:
        matchRow.game_options_exclusive === null || matchRow.game_options_exclusive === undefined
          ? true
          : matchRow.game_options_exclusive === true,
      customFieldsCount: matchRow.game_custom_fields_count,
    },
    playedOn: formatDate(matchRow.played_on),
    notes: matchRow.notes ?? null,
    createdAt: formatTimestamp(matchRow.created_at),
    updatedAt: formatTimestamp(matchRow.updated_at),
    options,
    option: options[0] ?? null,
    players,
  };
}

function buildWhereClause({ gameId, playerId, optionId, dateFrom, dateTo }) {
  const conditions = [];
  const params = [];

  if (gameId) {
    params.push(gameId);
    conditions.push(`m.game_id = $${params.length}`);
  }

  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`m.played_on >= $${params.length}`);
  }

  if (dateTo) {
    params.push(dateTo);
    conditions.push(`m.played_on <= $${params.length}`);
  }

  if (playerId) {
    params.push(playerId);
    conditions.push(
      `EXISTS (SELECT 1 FROM multiplayer_match_players mpf WHERE mpf.match_id = m.id AND mpf.player_id = $${params.length})`
    );
  }

  if (optionId) {
    params.push(optionId);
    conditions.push(
      `EXISTS (SELECT 1 FROM multiplayer_match_options mof WHERE mof.match_id = m.id AND mof.option_id = $${params.length})`
    );
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

async function getMultiplayerMatchCore(id) {
  const pool = getPool();
  const matchResult = await pool.query(
    `SELECT
      m.id,
      m.played_on,
      m.notes,
      m.created_at,
      m.updated_at,
      g.id AS game_id,
      g.code AS game_code,
      g.display_name AS game_display_name,
      g.scoring_type AS game_scoring_type,
      g.min_players AS game_min_players,
      g.max_players AS game_max_players,
      g.is_active AS game_is_active,
      g.visible_in_multiplayer AS game_in_quick_menu,
      g.options_exclusive AS game_options_exclusive,
      COALESCE(opts.active_options, 0)::int AS game_options_count,
      (COALESCE(opts.active_options, 0) > 0) AS game_requires_option,
      COALESCE(custom_fields.active_custom_fields, 0)::int AS game_custom_fields_count
     FROM multiplayer_matches m
     JOIN multiplayer_games g ON g.id = m.game_id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS active_options
       FROM multiplayer_game_options gopts
       WHERE gopts.game_id = g.id AND gopts.is_active = true
     ) opts ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS active_custom_fields
       FROM multiplayer_custom_scoring_fields c
       WHERE c.game_id = g.id AND c.is_active = true
     ) custom_fields ON true
     WHERE m.id = $1`,
    [id]
  );

  if (matchResult.rowCount === 0) {
    const error = new Error('Multiplayer match not found');
    error.code = 'MULTIPLAYER_MATCH_NOT_FOUND';
    throw error;
  }

  return matchResult.rows[0];
}

async function listMatchOptionsByMatchIds(pool, matchIds) {
  if (!Array.isArray(matchIds) || matchIds.length === 0) {
    return new Map();
  }

  const optionsResult = await pool.query(
    `SELECT
      mo.match_id,
      go.id,
      go.code,
      go.display_name,
      go.sort_order
     FROM multiplayer_match_options mo
     JOIN multiplayer_game_options go ON go.id = mo.option_id
     WHERE mo.match_id = ANY($1::uuid[])
     ORDER BY mo.match_id ASC, go.sort_order ASC, go.display_name ASC, go.id ASC`,
    [matchIds]
  );

  const grouped = new Map();
  optionsResult.rows.forEach((row) => {
    if (!grouped.has(row.match_id)) {
      grouped.set(row.match_id, []);
    }
    grouped.get(row.match_id).push(row);
  });

  const mapped = new Map();
  grouped.forEach((rows, matchId) => {
    mapped.set(matchId, mapMatchOptionsRows(rows));
  });

  return mapped;
}

async function setMatchOptions(client, { matchId, gameId, optionIds }) {
  if (optionIds === undefined) {
    return;
  }

  const normalizedOptionIds = [...new Set((optionIds || []).filter(Boolean))];
  await client.query('DELETE FROM multiplayer_match_options WHERE match_id = $1', [matchId]);

  if (normalizedOptionIds.length === 0) {
    return;
  }

  const values = [];
  const placeholders = [];
  normalizedOptionIds.forEach((optionId, index) => {
    const baseIndex = index * 3;
    values.push(matchId, gameId, optionId);
    placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`);
  });

  await client.query(
    `INSERT INTO multiplayer_match_options (match_id, game_id, option_id)
     VALUES ${placeholders.join(', ')}`,
    values
  );
}

async function updateMultiplayerMatchCore(client, { id, playedOn, notes, touchUpdatedAt }) {
  const fields = [];
  const values = [];

  if (playedOn !== undefined) {
    values.push(playedOn);
    fields.push(`played_on = $${values.length}`);
  }

  if (notes !== undefined) {
    values.push(notes ?? null);
    fields.push(`notes = $${values.length}`);
  }

  if (touchUpdatedAt || fields.length > 0) {
    fields.push('updated_at = now()');
  }

  if (fields.length === 0) {
    return;
  }

  values.push(id);
  await client.query(
    `UPDATE multiplayer_matches
     SET ${fields.join(', ')}
     WHERE id = $${values.length}`,
    values
  );
}

async function listMultiplayerMatches({ gameId, playerId, optionId, dateFrom, dateTo, limit, offset }) {
  const pool = getPool();
  const { whereClause, params } = buildWhereClause({ gameId, playerId, optionId, dateFrom, dateTo });

  const totalResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM multiplayer_matches m ${whereClause}`,
    params
  );
  const total = totalResult.rows[0]?.total ?? 0;

  const pagingParams = [...params, limit, offset];
  const idsResult = await pool.query(
    `SELECT m.id
     FROM multiplayer_matches m
     ${whereClause}
     ORDER BY m.played_on DESC
     LIMIT $${pagingParams.length - 1}
     OFFSET $${pagingParams.length}`,
    pagingParams
  );

  const ids = idsResult.rows.map((row) => row.id);
  if (ids.length === 0) {
    return { items: [], total };
  }

  const rowsResult = await pool.query(
    `SELECT
      m.id,
      m.played_on,
      m.notes,
      g.id AS game_id,
      g.code AS game_code,
      g.display_name AS game_display_name,
      mp.player_id,
      p.name AS player_name,
      mp.total_points,
      mp.place
     FROM multiplayer_matches m
     JOIN multiplayer_games g ON g.id = m.game_id
     JOIN multiplayer_match_players mp ON mp.match_id = m.id
     JOIN players p ON p.id = mp.player_id
     WHERE m.id = ANY($1::uuid[])
     ORDER BY m.played_on DESC, m.id, mp.place ASC, mp.total_points DESC, mp.player_id ASC`,
    [ids]
  );

  const optionsByMatchId = await listMatchOptionsByMatchIds(pool, ids);
  const items = buildMatchListItems(rowsResult.rows, ids, optionsByMatchId);
  return { items, total };
}

async function getMultiplayerMatchById(id) {
  const pool = getPool();

  const matchRow = await getMultiplayerMatchCore(id);
  const optionsByMatchId = await listMatchOptionsByMatchIds(pool, [id]);
  const matchOptions = optionsByMatchId.get(id) ?? [];

  if (matchRow.game_scoring_type === 'MANUAL_POINTS') {
    const playersResult = await pool.query(
      `SELECT
        mp.player_id,
        p.name AS player_name,
        mp.total_points,
        mp.place
       FROM multiplayer_match_players mp
       JOIN players p ON p.id = mp.player_id
       WHERE mp.match_id = $1
       ORDER BY mp.place ASC, mp.total_points DESC, mp.player_id ASC`,
      [id]
    );

    return buildBaseMatchPayload(matchRow, playersResult.rows, matchOptions);
  }

  if (matchRow.game_scoring_type === 'TTR_CALCULATOR') {
    const playersResult = await pool.query(
      `SELECT
        mp.player_id,
        p.name AS player_name,
        mp.total_points,
        mp.place
       FROM multiplayer_match_players mp
       JOIN players p ON p.id = mp.player_id
       WHERE mp.match_id = $1
       ORDER BY mp.place ASC, mp.total_points DESC, mp.player_id ASC`,
      [id]
    );

    const base = buildBaseMatchPayload(matchRow, playersResult.rows, matchOptions);

    const rowsResult = await pool.query(
      `SELECT
        mp.player_id,
        mp.total_points,
        mp.place,
        ttr.tickets_points,
        ttr.bonus_points,
        ttr.trains_counts,
        ttr.trains_points,
        v.id AS variant_id,
        v.code AS variant_code,
        v.name AS variant_name
       FROM multiplayer_match_players mp
       LEFT JOIN multiplayer_ticket_to_ride_player_details ttr ON ttr.match_player_id = mp.id
       LEFT JOIN multiplayer_ticket_to_ride_matches mtm ON mtm.match_id = mp.match_id
       LEFT JOIN ticket_to_ride_variants v ON v.id = mtm.variant_id
       WHERE mp.match_id = $1
       ORDER BY mp.place ASC, mp.total_points DESC, mp.player_id ASC`,
      [id]
    );

    const hasLegacyDetails = rowsResult.rows.some(
      (row) =>
        row.tickets_points !== null ||
        row.bonus_points !== null ||
        row.trains_counts !== null ||
        row.trains_points !== null ||
        row.variant_id !== null
    );

    if (!hasLegacyDetails) {
      return base;
    }

    const variantRow = rowsResult.rows[0];
    const placeByPlayerId = new Map(base.players.map((player) => [player.playerId, player.place]));
    const playersDetails = sortPlayersByPlace(
      rowsResult.rows
        .filter(
          (row) =>
            row.tickets_points !== null ||
            row.bonus_points !== null ||
            row.trains_counts !== null ||
            row.trains_points !== null
        )
        .map((row) => ({
          playerId: row.player_id,
          ticketsPoints: row.tickets_points ?? 0,
          bonusPoints: row.bonus_points ?? 0,
          trainsCounts:
            row.trains_counts ??
            { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0 },
          trainsPoints: row.trains_points ?? 0,
          totalPoints: row.total_points,
          place: placeByPlayerId.get(row.player_id) ?? null,
        }))
    );
    return {
      ...base,
      ticketToRide: {
        variant: variantRow
          ? { id: variantRow.variant_id, code: variantRow.variant_code, name: variantRow.variant_name }
          : null,
        playersDetails,
      },
    };
  }

  if (matchRow.game_scoring_type === 'TM_CALCULATOR') {
    const rowsResult = await pool.query(
      `SELECT
        mp.player_id,
        p.name AS player_name,
        mp.total_points,
        mp.place,
        tm.titles_count,
        tm.awards_first_count,
        tm.awards_second_count,
        tm.cities_points,
        tm.forests_points,
        tm.cards_points,
        tm.tr_points,
        tm.titles_points,
        tm.awards_first_points,
        tm.awards_second_points
       FROM multiplayer_match_players mp
       JOIN players p ON p.id = mp.player_id
       LEFT JOIN multiplayer_terraforming_mars_player_details tm ON tm.match_player_id = mp.id
       WHERE mp.match_id = $1
       ORDER BY mp.place ASC, mp.total_points DESC, mp.player_id ASC`,
      [id]
    );

    const base = buildBaseMatchPayload(matchRow, rowsResult.rows, matchOptions);
    const placeByPlayerId = new Map(base.players.map((player) => [player.playerId, player.place]));
    const playersDetails = sortPlayersByPlace(
      rowsResult.rows.map((row) => ({
        playerId: row.player_id,
        titlesCount: row.titles_count ?? 0,
        awardsFirstCount: row.awards_first_count ?? 0,
        awardsSecondCount: row.awards_second_count ?? 0,
        citiesPoints: row.cities_points ?? 0,
        forestsPoints: row.forests_points ?? 0,
        cardsPoints: row.cards_points ?? 0,
        trPoints: row.tr_points ?? 0,
        titlesPoints: row.titles_points ?? 0,
        awardsFirstPoints: row.awards_first_points ?? 0,
        awardsSecondPoints: row.awards_second_points ?? 0,
        totalPoints: row.total_points,
        place: placeByPlayerId.get(row.player_id) ?? null,
      }))
    );
    return {
      ...base,
      terraformingMars: {
        playersDetails,
      },
    };
  }

  if (matchRow.game_scoring_type === 'CUSTOM_CALCULATOR') {
    const fieldsResult = await pool.query(
      `SELECT
        id,
        game_id,
        code,
        label,
        description,
        points_per_unit,
        sort_order,
        is_active
       FROM multiplayer_custom_scoring_fields
       WHERE game_id = $1
       ORDER BY sort_order ASC, label ASC`,
      [matchRow.game_id]
    );
    const fields = fieldsResult.rows.map(mapCustomScoringField);

    const rowsResult = await pool.query(
      `SELECT
        mp.id AS match_player_id,
        mp.player_id,
        p.name AS player_name,
        mp.total_points,
        mp.place,
        cv.field_id,
        cv.value,
        cv.points,
        f.sort_order AS field_sort_order
       FROM multiplayer_match_players mp
       JOIN players p ON p.id = mp.player_id
       LEFT JOIN multiplayer_custom_match_player_values cv ON cv.match_player_id = mp.id
       LEFT JOIN multiplayer_custom_scoring_fields f ON f.id = cv.field_id
       WHERE mp.match_id = $1
       ORDER BY mp.place ASC, mp.total_points DESC, mp.player_id ASC, f.sort_order ASC NULLS LAST, cv.field_id ASC`,
      [id]
    );

    const basePlayers = [];
    const playerDetailsById = new Map();

    rowsResult.rows.forEach((row) => {
      if (!playerDetailsById.has(row.player_id)) {
        basePlayers.push({
          player_id: row.player_id,
          player_name: row.player_name,
          total_points: row.total_points,
          place: row.place,
        });
        playerDetailsById.set(row.player_id, {
          playerId: row.player_id,
          values: [],
          totalPoints: row.total_points,
          place: null,
        });
      }

      if (row.field_id) {
        playerDetailsById.get(row.player_id).values.push({
          fieldId: row.field_id,
          value: row.value,
          points: row.points,
        });
      }
    });

    const base = buildBaseMatchPayload(matchRow, basePlayers, matchOptions);

    return {
      ...base,
      customCalculator: {
        fields,
        playersDetails: assignDisplayPlaces(Array.from(playerDetailsById.values())),
      },
    };
  }

  return buildBaseMatchPayload(matchRow, [], matchOptions);
}

async function updateMultiplayerMatchManual({
  match,
  playedOn,
  notes,
  players,
  options,
  preserveLinkedPlayerDetails = false,
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const touchUpdatedAt = Boolean(players) || options !== undefined;
    await updateMultiplayerMatchCore(client, { id: match.id, playedOn, notes, touchUpdatedAt });

    if (options !== undefined) {
      await setMatchOptions(client, {
        matchId: match.id,
        gameId: match.gameId,
        optionIds: options.map((option) => option.id),
      });
    }

    if (players) {
      const playersWithPlaces = assignPlaces(players);

      if (preserveLinkedPlayerDetails) {
        const dependentDetailsResult = await client.query(
          `SELECT EXISTS (
             SELECT 1
             FROM multiplayer_match_players mp
             LEFT JOIN multiplayer_ticket_to_ride_player_details ttr
               ON ttr.match_player_id = mp.id
             LEFT JOIN multiplayer_terraforming_mars_player_details tm
               ON tm.match_player_id = mp.id
             LEFT JOIN multiplayer_custom_match_player_values cv
               ON cv.match_player_id = mp.id
             WHERE mp.match_id = $1
               AND (
                 ttr.id IS NOT NULL
                 OR tm.id IS NOT NULL
                 OR cv.id IS NOT NULL
               )
           ) AS has_linked_details`,
          [match.id]
        );

        if (dependentDetailsResult.rows[0]?.has_linked_details === true) {
          const existingPlayersResult = await client.query(
            `SELECT player_id
             FROM multiplayer_match_players
             WHERE match_id = $1
             ORDER BY player_id ASC`,
            [match.id]
          );

          const existingPlayerIds = existingPlayersResult.rows.map((row) => row.player_id);
          const incomingPlayerIds = [...new Set(playersWithPlaces.map((player) => player.playerId))].sort(
            (a, b) => a.localeCompare(b)
          );

          const samePlayerSet =
            existingPlayerIds.length === incomingPlayerIds.length &&
            existingPlayerIds.every((playerId, index) => playerId === incomingPlayerIds[index]);

          if (!samePlayerSet) {
            const lockedError = new Error('Cannot change player set when legacy detail rows exist');
            lockedError.code = 'MULTIPLAYER_MATCH_PLAYER_SET_LOCKED';
            throw lockedError;
          }

          for (const player of playersWithPlaces) {
            // eslint-disable-next-line no-await-in-loop
            await client.query(
              `UPDATE multiplayer_match_players
               SET total_points = $1, place = $2
               WHERE match_id = $3 AND player_id = $4`,
              [player.totalPoints, player.place, match.id, player.playerId]
            );
          }
        } else {
          await client.query('DELETE FROM multiplayer_match_players WHERE match_id = $1', [match.id]);

          const values = [];
          const placeholders = [];
          playersWithPlaces.forEach((player, index) => {
            const baseIndex = index * 4;
            values.push(match.id, player.playerId, player.totalPoints, player.place);
            placeholders.push(
              `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
            );
          });

          await client.query(
            `INSERT INTO multiplayer_match_players (
              match_id,
              player_id,
              total_points,
              place
            ) VALUES ${placeholders.join(', ')}`,
            values
          );
        }
      } else {
        await client.query('DELETE FROM multiplayer_match_players WHERE match_id = $1', [match.id]);

        const values = [];
        const placeholders = [];
        playersWithPlaces.forEach((player, index) => {
          const baseIndex = index * 4;
          values.push(match.id, player.playerId, player.totalPoints, player.place);
          placeholders.push(
            `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
          );
        });

        await client.query(
          `INSERT INTO multiplayer_match_players (
            match_id,
            player_id,
            total_points,
            place
          ) VALUES ${placeholders.join(', ')}`,
          values
        );
      }
    }

    await client.query('COMMIT');
    return await getMultiplayerMatchById(match.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateMultiplayerMatchCustomCalculator({
  match,
  playedOn,
  notes,
  players,
  activeFields,
  options,
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const touchUpdatedAt = Boolean(players) || options !== undefined;
    await updateMultiplayerMatchCore(client, { id: match.id, playedOn, notes, touchUpdatedAt });

    if (options !== undefined) {
      await setMatchOptions(client, {
        matchId: match.id,
        gameId: match.gameId,
        optionIds: options.map((option) => option.id),
      });
    }

    if (players) {
      await client.query('DELETE FROM multiplayer_match_players WHERE match_id = $1', [match.id]);

      const computedPlayers = computeCustomCalculatorPlayers(players, activeFields);
      const playersWithPlaces = assignPlaces(computedPlayers);
      const values = [];
      const placeholders = [];
      playersWithPlaces.forEach((player, index) => {
        const baseIndex = index * 4;
        values.push(match.id, player.playerId, player.totalPoints, player.place);
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
        );
      });

      const matchPlayersResult = await client.query(
        `INSERT INTO multiplayer_match_players (
          match_id,
          player_id,
          total_points,
          place
        ) VALUES ${placeholders.join(', ')}
        RETURNING id, player_id`,
        values
      );

      const matchPlayerById = new Map(matchPlayersResult.rows.map((row) => [row.player_id, row]));
      const detailValues = [];
      const detailPlaceholders = [];
      let detailIndex = 0;
      playersWithPlaces.forEach((player) => {
        const matchPlayer = matchPlayerById.get(player.playerId);
        player.values.forEach((fieldValue) => {
          const baseIndex = detailIndex * 4;
          detailValues.push(matchPlayer.id, fieldValue.fieldId, fieldValue.value, fieldValue.points);
          detailPlaceholders.push(
            `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
          );
          detailIndex += 1;
        });
      });

      if (detailPlaceholders.length > 0) {
        await client.query(
          `INSERT INTO multiplayer_custom_match_player_values (
            match_player_id,
            field_id,
            value,
            points
          ) VALUES ${detailPlaceholders.join(', ')}`,
          detailValues
        );
      }
    }

    await client.query('COMMIT');
    return await getMultiplayerMatchById(match.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateMultiplayerMatchTicketToRide({
  match,
  playedOn,
  notes,
  players,
  variant,
  options,
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const touchUpdatedAt = Boolean(players) || Boolean(variant) || options !== undefined;
    await updateMultiplayerMatchCore(client, { id: match.id, playedOn, notes, touchUpdatedAt });

    if (options !== undefined) {
      await setMatchOptions(client, {
        matchId: match.id,
        gameId: match.gameId,
        optionIds: options.map((option) => option.id),
      });
    }

    if (variant) {
      await client.query(
        `INSERT INTO multiplayer_ticket_to_ride_matches (match_id, variant_id)
         VALUES ($1, $2)
         ON CONFLICT (match_id) DO UPDATE SET variant_id = EXCLUDED.variant_id`,
        [match.id, variant.id]
      );
    }

    if (players) {
      await client.query('DELETE FROM multiplayer_match_players WHERE match_id = $1', [match.id]);

      const computedPlayers = players.map((player) => {
        const trainsPoints = computeTrainsPoints(player.trainsCounts);
        const totalPoints = trainsPoints + player.ticketsPoints + player.bonusPoints;
        return {
          ...player,
          trainsPoints,
          totalPoints,
        };
      });

      const playersWithPlaces = assignPlacesTicketToRide(computedPlayers);

      const values = [];
      const placeholders = [];
      playersWithPlaces.forEach((player, index) => {
        const baseIndex = index * 4;
        values.push(match.id, player.playerId, player.totalPoints, player.place);
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
        );
      });

      const matchPlayersResult = await client.query(
        `INSERT INTO multiplayer_match_players (
          match_id,
          player_id,
          total_points,
          place
        ) VALUES ${placeholders.join(', ')}
        RETURNING id, player_id`,
        values
      );

      const matchPlayerRows = matchPlayersResult.rows;
      const matchPlayerById = new Map(matchPlayerRows.map((row) => [row.player_id, row]));

      const detailValues = [];
      const detailPlaceholders = [];
      playersWithPlaces.forEach((player, index) => {
        const matchPlayer = matchPlayerById.get(player.playerId);
        const baseIndex = index * 5;
        detailValues.push(
          matchPlayer.id,
          player.ticketsPoints,
          player.bonusPoints,
          player.trainsCounts,
          player.trainsPoints
        );
        detailPlaceholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5})`
        );
      });

      await client.query(
        `INSERT INTO multiplayer_ticket_to_ride_player_details (
          match_player_id,
          tickets_points,
          bonus_points,
          trains_counts,
          trains_points
        ) VALUES ${detailPlaceholders.join(', ')}`,
        detailValues
      );
    }

    await client.query('COMMIT');
    return await getMultiplayerMatchById(match.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateMultiplayerMatchTerraformingMars({ match, playedOn, notes, players, options }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const touchUpdatedAt = Boolean(players) || options !== undefined;
    await updateMultiplayerMatchCore(client, { id: match.id, playedOn, notes, touchUpdatedAt });

    if (options !== undefined) {
      await setMatchOptions(client, {
        matchId: match.id,
        gameId: match.gameId,
        optionIds: options.map((option) => option.id),
      });
    }

    if (players) {
      await client.query('DELETE FROM multiplayer_match_players WHERE match_id = $1', [match.id]);

      const computedPlayers = players.map((player) => {
        const titlesCount = player.titlesCount ?? 0;
        const awardsFirstCount = player.awardsFirstCount ?? 0;
        const awardsSecondCount = player.awardsSecondCount ?? 0;
        const citiesPoints = player.citiesPoints ?? 0;
        const forestsPoints = player.forestsPoints ?? 0;
        const cardsPoints = player.cardsPoints ?? 0;
        const trPoints = player.trPoints ?? 0;
        const titlesPoints = titlesCount * 5;
        const awardsFirstPoints = awardsFirstCount * 5;
        const awardsSecondPoints = awardsSecondCount * 2;
        const totalPoints =
          titlesPoints +
          awardsFirstPoints +
          awardsSecondPoints +
          citiesPoints +
          forestsPoints +
          cardsPoints +
          trPoints;

        return {
          playerId: player.playerId,
          titlesCount,
          awardsFirstCount,
          awardsSecondCount,
          citiesPoints,
          forestsPoints,
          cardsPoints,
          trPoints,
          titlesPoints,
          awardsFirstPoints,
          awardsSecondPoints,
          totalPoints,
        };
      });

      const playersWithPlaces = assignPlacesTerraformingMars(computedPlayers);

      const values = [];
      const placeholders = [];
      playersWithPlaces.forEach((player, index) => {
        const baseIndex = index * 4;
        values.push(match.id, player.playerId, player.totalPoints, player.place);
        placeholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
        );
      });

      const matchPlayersResult = await client.query(
        `INSERT INTO multiplayer_match_players (
          match_id,
          player_id,
          total_points,
          place
        ) VALUES ${placeholders.join(', ')}
        RETURNING id, player_id`,
        values
      );

      const matchPlayerRows = matchPlayersResult.rows;
      const matchPlayerById = new Map(matchPlayerRows.map((row) => [row.player_id, row]));

      const detailValues = [];
      const detailPlaceholders = [];
      playersWithPlaces.forEach((player, index) => {
        const matchPlayer = matchPlayerById.get(player.playerId);
        const baseIndex = index * 11;
        detailValues.push(
          matchPlayer.id,
          player.titlesCount,
          player.awardsFirstCount,
          player.awardsSecondCount,
          player.citiesPoints,
          player.forestsPoints,
          player.cardsPoints,
          player.trPoints,
          player.titlesPoints,
          player.awardsFirstPoints,
          player.awardsSecondPoints
        );
        detailPlaceholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11})`
        );
      });

      await client.query(
        `INSERT INTO multiplayer_terraforming_mars_player_details (
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
        ) VALUES ${detailPlaceholders.join(', ')}`,
        detailValues
      );
    }

    await client.query('COMMIT');
    return await getMultiplayerMatchById(match.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteMultiplayerMatch(id) {
  const pool = getPool();
  const result = await pool.query(
    'DELETE FROM multiplayer_matches WHERE id = $1 RETURNING id',
    [id]
  );
  if (result.rowCount === 0) {
    const error = new Error('Multiplayer match not found');
    error.code = 'MULTIPLAYER_MATCH_NOT_FOUND';
    throw error;
  }
}

async function createMultiplayerMatchManual({ game, playedOn, notes, players, options }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const matchResult = await client.query(
      `INSERT INTO multiplayer_matches (game_id, played_on, notes)
       VALUES ($1, $2, $3)
       RETURNING id, played_on, notes`,
      [game.id, playedOn, notes ?? null]
    );

    const match = matchResult.rows[0];

    if (options !== undefined) {
      await setMatchOptions(client, {
        matchId: match.id,
        gameId: game.id,
        optionIds: options.map((option) => option.id),
      });
    }

    const playersWithPlaces = assignPlaces(players);

    const values = [];
    const placeholders = [];
    playersWithPlaces.forEach((player, index) => {
      const baseIndex = index * 4;
      values.push(match.id, player.playerId, player.totalPoints, player.place);
      placeholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
      );
    });

    await client.query(
      `INSERT INTO multiplayer_match_players (
        match_id,
        player_id,
        total_points,
        place
      ) VALUES ${placeholders.join(', ')}`,
      values
    );

    const playersResult = await client.query(
      `SELECT
        mp.player_id,
        p.name AS player_name,
        mp.total_points,
        mp.place
      FROM multiplayer_match_players mp
      JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = $1
      ORDER BY mp.place ASC, mp.total_points DESC, mp.player_id ASC`,
      [match.id]
    );

    const payload = {
      id: match.id,
      game: {
        id: game.id,
        code: game.code,
        displayName: game.displayName,
        scoringType: game.scoringType,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        isActive: game.isActive,
        showInQuickMenu: game.showInQuickMenu,
        optionsCount: game.optionsCount,
        requiresOption: game.requiresOption,
        optionsExclusive: game.optionsExclusive ?? true,
        customFieldsCount: game.customFieldsCount,
      },
      playedOn: formatDate(match.played_on),
      notes: match.notes ?? null,
      options: options ?? [],
      option: options?.[0] ?? null,
      players: playersResult.rows.map((row) => ({
        playerId: row.player_id,
        name: row.player_name,
        totalPoints: row.total_points,
        place: row.place,
      })),
    };

    await client.query('COMMIT');
    return payload;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createMultiplayerMatchCustomCalculator({
  game,
  options,
  playedOn,
  notes,
  players,
  activeFields,
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const matchResult = await client.query(
      `INSERT INTO multiplayer_matches (game_id, played_on, notes)
       VALUES ($1, $2, $3)
       RETURNING id, played_on, notes`,
      [game.id, playedOn, notes ?? null]
    );

    const match = matchResult.rows[0];

    if (options !== undefined) {
      await setMatchOptions(client, {
        matchId: match.id,
        gameId: game.id,
        optionIds: options.map((option) => option.id),
      });
    }

    const computedPlayers = computeCustomCalculatorPlayers(players, activeFields);
    const playersWithPlaces = assignPlaces(computedPlayers);

    const values = [];
    const placeholders = [];
    playersWithPlaces.forEach((player, index) => {
      const baseIndex = index * 4;
      values.push(match.id, player.playerId, player.totalPoints, player.place);
      placeholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
      );
    });

    const matchPlayersResult = await client.query(
      `INSERT INTO multiplayer_match_players (
        match_id,
        player_id,
        total_points,
        place
      ) VALUES ${placeholders.join(', ')}
      RETURNING id, player_id, total_points, place`,
      values
    );

    const matchPlayerById = new Map(matchPlayersResult.rows.map((row) => [row.player_id, row]));
    const detailValues = [];
    const detailPlaceholders = [];
    let detailIndex = 0;

    playersWithPlaces.forEach((player) => {
      const matchPlayer = matchPlayerById.get(player.playerId);
      player.values.forEach((fieldValue) => {
        const baseIndex = detailIndex * 4;
        detailValues.push(matchPlayer.id, fieldValue.fieldId, fieldValue.value, fieldValue.points);
        detailPlaceholders.push(
          `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
        );
        detailIndex += 1;
      });
    });

    if (detailPlaceholders.length > 0) {
      await client.query(
        `INSERT INTO multiplayer_custom_match_player_values (
          match_player_id,
          field_id,
          value,
          points
        ) VALUES ${detailPlaceholders.join(', ')}`,
        detailValues
      );
    }

    const playersResult = await client.query(
      `SELECT
        mp.player_id,
        p.name AS player_name,
        mp.total_points,
        mp.place
      FROM multiplayer_match_players mp
      JOIN players p ON p.id = mp.player_id
      WHERE mp.match_id = $1
      ORDER BY mp.place ASC, mp.total_points DESC, mp.player_id ASC`,
      [match.id]
    );

    const payload = {
      id: match.id,
      game: {
        id: game.id,
        code: game.code,
        displayName: game.displayName,
        scoringType: game.scoringType,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        isActive: game.isActive,
        showInQuickMenu: game.showInQuickMenu,
        optionsCount: game.optionsCount,
        requiresOption: game.requiresOption,
        optionsExclusive: game.optionsExclusive ?? true,
        customFieldsCount: game.customFieldsCount,
      },
      playedOn: formatDate(match.played_on),
      notes: match.notes ?? null,
      options: options ?? [],
      option: options?.[0] ?? null,
      players: playersResult.rows.map((row) => ({
        playerId: row.player_id,
        name: row.player_name,
        totalPoints: row.total_points,
        place: row.place,
      })),
      customCalculator: {
        fields: activeFields,
        playersDetails: playersWithPlaces.map((player) => ({
          playerId: player.playerId,
          values: player.values,
          totalPoints: player.totalPoints,
          place: player.place,
        })),
      },
    };

    await client.query('COMMIT');
    return payload;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createMultiplayerMatchTicketToRide({
  game,
  variant,
  options,
  playedOn,
  notes,
  players,
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const matchResult = await client.query(
      `INSERT INTO multiplayer_matches (game_id, played_on, notes)
       VALUES ($1, $2, $3)
       RETURNING id, played_on, notes`,
      [game.id, playedOn, notes ?? null]
    );

    const match = matchResult.rows[0];

    await client.query(
      `INSERT INTO multiplayer_ticket_to_ride_matches (match_id, variant_id)
       VALUES ($1, $2)`,
      [match.id, variant.id]
    );

    if (options !== undefined) {
      await setMatchOptions(client, {
        matchId: match.id,
        gameId: game.id,
        optionIds: options.map((option) => option.id),
      });
    }

    const computedPlayers = players.map((player) => {
      const trainsPoints = computeTrainsPoints(player.trainsCounts);
      const totalPoints = trainsPoints + player.ticketsPoints + player.bonusPoints;
      return {
        ...player,
        trainsPoints,
        totalPoints,
      };
    });

    const playersWithPlaces = assignPlacesTicketToRide(computedPlayers);

    const values = [];
    const placeholders = [];
    playersWithPlaces.forEach((player, index) => {
      const baseIndex = index * 4;
      values.push(match.id, player.playerId, player.totalPoints, player.place);
      placeholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
      );
    });

    const matchPlayersResult = await client.query(
      `INSERT INTO multiplayer_match_players (
        match_id,
        player_id,
        total_points,
        place
      ) VALUES ${placeholders.join(', ')}
      RETURNING id, player_id, total_points, place`,
      values
    );

    const matchPlayerRows = matchPlayersResult.rows;
    const matchPlayerById = new Map(matchPlayerRows.map((row) => [row.player_id, row]));

    const detailValues = [];
    const detailPlaceholders = [];
    playersWithPlaces.forEach((player, index) => {
      const matchPlayer = matchPlayerById.get(player.playerId);
      const baseIndex = index * 5;
      detailValues.push(
        matchPlayer.id,
        player.ticketsPoints,
        player.bonusPoints,
        player.trainsCounts,
        player.trainsPoints
      );
      detailPlaceholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5})`
      );
    });

    await client.query(
      `INSERT INTO multiplayer_ticket_to_ride_player_details (
        match_player_id,
        tickets_points,
        bonus_points,
        trains_counts,
        trains_points
      ) VALUES ${detailPlaceholders.join(', ')}`,
      detailValues
    );

    const playersResult = await client.query(
      `SELECT
        mp.player_id,
        p.name AS player_name,
        mp.total_points,
        mp.place,
        ttr.tickets_points,
        ttr.bonus_points,
        ttr.trains_counts,
        ttr.trains_points
      FROM multiplayer_match_players mp
      JOIN players p ON p.id = mp.player_id
      JOIN multiplayer_ticket_to_ride_player_details ttr ON ttr.match_player_id = mp.id
      WHERE mp.match_id = $1
      ORDER BY mp.place ASC, mp.total_points DESC, mp.player_id ASC`,
      [match.id]
    );

    const payload = {
      id: match.id,
      game: {
        id: game.id,
        code: game.code,
        displayName: game.displayName,
        scoringType: game.scoringType,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        isActive: game.isActive,
        showInQuickMenu: game.showInQuickMenu,
        optionsCount: game.optionsCount,
        requiresOption: game.requiresOption,
        optionsExclusive: game.optionsExclusive ?? true,
        customFieldsCount: game.customFieldsCount,
      },
      playedOn: formatDate(match.played_on),
      notes: match.notes ?? null,
      options: options ?? [],
      option: options?.[0] ?? null,
      players: playersResult.rows.map((row) => ({
        playerId: row.player_id,
        name: row.player_name,
        totalPoints: row.total_points,
        place: row.place,
      })),
      ticketToRide: {
        variant: {
          id: variant.id,
          code: variant.code,
          name: variant.name,
        },
        playersDetails: playersResult.rows.map((row) => ({
          playerId: row.player_id,
          ticketsPoints: row.tickets_points,
          bonusPoints: row.bonus_points,
          trainsCounts: row.trains_counts,
          trainsPoints: row.trains_points,
          totalPoints: row.total_points,
          place: row.place,
        })),
      },
    };

    await client.query('COMMIT');
    return payload;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function createMultiplayerMatchTerraformingMars({ game, options, playedOn, notes, players }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const matchResult = await client.query(
      `INSERT INTO multiplayer_matches (game_id, played_on, notes)
       VALUES ($1, $2, $3)
       RETURNING id, played_on, notes`,
      [game.id, playedOn, notes ?? null]
    );

    const match = matchResult.rows[0];

    if (options !== undefined) {
      await setMatchOptions(client, {
        matchId: match.id,
        gameId: game.id,
        optionIds: options.map((option) => option.id),
      });
    }

    const computedPlayers = players.map((player) => {
      const titlesCount = player.titlesCount ?? 0;
      const awardsFirstCount = player.awardsFirstCount ?? 0;
      const awardsSecondCount = player.awardsSecondCount ?? 0;
      const citiesPoints = player.citiesPoints ?? 0;
      const forestsPoints = player.forestsPoints ?? 0;
      const cardsPoints = player.cardsPoints ?? 0;
      const trPoints = player.trPoints ?? 0;
      const titlesPoints = titlesCount * 5;
      const awardsFirstPoints = awardsFirstCount * 5;
      const awardsSecondPoints = awardsSecondCount * 2;
      const totalPoints =
        titlesPoints +
        awardsFirstPoints +
        awardsSecondPoints +
        citiesPoints +
        forestsPoints +
        cardsPoints +
        trPoints;

      return {
        playerId: player.playerId,
        titlesCount,
        awardsFirstCount,
        awardsSecondCount,
        citiesPoints,
        forestsPoints,
        cardsPoints,
        trPoints,
        titlesPoints,
        awardsFirstPoints,
        awardsSecondPoints,
        totalPoints,
      };
    });

    const playersWithPlaces = assignPlacesTerraformingMars(computedPlayers);

    const values = [];
    const placeholders = [];
    playersWithPlaces.forEach((player, index) => {
      const baseIndex = index * 4;
      values.push(match.id, player.playerId, player.totalPoints, player.place);
      placeholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4})`
      );
    });

    const matchPlayersResult = await client.query(
      `INSERT INTO multiplayer_match_players (
        match_id,
        player_id,
        total_points,
        place
      ) VALUES ${placeholders.join(', ')}
      RETURNING id, player_id, total_points, place`,
      values
    );

    const matchPlayerRows = matchPlayersResult.rows;
    const matchPlayerById = new Map(matchPlayerRows.map((row) => [row.player_id, row]));

    const detailValues = [];
    const detailPlaceholders = [];
    playersWithPlaces.forEach((player, index) => {
      const matchPlayer = matchPlayerById.get(player.playerId);
      const baseIndex = index * 11;
      detailValues.push(
        matchPlayer.id,
        player.titlesCount,
        player.awardsFirstCount,
        player.awardsSecondCount,
        player.citiesPoints,
        player.forestsPoints,
        player.cardsPoints,
        player.trPoints,
        player.titlesPoints,
        player.awardsFirstPoints,
        player.awardsSecondPoints
      );
      detailPlaceholders.push(
        `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11})`
      );
    });

    await client.query(
      `INSERT INTO multiplayer_terraforming_mars_player_details (
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
      ) VALUES ${detailPlaceholders.join(', ')}`,
      detailValues
    );

    const playersResult = await client.query(
      `SELECT
        mp.player_id,
        p.name AS player_name,
        mp.total_points,
        mp.place,
        tm.titles_count,
        tm.awards_first_count,
        tm.awards_second_count,
        tm.cities_points,
        tm.forests_points,
        tm.cards_points,
        tm.tr_points,
        tm.titles_points,
        tm.awards_first_points,
        tm.awards_second_points
      FROM multiplayer_match_players mp
      JOIN players p ON p.id = mp.player_id
      JOIN multiplayer_terraforming_mars_player_details tm ON tm.match_player_id = mp.id
      WHERE mp.match_id = $1
      ORDER BY mp.place ASC, mp.total_points DESC, mp.player_id ASC`,
      [match.id]
    );

    const payload = {
      id: match.id,
      game: {
        id: game.id,
        code: game.code,
        displayName: game.displayName,
        scoringType: game.scoringType,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        isActive: game.isActive,
        showInQuickMenu: game.showInQuickMenu,
        optionsCount: game.optionsCount,
        requiresOption: game.requiresOption,
        optionsExclusive: game.optionsExclusive ?? true,
        customFieldsCount: game.customFieldsCount,
      },
      playedOn: formatDate(match.played_on),
      notes: match.notes ?? null,
      options: options ?? [],
      option: options?.[0] ?? null,
      players: playersResult.rows.map((row) => ({
        playerId: row.player_id,
        name: row.player_name,
        totalPoints: row.total_points,
        place: row.place,
      })),
      terraformingMars: {
        playersDetails: playersResult.rows.map((row) => ({
          playerId: row.player_id,
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
          totalPoints: row.total_points,
          place: row.place,
        })),
      },
    };

    await client.query('COMMIT');
    return payload;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
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
};
