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

CREATE TABLE IF NOT EXISTS ticket_to_ride_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ticket_to_ride_variants (code, name)
VALUES
  ('germany', 'Niemcy'),
  ('europe', 'Europa'),
  ('poland', 'Polska'),
  ('great_lakes', 'Wielkie Jeziora'),
  ('world', 'Świat'),
  ('nordic_countries', 'Kraje Nordyckie'),
  ('japan', 'Japonia'),
  ('italy', 'Włochy'),
  ('london', 'Londyn'),
  ('africa', 'Afryka')
ON CONFLICT (code) DO UPDATE
  SET name = EXCLUDED.name
  WHERE ticket_to_ride_variants.name IS DISTINCT FROM EXCLUDED.name;

CREATE TABLE IF NOT EXISTS multiplayer_ticket_to_ride_matches (
  match_id uuid PRIMARY KEY REFERENCES multiplayer_matches(id) ON UPDATE CASCADE ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES ticket_to_ride_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS multiplayer_ticket_to_ride_player_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_player_id uuid NOT NULL UNIQUE REFERENCES multiplayer_match_players(id) ON UPDATE CASCADE ON DELETE CASCADE,
  tickets_points integer NOT NULL,
  bonus_points integer NOT NULL CHECK (bonus_points >= 0),
  trains_counts jsonb NOT NULL,
  trains_points integer NOT NULL CHECK (trains_points >= 0),
  CONSTRAINT multiplayer_ticket_to_ride_player_details_trains_counts_check
    CHECK (ticket_to_ride_trains_counts_valid(trains_counts))
);
