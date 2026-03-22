// pg — PostgreSQL дерекқорымен жұмыс жасайтын Node.js драйвері
const { Pool } = require('pg');
// dotenv — DATABASE_URL орта айнымалысын жүктейді
require('dotenv').config();

// Байланыс жолынан SSL параметрін алып тастау — пул конфигурациясында бөлек беріледі
let connectionString = process.env.DATABASE_URL;
if (connectionString && connectionString.includes('?')) {
  connectionString = connectionString.split('?')[0];
}

// Пул конфигурациясы — байланыс жолы негізінде
const poolConfig = { connectionString };

// Дерекқор байланысын тіркеу (пароль жасырылған түрде)
if (process.env.DATABASE_URL) {
  const maskedUrl = process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@');
  console.log('Дерекқорға қосылу:', maskedUrl.split('@')[1]);
} else {
  console.log('Дерекқорға жеке параметрлер арқылы қосылу');
}

// Сыртқы RDS байланысы үшін SSL міндетті (localhost-тан басқа)
if (process.env.NODE_ENV === 'production' ||
   (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost'))) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

// Байланыс пулын жасау — бірнеше қосылымды параллель басқарады
const pool = new Pool(poolConfig);

// Күтпеген пул қатесі болса — процессті тоқтату
pool.on('error', (err) => {
  console.error('Пул қатесі:', err);
  process.exit(-1);
});

module.exports = pool;
