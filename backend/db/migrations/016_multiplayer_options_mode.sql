ALTER TABLE multiplayer_games
  ADD COLUMN IF NOT EXISTS options_exclusive boolean;

DO $$
BEGIN
  IF to_regclass('public.multiplayer_match_options') IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'multiplayer_match_options_pkey'
      AND conrelid = 'public.multiplayer_match_options'::regclass
  ) THEN
    ALTER TABLE multiplayer_match_options
      DROP CONSTRAINT multiplayer_match_options_pkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'multiplayer_match_options_pkey'
      AND conrelid = 'public.multiplayer_match_options'::regclass
  ) THEN
    ALTER TABLE multiplayer_match_options
      ADD CONSTRAINT multiplayer_match_options_pkey PRIMARY KEY (match_id, option_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS multiplayer_match_options_match_idx
  ON multiplayer_match_options (match_id);
