ALTER TABLE multiplayer_games
  DROP CONSTRAINT IF EXISTS multiplayer_games_scoring_type_check;

ALTER TABLE multiplayer_games
  ADD CONSTRAINT multiplayer_games_scoring_type_check
  CHECK (scoring_type IN ('MANUAL_POINTS', 'TTR_CALCULATOR', 'TM_CALCULATOR', 'CUSTOM_CALCULATOR'));

CREATE TABLE IF NOT EXISTS multiplayer_custom_scoring_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES multiplayer_games(id) ON UPDATE CASCADE ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  description text,
  points_per_unit integer NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplayer_custom_scoring_fields_game_code_unique UNIQUE (game_id, code)
);

CREATE INDEX IF NOT EXISTS multiplayer_custom_scoring_fields_game_sort_idx
  ON multiplayer_custom_scoring_fields (game_id, is_active DESC, sort_order ASC, label ASC);

CREATE TABLE IF NOT EXISTS multiplayer_custom_match_player_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_player_id uuid NOT NULL REFERENCES multiplayer_match_players(id) ON UPDATE CASCADE ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES multiplayer_custom_scoring_fields(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  value integer NOT NULL,
  points integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT multiplayer_custom_match_player_values_unique UNIQUE (match_player_id, field_id)
);

CREATE INDEX IF NOT EXISTS multiplayer_custom_match_player_values_field_idx
  ON multiplayer_custom_match_player_values (field_id);
