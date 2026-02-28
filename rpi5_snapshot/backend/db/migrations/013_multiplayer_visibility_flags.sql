ALTER TABLE multiplayer_games
  ADD COLUMN IF NOT EXISTS visible_in_one_vs_one boolean,
  ADD COLUMN IF NOT EXISTS visible_in_multiplayer boolean;

UPDATE multiplayer_games
SET visible_in_one_vs_one = CASE
  WHEN is_active = true
    AND scoring_type = 'MANUAL_POINTS'
    AND min_players = 2
    AND max_players = 2
  THEN true
  ELSE false
END
WHERE visible_in_one_vs_one IS NULL;

UPDATE multiplayer_games
SET visible_in_multiplayer = CASE
  WHEN is_active = true AND max_players >= 3 THEN true
  ELSE false
END
WHERE visible_in_multiplayer IS NULL;

ALTER TABLE multiplayer_games
  ALTER COLUMN visible_in_one_vs_one SET NOT NULL,
  ALTER COLUMN visible_in_multiplayer SET NOT NULL,
  ALTER COLUMN visible_in_one_vs_one SET DEFAULT false,
  ALTER COLUMN visible_in_multiplayer SET DEFAULT true;

UPDATE multiplayer_games
SET is_active = (visible_in_one_vs_one OR visible_in_multiplayer)
WHERE is_active IS DISTINCT FROM (visible_in_one_vs_one OR visible_in_multiplayer);
