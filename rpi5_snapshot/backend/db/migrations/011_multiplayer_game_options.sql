CREATE TABLE IF NOT EXISTS multiplayer_game_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES multiplayer_games(id) ON UPDATE CASCADE ON DELETE CASCADE,
  code text NOT NULL,
  display_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplayer_game_options_game_code_unique UNIQUE (game_id, code)
);

CREATE INDEX IF NOT EXISTS multiplayer_game_options_game_sort_idx
  ON multiplayer_game_options (game_id, is_active DESC, sort_order ASC, display_name ASC);

CREATE UNIQUE INDEX IF NOT EXISTS multiplayer_matches_id_game_id_unique_idx
  ON multiplayer_matches (id, game_id);

CREATE UNIQUE INDEX IF NOT EXISTS multiplayer_game_options_id_game_id_unique_idx
  ON multiplayer_game_options (id, game_id);

CREATE TABLE IF NOT EXISTS multiplayer_match_options (
  match_id uuid PRIMARY KEY,
  game_id uuid NOT NULL,
  option_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplayer_match_options_match_game_fk
    FOREIGN KEY (match_id, game_id)
    REFERENCES multiplayer_matches(id, game_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT multiplayer_match_options_option_game_fk
    FOREIGN KEY (option_id, game_id)
    REFERENCES multiplayer_game_options(id, game_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS multiplayer_match_options_option_idx
  ON multiplayer_match_options (option_id);

INSERT INTO multiplayer_game_options (game_id, code, display_name, sort_order)
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
    is_active = true;

INSERT INTO multiplayer_game_options (game_id, code, display_name, sort_order)
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
    is_active = true;

INSERT INTO multiplayer_match_options (match_id, game_id, option_id)
SELECT
  m.id,
  m.game_id,
  go.id
FROM multiplayer_matches m
JOIN multiplayer_games g ON g.id = m.game_id
JOIN multiplayer_ticket_to_ride_matches mtm ON mtm.match_id = m.id
JOIN ticket_to_ride_variants v ON v.id = mtm.variant_id
JOIN multiplayer_game_options go
  ON go.game_id = m.game_id
 AND go.code = v.code
WHERE g.code = 'ticket_to_ride'
ON CONFLICT (match_id) DO UPDATE
  SET option_id = EXCLUDED.option_id,
      game_id = EXCLUDED.game_id;
