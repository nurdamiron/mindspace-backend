const pool = require('../../db/pool');

/**
 * Truncate all tables in correct FK order and reset identity sequences.
 * Call in beforeEach to guarantee a clean slate per test.
 */
async function clearDb() {
  await pool.query(`
    TRUNCATE TABLE
      chat_messages,
      session_notes,
      surveys,
      appointments,
      check_ins,
      time_slots,
      users
    RESTART IDENTITY CASCADE
  `);
}

module.exports = { clearDb };
