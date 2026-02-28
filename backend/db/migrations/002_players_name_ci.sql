CREATE UNIQUE INDEX IF NOT EXISTS players_name_lower_unique_idx
  ON players (lower(name));
