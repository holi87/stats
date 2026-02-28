ALTER TABLE multiplayer_games
  DROP CONSTRAINT IF EXISTS multiplayer_games_min_players_check,
  DROP CONSTRAINT IF EXISTS multiplayer_games_max_players_check,
  DROP CONSTRAINT IF EXISTS multiplayer_games_min_max_check;

ALTER TABLE multiplayer_games
  ADD CONSTRAINT multiplayer_games_min_players_check CHECK (min_players >= 1),
  ADD CONSTRAINT multiplayer_games_max_players_check CHECK (max_players >= 1),
  ADD CONSTRAINT multiplayer_games_min_max_check CHECK (min_players <= max_players);

ALTER TABLE multiplayer_match_players
  DROP CONSTRAINT IF EXISTS multiplayer_match_players_place_check;

ALTER TABLE multiplayer_match_players
  ADD CONSTRAINT multiplayer_match_players_place_check CHECK (
    place IS NULL OR place >= 1
  );

UPDATE multiplayer_games
SET visible_in_one_vs_one = false
WHERE visible_in_one_vs_one = true;
