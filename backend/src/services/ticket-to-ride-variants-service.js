const { getPool } = require('../db');

function mapVariant(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
  };
}

async function listTicketToRideVariants() {
  const pool = getPool();
  const result = await pool.query(
    'SELECT id, code, name FROM ticket_to_ride_variants WHERE is_active = true ORDER BY name ASC'
  );
  return result.rows.map(mapVariant);
}

module.exports = {
  listTicketToRideVariants,
};
