ALTER TABLE games
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS games_is_active_name_idx
  ON games (is_active, name);
