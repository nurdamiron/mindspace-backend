const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

module.exports = async () => {
  const pool = require('../../db/pool');
  try {
    await pool.end();
    console.log('\n[globalTeardown] DB pool closed');
  } catch (err) {
    // pool may already be closed
  }
};
