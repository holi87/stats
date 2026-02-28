DO $$
BEGIN
  IF to_regclass('public.multiplayer_games') IS NULL THEN
    CREATE TABLE multiplayer_games (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code text NOT NULL UNIQUE,
      display_name text,
      scoring_type text NOT NULL,
      min_players integer NOT NULL CHECK (min_players >= 2 AND min_players <= 5),
      max_players integer NOT NULL CHECK (max_players >= 2 AND max_players <= 5),
      is_active boolean DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT multiplayer_games_min_max_check CHECK (min_players <= max_players),
      CONSTRAINT multiplayer_games_scoring_type_check
        CHECK (scoring_type IN ('MANUAL_POINTS', 'TTR_CALCULATOR', 'TM_CALCULATOR'))
    );
  ELSE
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_games' AND column_name = 'name'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_games' AND column_name = 'display_name'
    ) THEN
      ALTER TABLE multiplayer_games RENAME COLUMN name TO display_name;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_games' AND column_name = 'name'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_games' AND column_name = 'display_name'
    ) THEN
      UPDATE multiplayer_games
      SET display_name = COALESCE(display_name, name)
      WHERE name IS NOT NULL;
      ALTER TABLE multiplayer_games DROP COLUMN IF EXISTS name;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_games' AND column_name = 'display_name'
    ) THEN
      ALTER TABLE multiplayer_games ADD COLUMN display_name text;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_games' AND column_name = 'scoring_type'
    ) THEN
      ALTER TABLE multiplayer_games ADD COLUMN scoring_type text;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_games' AND column_name = 'is_active'
    ) THEN
      ALTER TABLE multiplayer_games ADD COLUMN is_active boolean DEFAULT true;
    END IF;
  END IF;
END $$;

ALTER TABLE multiplayer_games DROP CONSTRAINT IF EXISTS multiplayer_games_name_key;
ALTER TABLE multiplayer_games DROP CONSTRAINT IF EXISTS multiplayer_games_display_name_key;

UPDATE multiplayer_games
SET display_name = COALESCE(display_name, code)
WHERE display_name IS NULL;

UPDATE multiplayer_games
SET is_active = true
WHERE is_active IS NULL;

UPDATE multiplayer_games
SET scoring_type = CASE
  WHEN code = 'terraforming_mars' THEN 'TM_CALCULATOR'
  WHEN code = 'ticket_to_ride' THEN 'TTR_CALCULATOR'
  ELSE 'MANUAL_POINTS'
END
WHERE scoring_type IS NULL;

ALTER TABLE multiplayer_games
  ALTER COLUMN scoring_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'multiplayer_games_scoring_type_check'
  ) THEN
    ALTER TABLE multiplayer_games
      ADD CONSTRAINT multiplayer_games_scoring_type_check
      CHECK (scoring_type IN ('MANUAL_POINTS', 'TTR_CALCULATOR', 'TM_CALCULATOR'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS multiplayer_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES multiplayer_games(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  played_on date NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS multiplayer_matches_game_played_on_desc_idx
  ON multiplayer_matches (game_id, played_on DESC);

CREATE INDEX IF NOT EXISTS multiplayer_matches_played_on_desc_idx
  ON multiplayer_matches (played_on DESC);

DO $$
BEGIN
  IF to_regclass('public.multiplayer_match_players') IS NULL THEN
    CREATE TABLE multiplayer_match_players (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      match_id uuid NOT NULL REFERENCES multiplayer_matches(id) ON UPDATE CASCADE ON DELETE CASCADE,
      player_id uuid NOT NULL REFERENCES players(id) ON UPDATE CASCADE ON DELETE RESTRICT,
      total_points integer NOT NULL,
      place integer,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT multiplayer_match_players_unique UNIQUE (match_id, player_id)
    );
  ELSE
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_match_players' AND column_name = 'points'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_match_players' AND column_name = 'total_points'
    ) THEN
      ALTER TABLE multiplayer_match_players RENAME COLUMN points TO total_points;
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_match_players' AND column_name = 'points'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_match_players' AND column_name = 'total_points'
    ) THEN
      UPDATE multiplayer_match_players
      SET total_points = COALESCE(total_points, points)
      WHERE points IS NOT NULL;
      ALTER TABLE multiplayer_match_players DROP COLUMN IF EXISTS points;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'multiplayer_match_players' AND column_name = 'total_points'
    ) THEN
      ALTER TABLE multiplayer_match_players ADD COLUMN total_points integer;
    END IF;
  END IF;
END $$;

UPDATE multiplayer_match_players
SET total_points = 0
WHERE total_points IS NULL;

ALTER TABLE multiplayer_match_players
  ALTER COLUMN total_points SET NOT NULL;

CREATE INDEX IF NOT EXISTS multiplayer_match_players_player_id_idx
  ON multiplayer_match_players (player_id);

CREATE INDEX IF NOT EXISTS multiplayer_match_players_match_id_idx
  ON multiplayer_match_players (match_id);
