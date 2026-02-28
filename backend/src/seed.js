const GAMES = [
  { code: 'rummikub', name: 'Rummikub' },
  { code: 'cortex', name: 'Cortex' },
  { code: 'boggle', name: 'Boggle' },
  { code: 'uno', name: 'Uno' },
  { code: 'ticket_to_ride', name: 'Ticket to Ride' },
];

const TICKET_TO_RIDE_VARIANTS = [
  { code: 'germany', name: 'Niemcy' },
  { code: 'europe', name: 'Europa' },
  { code: 'poland', name: 'Polska' },
  { code: 'great_lakes', name: 'Wielkie Jeziora' },
  { code: 'world', name: 'Świat' },
  { code: 'nordic_countries', name: 'Kraje Nordyckie' },
  { code: 'japan', name: 'Japonia' },
  { code: 'italy', name: 'Włochy' },
  { code: 'london', name: 'Londyn' },
  { code: 'africa', name: 'Afryka' },
];

const MULTIPLAYER_GAMES = [
  {
    code: 'ticket_to_ride',
    displayName: 'Pociągi',
    scoringType: 'TTR_CALCULATOR',
    minPlayers: 2,
    maxPlayers: 5,
  },
  {
    code: 'uno',
    displayName: 'Uno',
    scoringType: 'MANUAL_POINTS',
    minPlayers: 2,
    maxPlayers: 5,
  },
  {
    code: 'rummikub',
    displayName: 'Rummikub',
    scoringType: 'MANUAL_POINTS',
    minPlayers: 2,
    maxPlayers: 5,
  },
  {
    code: 'dobble',
    displayName: 'Dobble',
    scoringType: 'MANUAL_POINTS',
    minPlayers: 2,
    maxPlayers: 5,
  },
  {
    code: 'terraforming_mars',
    displayName: 'Terraformacja Marsa',
    scoringType: 'TM_CALCULATOR',
    minPlayers: 2,
    maxPlayers: 5,
  },
];

async function seedGames(client) {
  const query = 'INSERT INTO games (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING';

  for (const game of GAMES) {
    // Idempotent insert based on unique code
    // eslint-disable-next-line no-await-in-loop
    await client.query(query, [game.code, game.name]);
  }
}

async function seedTicketToRideVariants(client) {
  const query =
    'INSERT INTO ticket_to_ride_variants (code, name) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING';

  for (const variant of TICKET_TO_RIDE_VARIANTS) {
    // Idempotent insert based on unique code
    // eslint-disable-next-line no-await-in-loop
    await client.query(query, [variant.code, variant.name]);
  }
}

async function seedMultiplayerGames(client) {
  const query =
    `INSERT INTO multiplayer_games (code, display_name, scoring_type, min_players, max_players)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (code) DO UPDATE
     SET
       display_name = EXCLUDED.display_name,
       scoring_type = EXCLUDED.scoring_type,
       min_players = EXCLUDED.min_players,
       max_players = EXCLUDED.max_players
     WHERE
       multiplayer_games.display_name IS NULL OR multiplayer_games.display_name = ''
       OR multiplayer_games.scoring_type IS NULL OR multiplayer_games.scoring_type = ''
       OR multiplayer_games.min_players IS NULL OR multiplayer_games.max_players IS NULL
       OR multiplayer_games.display_name <> EXCLUDED.display_name
       OR multiplayer_games.scoring_type <> EXCLUDED.scoring_type
       OR multiplayer_games.min_players <> EXCLUDED.min_players
       OR multiplayer_games.max_players <> EXCLUDED.max_players`;

  for (const game of MULTIPLAYER_GAMES) {
    // Idempotent insert based on unique code
    // eslint-disable-next-line no-await-in-loop
    await client.query(query, [
      game.code,
      game.displayName,
      game.scoringType,
      game.minPlayers,
      game.maxPlayers,
    ]);
  }

  // Keep multiplayer game options synced even when migrations ran before seeds.
  await client.query(
    `INSERT INTO multiplayer_game_options (game_id, code, display_name, sort_order)
     SELECT
       mg.id,
       v.code,
       v.name,
       ROW_NUMBER() OVER (ORDER BY v.name ASC)
     FROM multiplayer_games mg
     JOIN ticket_to_ride_variants v ON true
     WHERE mg.code = 'ticket_to_ride'
     ON CONFLICT (game_id, code) DO UPDATE
       SET
         display_name = EXCLUDED.display_name,
         sort_order = EXCLUDED.sort_order,
         is_active = true`
  );

  await client.query(
    `INSERT INTO multiplayer_game_options (game_id, code, display_name, sort_order)
     SELECT mg.id, seeded.code, seeded.display_name, seeded.sort_order
     FROM multiplayer_games mg
     JOIN (
       VALUES
         ('base', 'Podstawka', 10),
         ('prelude', 'Podstawka + Prelude', 20),
         ('colonies', 'Podstawka + Kolonie', 30),
         ('venus_next', 'Podstawka + Wenus', 40),
         ('turmoil', 'Podstawka + Zamieszki', 50),
         ('all_expansions', 'Wszystkie dodatki', 60)
     ) AS seeded(code, display_name, sort_order) ON true
     WHERE mg.code = 'terraforming_mars'
     ON CONFLICT (game_id, code) DO UPDATE
       SET
         display_name = EXCLUDED.display_name,
         sort_order = EXCLUDED.sort_order,
         is_active = true`
  );
}

module.exports = {
  seedGames,
  seedTicketToRideVariants,
  seedMultiplayerGames,
};
