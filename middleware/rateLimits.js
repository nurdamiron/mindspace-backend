// express-rate-limit — белгілі уақыт ішінде сұраныс санын шектейді
const rateLimit = require('express-rate-limit');

// aiLimiter — ИИ эндпоинттеріне 1 сағатта максимум 10 сұраныс (тестте шексіз)
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'ИИ-ға тым көп сұраныс. Бір сағаттан кейін қайталап көріңіз.' },
});

module.exports = { aiLimiter };
