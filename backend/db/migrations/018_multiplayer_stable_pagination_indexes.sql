CREATE INDEX IF NOT EXISTS multiplayer_matches_played_on_id_desc_idx
  ON multiplayer_matches (played_on DESC, id DESC);

CREATE INDEX IF NOT EXISTS multiplayer_matches_game_played_on_id_desc_idx
  ON multiplayer_matches (game_id, played_on DESC, id DESC);
