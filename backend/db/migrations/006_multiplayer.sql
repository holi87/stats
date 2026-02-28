CREATE TABLE IF NOT EXISTS multiplayer_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  min_players integer NOT NULL CHECK (min_players >= 2 AND min_players <= 5),
  max_players integer NOT NULL CHECK (max_players >= 2 AND max_players <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplayer_games_min_max_check CHECK (min_players <= max_players)
);

CREATE TABLE IF NOT EXISTS multiplayer_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES multiplayer_games(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  played_on date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS multiplayer_match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES multiplayer_matches(id) ON UPDATE CASCADE ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  points integer NOT NULL CHECK (points >= 0),
  place integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplayer_match_players_unique UNIQUE (match_id, player_id),
  CONSTRAINT multiplayer_match_players_place_check CHECK (
    place IS NULL OR (place >= 1 AND place <= 5)
  )
);

INSERT INTO multiplayer_games (code, name, min_players, max_players)
VALUES
  ('terraforming_mars', 'Terraformacja Marsa', 2, 5),
  ('carcassonne', 'Carcassonne', 2, 5),
  ('catan', 'Catan', 3, 4),
  ('azul', 'Azul', 2, 4),
  ('splendor', 'Splendor', 2, 4)
ON CONFLICT (code) DO NOTHING;
