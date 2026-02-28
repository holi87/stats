const { getPool } = require('../db');

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

function assignPlaces(players) {
  // Place is always unique (1..N) using tie-breakers:
  // totalPoints desc, playerId asc.
  const sorted = [...players].sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.playerId.localeCompare(b.playerId);
  });

  const placeByPlayer = new Map();
  sorted.forEach((player, index) => {
    placeByPlayer.set(player.playerId, index + 1);
  });

  return players.map((player) => ({
    ...player,
    place: placeByPlayer.get(player.playerId) ?? null,
  }));
}

function assignPlacesTicketToRide(players) {
  // Place is always unique (1..N) using tie-breakers:
  // totalPoints desc, trainsPoints desc, bonusPoints desc, ticketsPoints desc, playerId asc.
  const sorted = [...players].sort((a, b) => {
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
  });

  const placeByPlayer = new Map();
  sorted.forEach((player, index) => {
    placeByPlayer.set(player.playerId, index + 1);
  });

  return players.map((player) => ({
    ...player,
    place: placeByPlayer.get(player.playerId) ?? null,
  }));
}

function assignPlacesTerraformingMars(players) {
  // Place is always unique (1..N) using tie-breakers:
  // totalPoints desc, trPoints desc, citiesPoints desc, forestsPoints desc, cardsPoints desc, playerId asc.
  const sorted = [...players].sort((a, b) => {
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
  });

  const placeByPlayer = new Map();
  sorted.forEach((player, index) => {
    placeByPlayer.set(player.playerId, index + 1);
  });

  return players.map((player) => ({
    ...player,
    place: placeByPlayer.get(player.playerId) ?? null,
  }));
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
  if (!row || !row.option_id) {
    return null;
  }

  return {
    id: row.option_id,
    code: row.option_code,
    displayName: row.option_display_name,
  };
}

function buildMatchListItems(rows, orderedIds) {
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
        option: mapMatchOptionFromRow(row),
        players: [],
      };
      grouped.set(row.id, match);
    }

    match.players.push({
      playerId: row.player_id,
      name: row.player_name,
      totalPoints: row.total_points,
      place: row.place,
    });
  });

  return orderedIds.map((id) => grouped.get(id)).filter(Boolean);
}

function buildBaseMatchPayload(matchRow, playersRows) {
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
      customFieldsCount: matchRow.game_custom_fields_count,
    },
    playedOn: formatDate(matchRow.played_on),
    notes: matchRow.notes ?? null,
    createdAt: formatTimestamp(matchRow.created_at),
    updatedAt: formatTimestamp(matchRow.updated_at),
    option: mapMatchOptionFromRow(matchRow),
    players: playersRows.map((row) => ({
      playerId: row.player_id,
      name: row.player_name,
      totalPoints: row.total_points,
      place: row.place,
    })),
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
      COALESCE(opts.active_options, 0)::int AS game_options_count,
      (COALESCE(opts.active_options, 0) > 0) AS game_requires_option,
      COALESCE(custom_fields.active_custom_fields, 0)::int AS game_custom_fields_count,
      go.id AS option_id,
      go.code AS option_code,
      go.display_name AS option_display_name
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
     LEFT JOIN multiplayer_match_options mo ON mo.match_id = m.id
     LEFT JOIN multiplayer_game_options go ON go.id = mo.option_id
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

async function upsertMatchOption(client, { matchId, gameId, optionId }) {
  if (optionId === undefined) {
    return;
  }

  await client.query(
    `INSERT INTO multiplayer_match_options (match_id, game_id, option_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (match_id) DO UPDATE
     SET game_id = EXCLUDED.game_id,
         option_id = EXCLUDED.option_id`,
    [matchId, gameId, optionId]
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
      go.id AS option_id,
      go.code AS option_code,
      go.display_name AS option_display_name,
      mp.player_id,
      p.name AS player_name,
      mp.total_points,
      mp.place
     FROM multiplayer_matches m
     JOIN multiplayer_games g ON g.id = m.game_id
     LEFT JOIN multiplayer_match_options mo ON mo.match_id = m.id
     LEFT JOIN multiplayer_game_options go ON go.id = mo.option_id
     JOIN multiplayer_match_players mp ON mp.match_id = m.id
     JOIN players p ON p.id = mp.player_id
     WHERE m.id = ANY($1::uuid[])
     ORDER BY m.played_on DESC, m.id, mp.place ASC`,
    [ids]
  );

  const items = buildMatchListItems(rowsResult.rows, ids);
  return { items, total };
}

async function getMultiplayerMatchById(id) {
  const pool = getPool();

  const matchRow = await getMultiplayerMatchCore(id);

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
       ORDER BY mp.place ASC`,
      [id]
    );

    return buildBaseMatchPayload(matchRow, playersResult.rows);
  }

  if (matchRow.game_scoring_type === 'TTR_CALCULATOR') {
    const rowsResult = await pool.query(
      `SELECT
        mp.player_id,
        p.name AS player_name,
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
       JOIN players p ON p.id = mp.player_id
       JOIN multiplayer_ticket_to_ride_player_details ttr ON ttr.match_player_id = mp.id
       JOIN multiplayer_ticket_to_ride_matches mtm ON mtm.match_id = mp.match_id
       JOIN ticket_to_ride_variants v ON v.id = mtm.variant_id
       WHERE mp.match_id = $1
       ORDER BY mp.place ASC`,
      [id]
    );

    const base = buildBaseMatchPayload(matchRow, rowsResult.rows);
    const variantRow = rowsResult.rows[0];
    return {
      ...base,
      ticketToRide: {
        variant: variantRow
          ? { id: variantRow.variant_id, code: variantRow.variant_code, name: variantRow.variant_name }
          : null,
        playersDetails: rowsResult.rows.map((row) => ({
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
       JOIN multiplayer_terraforming_mars_player_details tm ON tm.match_player_id = mp.id
       WHERE mp.match_id = $1
       ORDER BY mp.place ASC`,
      [id]
    );

    const base = buildBaseMatchPayload(matchRow, rowsResult.rows);
    return {
      ...base,
      terraformingMars: {
        playersDetails: rowsResult.rows.map((row) => ({
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
       ORDER BY mp.place ASC, f.sort_order ASC NULLS LAST, cv.field_id ASC`,
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
          place: row.place,
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

    const base = buildBaseMatchPayload(matchRow, basePlayers);

    return {
      ...base,
      customCalculator: {
        fields,
        playersDetails: Array.from(playerDetailsById.values()),
      },
    };
  }

  return buildBaseMatchPayload(matchRow, []);
}

async function updateMultiplayerMatchManual({ match, playedOn, notes, players, option }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const touchUpdatedAt = Boolean(players) || option !== undefined;
    await updateMultiplayerMatchCore(client, { id: match.id, playedOn, notes, touchUpdatedAt });

    if (option) {
      await upsertMatchOption(client, {
        matchId: match.id,
        gameId: match.gameId,
        optionId: option.id,
      });
    }

    if (players) {
      await client.query('DELETE FROM multiplayer_match_players WHERE match_id = $1', [match.id]);

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
  option,
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const touchUpdatedAt = Boolean(players) || option !== undefined;
    await updateMultiplayerMatchCore(client, { id: match.id, playedOn, notes, touchUpdatedAt });

    if (option) {
      await upsertMatchOption(client, {
        matchId: match.id,
        gameId: match.gameId,
        optionId: option.id,
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
  option,
}) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const touchUpdatedAt = Boolean(players) || Boolean(variant) || option !== undefined;
    await updateMultiplayerMatchCore(client, { id: match.id, playedOn, notes, touchUpdatedAt });

    if (option) {
      await upsertMatchOption(client, {
        matchId: match.id,
        gameId: match.gameId,
        optionId: option.id,
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

async function updateMultiplayerMatchTerraformingMars({ match, playedOn, notes, players, option }) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const touchUpdatedAt = Boolean(players) || option !== undefined;
    await updateMultiplayerMatchCore(client, { id: match.id, playedOn, notes, touchUpdatedAt });

    if (option) {
      await upsertMatchOption(client, {
        matchId: match.id,
        gameId: match.gameId,
        optionId: option.id,
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

async function createMultiplayerMatchManual({ game, playedOn, notes, players, option }) {
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

    if (option) {
      await upsertMatchOption(client, {
        matchId: match.id,
        gameId: game.id,
        optionId: option.id,
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
      ORDER BY mp.place ASC`,
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
        customFieldsCount: game.customFieldsCount,
      },
      playedOn: formatDate(match.played_on),
      notes: match.notes ?? null,
      option: option
        ? {
            id: option.id,
            code: option.code,
            displayName: option.displayName,
          }
        : null,
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
  option,
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

    if (option) {
      await upsertMatchOption(client, {
        matchId: match.id,
        gameId: game.id,
        optionId: option.id,
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
      ORDER BY mp.place ASC`,
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
        customFieldsCount: game.customFieldsCount,
      },
      playedOn: formatDate(match.played_on),
      notes: match.notes ?? null,
      option: option
        ? {
            id: option.id,
            code: option.code,
            displayName: option.displayName,
          }
        : null,
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
  option,
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

    if (option) {
      await upsertMatchOption(client, {
        matchId: match.id,
        gameId: game.id,
        optionId: option.id,
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
      ORDER BY mp.place ASC`,
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
        customFieldsCount: game.customFieldsCount,
      },
      playedOn: formatDate(match.played_on),
      notes: match.notes ?? null,
      option: option
        ? {
            id: option.id,
            code: option.code,
            displayName: option.displayName,
          }
        : null,
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

async function createMultiplayerMatchTerraformingMars({ game, option, playedOn, notes, players }) {
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

    if (option) {
      await upsertMatchOption(client, {
        matchId: match.id,
        gameId: game.id,
        optionId: option.id,
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
      ORDER BY mp.place ASC`,
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
        customFieldsCount: game.customFieldsCount,
      },
      playedOn: formatDate(match.played_on),
      notes: match.notes ?? null,
      option: option
        ? {
            id: option.id,
            code: option.code,
            displayName: option.displayName,
          }
        : null,
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
