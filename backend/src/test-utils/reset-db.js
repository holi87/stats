async function resetDatabase(pool) {
  await pool.query(`TRUNCATE TABLE
    multiplayer_ticket_to_ride_player_details,
    multiplayer_ticket_to_ride_matches,
    multiplayer_terraforming_mars_player_details,
    multiplayer_match_players,
    multiplayer_matches,
    ticket_to_ride_match_players,
    ticket_to_ride_matches,
    matches,
    legacy_migration_map,
    players
    RESTART IDENTITY CASCADE`);
}

module.exports = {
  resetDatabase,
};
