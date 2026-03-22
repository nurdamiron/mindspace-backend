// express — HTTP сервер фреймворкі
const express = require('express');
// cors — басқа домендерден сұраныстарға рұқсат береді
const cors = require('cors');
// express-rate-limit — сұраныс санын шектейді (DDoS қорғанысы)
const rateLimit = require('express-rate-limit');
// cookie-parser — HTTP cookie-ларды оқиды
const cookieParser = require('cookie-parser');

// Маршрут модульдері — әр рол үшін бөлек
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const psychologistRoutes = require('./routes/psychologist');
const adminRoutes = require('./routes/admin');

const app = express();

// Vercel / nginx прокси артындағы нақты клиент IP-ін алу үшін
app.set('trust proxy', 1);

// Жалпы rate limiter — 15 минутта максимум 100 сұраныс (тестте шексіз)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Рұқсат берілген фронтенд домендері (үтір арқылы бөлінген тізім)
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',')
  : ['http://localhost:5173'];

// CORS — тек рұқсат берілген домендерден сұраныстарға жол береді
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

// JSON денелерін және cookie-ларды талдау
app.use(express.json());
app.use(cookieParser());

// Барлық /api маршруттарына rate limit қолдану
app.use('/api', generalLimiter);

// Маршруттарды тіркеу
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/psychologist', psychologistRoutes);
app.use('/api/admin', adminRoutes);

// Сервер тіршілігін тексеру эндпоинті
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = app;
