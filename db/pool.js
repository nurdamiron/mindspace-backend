const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const poolConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'mental_health_platform',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    };

// Logging connection source for debugging (safe)
if (process.env.DATABASE_URL) {
  const maskedUrl = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@');
  console.log(`🔌 Connecting to database via DATABASE_URL: ${maskedUrl.split('@')[1]}`);
} else {
  console.log(`🔌 Connecting to database via individual components (Host: ${poolConfig.host})`);
}

// Add SSL for production/external connections
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('Unexpected pool error', err);
  process.exit(-1);
});

module.exports = pool;
