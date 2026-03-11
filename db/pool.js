const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

let connectionString = process.env.DATABASE_URL;
// Remove any query params like ?sslmode=require that might override our explicit ssl config
if (connectionString && connectionString.includes('?')) {
  connectionString = connectionString.split('?')[0];
}

const poolConfig = {
  connectionString: connectionString,
};

// Logging connection source for debugging (safe)
if (process.env.DATABASE_URL) {
  const maskedUrl = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@');
  console.log(`🔌 Connecting to database via DATABASE_URL: ${maskedUrl.split('@')[1]}`);
} else {
  console.log(`🔌 Connecting to database via individual components`);
}

// Ensure SSL is explicitly configured for external connections
if (process.env.NODE_ENV === 'production' || 
   (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost'))) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected pool error', err);
  process.exit(-1);
});

module.exports = pool;
