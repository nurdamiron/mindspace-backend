// jsonwebtoken — JWT токендерін жасау және тексеру
const jwt = require('jsonwebtoken');
// dotenv — JWT_SECRET орта айнымалысын жүктейді
require('dotenv').config();

// Қол қою кілті — орта айнымалысынан немесе запасной мән
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// authenticate — Authorization: Bearer <token> тақырыбын тексереді, req.user-ге жазады
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Авторизация қажет' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Жарамсыз токен' });
  }
}

// authorize — рөл тізімін тексереді, сәйкес болмаса 403 қайтарады
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Авторизация қажет' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Қатынас тыйым салынған' });
    }
    next();
  };
}

module.exports = { authenticate, authorize, JWT_SECRET };
