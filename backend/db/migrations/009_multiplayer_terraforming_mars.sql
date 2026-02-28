CREATE TABLE IF NOT EXISTS multiplayer_terraforming_mars_player_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_player_id uuid NOT NULL UNIQUE REFERENCES multiplayer_match_players(id) ON UPDATE CASCADE ON DELETE CASCADE,
  titles_count integer NOT NULL DEFAULT 0 CHECK (titles_count >= 0),
  awards_first_count integer NOT NULL DEFAULT 0 CHECK (awards_first_count >= 0),
  awards_second_count integer NOT NULL DEFAULT 0 CHECK (awards_second_count >= 0),
  cities_points integer NOT NULL DEFAULT 0 CHECK (cities_points >= 0),
  forests_points integer NOT NULL DEFAULT 0 CHECK (forests_points >= 0),
  cards_points integer NOT NULL DEFAULT 0 CHECK (cards_points >= 0),
  tr_points integer NOT NULL DEFAULT 0 CHECK (tr_points >= 0),
  titles_points integer NOT NULL DEFAULT 0 CHECK (titles_points >= 0),
  awards_first_points integer NOT NULL DEFAULT 0 CHECK (awards_first_points >= 0),
  awards_second_points integer NOT NULL DEFAULT 0 CHECK (awards_second_points >= 0)
);
