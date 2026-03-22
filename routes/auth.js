// express — маршрутизатор жасау үшін
const express = require('express');
// bcryptjs — құпия сөзді хэштеу және тексеру үшін
const bcrypt = require('bcryptjs');
// jsonwebtoken — access және refresh токендерін жасау үшін
const jwt = require('jsonwebtoken');
// express-rate-limit — кіру эндпоинттерін шабуылдан қорғау
const rateLimit = require('express-rate-limit');
// pool — дерекқор сұраныстары үшін
const pool = require('../db/pool');
// authenticate, JWT_SECRET — токен тексеру middleware және кілт
const { authenticate, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// Refresh токен кілті — орта айнымалысынан
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'mental-health-platform-refresh-secret-2024';

// authLimiter — 15 минутта максимум 10 кіру әрекеті
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 10,
  message: { error: 'Тым көп кіру әрекеті, кейінірек қайталап көріңіз' },
});

// POST /api/auth/register — студенттің өз бетінше тіркелуі
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, faculty, course } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Аты, email және құпия сөз міндетті' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Құпия сөз кемінде 6 символдан тұруы керек' });
    }

    // Email бұрын тіркелген-тіркелмегенін тексеру
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Бұл email бұрын тіркелген' });
    }

    // Құпия сөзді хэштеу және жаңа студент жасау
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, name, faculty, course)
       VALUES ($1, $2, 'student', $3, $4, $5)
       RETURNING id, email, role, name, faculty, course`,
      [email, hash, name, faculty || null, course || null]
    );
    const user = result.rows[0];

    // 1 сағаттық access токен жасау
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 7 күндік refresh токен жасау
    const refreshToken = jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn: '7d' });

    // Refresh токенді httpOnly cookie-ға сақтау
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Тіркелу қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/auth/login — жүйеге кіру
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email және құпия сөз міндетті' });
    }

    // Пайдаланушыны дерекқордан іздеу
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Email немесе құпия сөз қате' });
    }

    // Құпия сөзді хэшпен салыстыру
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Email немесе құпия сөз қате' });
    }

    // 1 сағаттық access токен
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // 7 күндік refresh токен
    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Refresh токенді httpOnly cookie-ға сақтау
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        faculty: user.faculty,
        course: user.course,
        specialization: user.specialization,
      },
    });
  } catch (err) {
    console.error('Кіру қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/auth/me — ағымдағы пайдаланушы деректерін алу
router.get('/me', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, role, name, faculty, course, gender, age, specialization, languages, experience_years, bio, avatar FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Пайдаланушы табылмады' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('/me қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/auth/refresh — access токенді жаңарту (refresh cookie арқылы)
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh токен жоқ' });
    }

    // Refresh токенді тексеру
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    // Пайдаланушы дерекқорда бар-жоғын тексеру
    const result = await pool.query(
      'SELECT id, email, role, name FROM users WHERE id = $1', [decoded.id]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Пайдаланушы табылмады' });
    }

    // Жаңа 1 сағаттық access токен жасау
    const newToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token: newToken });
  } catch (err) {
    console.error('Токен жаңарту қатесі:', err);
    res.status(401).json({ error: 'Жарамсыз немесе мерзімі өткен refresh токен' });
  }
});

// PATCH /api/auth/password — өз құпия сөзін өзгерту
router.patch('/password', authenticate, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Ағымдағы және жаңа құпия сөзді енгізіңіз' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Жаңа құпия сөз кемінде 6 символдан тұруы керек' });
    }

    // Ағымдағы құпия сөзді тексеру
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1', [req.user.id]
    );
    const isValid = await bcrypt.compare(current_password, result.rows[0].password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Ағымдағы құпия сөз қате' });
    }

    // Жаңа хэшті сақтау
    const hash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Құпия сөз өзгертілді' });
  } catch (err) {
    console.error('Құпия сөз өзгерту қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/auth/logout — шығу (refresh cookie-ді жою)
router.post('/logout', (req, res) => {
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  res.json({ message: 'Жүйеден шықтыңыз' });
});

module.exports = router;
