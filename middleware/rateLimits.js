const rateLimit = require('express-rate-limit');

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: process.env.NODE_ENV === 'test' ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Слишком много запросов к AI. Попробуйте через час.' },
});

module.exports = { aiLimiter };
