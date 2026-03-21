const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.test') });

module.exports = async () => {
  const initSchema = require('../../db/schema');
  try {
    await initSchema();
    console.log('\n[globalSetup] Test DB schema initialized');
  } catch (err) {
    console.error('[globalSetup] Failed to init schema:', err.message);
    throw err;
  }
};
