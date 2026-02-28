const express = require('express');
const { getPool } = require('../db');

const router = express.Router();

router.get('/multiplayer/ticket-to-ride/variants', async (_req, res, next) => {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, code, name
       FROM ticket_to_ride_variants
       WHERE is_active = true
       ORDER BY name ASC`
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
