// dotenv — .env файлынан орта айнымалыларын жүктейді
require('dotenv').config();

// app — Express қосымшасы
const app = require('./app');
// initSchema — дерекқор кестелерін инициализациялайды
const initSchema = require('./db/schema');

// Порт: орта айнымалысынан немесе әдепкі 3001
const PORT = process.env.PORT || 3001;

// Сервер іске қосу: алдымен схема инициализациясы, содан кейін тыңдау
async function start() {
  try {
    await initSchema();
    app.listen(PORT, () => {
      console.log(`Сервер іске қосылды: http://localhost:${PORT}`);
      console.log(`Тіршілік тексеру: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('Серверді іске қосу сәтсіз аяқталды:', err);
    process.exit(1);
  }
}

start();
