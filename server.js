require('dotenv').config();

const app = require('./app');
const initSchema = require('./db/schema');

const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await initSchema();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
