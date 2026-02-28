CREATE OR REPLACE FUNCTION ticket_to_ride_trains_counts_valid(counts jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  key_text text;
  val_text text;
  allowed_keys text[] := ARRAY['1','2','3','4','5','6','7','8','9'];
BEGIN
  IF counts IS NULL THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(counts) <> 'object' THEN
    RETURN false;
  END IF;

  IF NOT (counts ?& allowed_keys) THEN
    RETURN false;
  END IF;

  FOR key_text, val_text IN SELECT je.key, je.value FROM jsonb_each_text(counts) AS je(key, value) LOOP
    IF NOT (key_text = ANY(allowed_keys)) THEN
      RETURN false;
    END IF;
    IF val_text !~ '^[0-9]+$' THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

CREATE TABLE IF NOT EXISTS ticket_to_ride_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  played_on date NOT NULL,
  variant_id uuid NOT NULL REFERENCES ticket_to_ride_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_to_ride_match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES ticket_to_ride_matches(id) ON UPDATE CASCADE ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  tickets_points integer NOT NULL,
  bonus_points integer NOT NULL CHECK (bonus_points >= 0),
  trains_counts jsonb NOT NULL,
  trains_points integer NOT NULL CHECK (trains_points >= 0),
  total_points integer NOT NULL,
  place integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ticket_to_ride_match_players_unique UNIQUE (match_id, player_id),
  CONSTRAINT ticket_to_ride_match_players_trains_counts_check CHECK (
    ticket_to_ride_trains_counts_valid(trains_counts)
  )
);

DO $$
BEGIN
  IF to_regclass('public.ticket_to_ride_match_players') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'ticket_to_ride_match_players_trains_counts_check'
    ) THEN
      ALTER TABLE ticket_to_ride_match_players
        DROP CONSTRAINT ticket_to_ride_match_players_trains_counts_check;
    END IF;

    ALTER TABLE ticket_to_ride_match_players
      ADD CONSTRAINT ticket_to_ride_match_players_trains_counts_check
      CHECK (ticket_to_ride_trains_counts_valid(trains_counts));
  END IF;
END $$;
