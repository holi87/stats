ALTER TABLE multiplayer_games
  ADD COLUMN IF NOT EXISTS calculator_button_label text,
  ADD COLUMN IF NOT EXISTS calculator_url text;

