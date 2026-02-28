CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  played_on date NOT NULL,
  player_a_id uuid NOT NULL REFERENCES players(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  player_b_id uuid NOT NULL REFERENCES players(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  score_a integer NOT NULL CHECK (score_a >= 0),
  score_b integer NOT NULL CHECK (score_b >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT matches_players_distinct CHECK (player_a_id <> player_b_id)
);

CREATE INDEX matches_played_on_desc_idx ON matches (played_on DESC);
CREATE INDEX matches_game_played_on_desc_idx ON matches (game_id, played_on DESC);
CREATE INDEX matches_player_a_idx ON matches (player_a_id);
CREATE INDEX matches_player_b_idx ON matches (player_b_id);
