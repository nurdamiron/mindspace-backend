const { Client } = require('pg');

async function testConnection() {
  const client = new Client({
    host: 'alashed-db.cde42ec8m1u7.eu-north-1.rds.amazonaws.com',
    port: 5432,
    user: 'postgres',
    password: 'securepassword', // Or I might not know this. Wait, maybe alashed_user?
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  try {
    const clientAlashed = new Client({
        host: 'alashed-db.cde42ec8m1u7.eu-north-1.rds.amazonaws.com',
        port: 5432,
        user: 'alashed_user',
        password: 'alashed01',
        database: 'postgres',
        ssl: { rejectUnauthorized: false }
    });
    await clientAlashed.connect();
    console.log("✅ alashed_user connected successfully!");
    const res = await clientAlashed.query("SELECT datname FROM pg_database;");
    console.log("Databases:", res.rows.map(r => r.datname));
    
    const resUsers = await clientAlashed.query("SELECT usename FROM pg_user;");
    console.log("Users:", resUsers.rows.map(r => r.usename));
    
    await clientAlashed.end();
  } catch(e) {
      console.error("❌ alashed_user failed", e.message);
  }
}
testConnection();
