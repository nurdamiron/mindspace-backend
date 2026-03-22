// express — маршрутизатор жасау үшін
const express = require('express');
// pool — дерекқор сұраныстары үшін
const pool = require('../db/pool');
// authenticate, authorize — токен тексеру және рөл шектеу middleware
const { authenticate, authorize } = require('../middleware/auth');
// aiLimiter — ИИ эндпоинттеріне сұраныс санын шектейді
const { aiLimiter } = require('../middleware/rateLimits');
// OpenAI — Perplexity API-мен жұмыс жасау үшін (OpenAI-совместимый)
const { OpenAI } = require('openai');

const router = express.Router();

// Барлық маршруттар тек студент рөліне ғана қол жетімді
router.use(authenticate, authorize('student'));

// GET /api/student/check-ins — студенттің check-in тарихын алу
router.get('/check-ins', async (req, res) => {
  try {
    // days параметрі бойынша соңғы N күндегі жазбаларды қайтару
    const { days = 30 } = req.query;
    const result = await pool.query(
      `SELECT * FROM check_ins WHERE student_id = $1 AND date >= CURRENT_DATE - $2::INTEGER
       ORDER BY date DESC`,
      [req.user.id, days]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Check-in алу қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/student/check-ins — жаңа check-in жазбасын жасау
router.post('/check-ins', async (req, res) => {
  try {
    const { mood, stress, sleep, energy, productivity, notes } = req.body;

    // Барлық өрістер 1–5 аралығында екенін тексеру
    const fields = { mood, stress, sleep, energy, productivity };
    for (const [key, val] of Object.entries(fields)) {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1 || n > 5) {
        return res.status(400).json({ error: `${key} мәні 1-ден 5-ке дейін болуы керек` });
      }
    }

    // Бүгін бұрын check-in жазылған-жазылмағанын тексеру
    const existing = await pool.query(
      'SELECT id FROM check_ins WHERE student_id = $1 AND date = CURRENT_DATE',
      [req.user.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Бүгін check-in бұрын толтырылған' });
    }

    const result = await pool.query(
      `INSERT INTO check_ins (student_id, date, mood, stress, sleep, energy, productivity, notes)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, mood, stress, sleep, energy, productivity, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Check-in жасау қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/student/stats — студенттің жеке статистикасы
router.get('/stats', async (req, res) => {
  try {
    // Соңғы 30 күндегі check-in деректері
    const checkIns = await pool.query(
      `SELECT date, mood, stress, sleep, energy, productivity FROM check_ins
       WHERE student_id = $1 AND date >= CURRENT_DATE - 30 ORDER BY date ASC`,
      [req.user.id]
    );

    // Барлық сеанстар статистикасы
    const appointments = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'completed') as completed,
              COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled
       FROM appointments WHERE student_id = $1`,
      [req.user.id]
    );

    // Соңғы 7 күндегі орташа көрсеткіштер
    const avgResult = await pool.query(
      `SELECT
        ROUND(AVG(mood)::numeric, 1) as avg_mood,
        ROUND(AVG(stress)::numeric, 1) as avg_stress,
        ROUND(AVG(sleep)::numeric, 1) as avg_sleep,
        ROUND(AVG(energy)::numeric, 1) as avg_energy,
        ROUND(AVG(productivity)::numeric, 1) as avg_productivity
       FROM check_ins WHERE student_id = $1 AND date >= CURRENT_DATE - 7`,
      [req.user.id]
    );

    res.json({
      checkIns: checkIns.rows,
      appointments: appointments.rows[0],
      weeklyAverages: avgResult.rows[0],
    });
  } catch (err) {
    console.error('Статистика қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/student/psychologists — психологтар каталогы
router.get('/psychologists', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, specialization, languages, experience_years, bio, avatar, gender
       FROM users WHERE role = 'psychologist' ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Психологтар тізімі қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/student/psychologists/:id/slots — психологтың бос слоттары
router.get('/psychologists/:id/slots', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM time_slots
       WHERE psychologist_id = $1 AND is_available = true AND date >= CURRENT_DATE
       ORDER BY date, start_time`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Слоттар алу қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/student/appointments — жаңа сеанс жазылу
router.post('/appointments', async (req, res) => {
  try {
    const { psychologist_id, slot_id, reason, format } = req.body;

    // Слоттың бос екенін тексеру
    const slot = await pool.query(
      'SELECT * FROM time_slots WHERE id = $1 AND is_available = true',
      [slot_id]
    );
    if (slot.rows.length === 0) {
      return res.status(400).json({ error: 'Слот бос емес немесе жоқ' });
    }

    // Слотты бос емес деп белгілеу
    await pool.query('UPDATE time_slots SET is_available = false WHERE id = $1', [slot_id]);

    const result = await pool.query(
      `INSERT INTO appointments (student_id, psychologist_id, slot_id, status, reason, format)
       VALUES ($1, $2, $3, 'scheduled', $4, $5) RETURNING *`,
      [req.user.id, psychologist_id, slot_id, reason || null, format || 'offline']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Сеанс жазылу қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/student/appointments — студенттің барлық сеанстары
router.get('/appointments', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, ts.date, ts.start_time, ts.end_time,
              u.name as psychologist_name, u.specialization
       FROM appointments a
       JOIN time_slots ts ON a.slot_id = ts.id
       JOIN users u ON a.psychologist_id = u.id
       WHERE a.student_id = $1
       ORDER BY ts.date DESC, ts.start_time DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Сеанстар алу қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/student/surveys — скрининг сауалнамасын жіберу
router.post('/surveys', async (req, res) => {
  try {
    const { type, answers } = req.body;
    // Жауаптар қосындысы арқылы қауіп деңгейін есептеу
    const values = Object.values(answers);
    const score = values.reduce((a, b) => a + b, 0);
    const risk_level = score <= 10 ? 'low' : score <= 16 ? 'moderate' : 'high';

    const result = await pool.query(
      `INSERT INTO surveys (student_id, type, answers, score, risk_level)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, type, JSON.stringify(answers), score, risk_level]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Сауалнама жіберу қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// PATCH /api/student/appointments/:id/cancel — сеансты болдырмау
router.patch('/appointments/:id/cancel', async (req, res) => {
  try {
    // Сеанстың осы студентке тиесілі екенін тексеру
    const appt = await pool.query(
      `SELECT a.id, a.slot_id, a.status FROM appointments a
       WHERE a.id = $1 AND a.student_id = $2`,
      [req.params.id, req.user.id]
    );
    if (appt.rows.length === 0) return res.status(404).json({ error: 'Жазба табылмады' });
    if (appt.rows[0].status !== 'scheduled') {
      return res.status(400).json({ error: 'Тек жоспарланған жазбаларды болдырмауға болады' });
    }

    // Сеансты болдырмау және слотты босату
    await pool.query('UPDATE appointments SET status = $1 WHERE id = $2', ['cancelled', req.params.id]);
    await pool.query('UPDATE time_slots SET is_available = true WHERE id = $1', [appt.rows[0].slot_id]);
    res.json({ message: 'Жазба болдырылмады' });
  } catch (err) {
    console.error('Болдырмау қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/student/appointments/:id/feedback — сеансқа баға беру
router.post('/appointments/:id/feedback', async (req, res) => {
  try {
    const { feedback_score, feedback_text } = req.body;
    const result = await pool.query(
      `UPDATE appointments SET feedback_score = $1, feedback_text = $2
       WHERE id = $3 AND student_id = $4 RETURNING *`,
      [feedback_score, feedback_text, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Жазба табылмады' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Баға беру қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/student/chat — чат тарихын алу
router.get('/chat', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM chat_messages WHERE student_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/student/ai-chat — ИИ-ға хабарлама жіберу және жауап алу
router.post('/ai-chat', aiLimiter, async (req, res) => {
  try {
    const { content: message } = req.body;

    // Чат тарихын жіберер алдын алу (қайталауды болдырмау үшін)
    const historyResult = await pool.query(
      'SELECT role, content FROM chat_messages WHERE student_id = $1 ORDER BY created_at ASC LIMIT 20',
      [req.user.id]
    );

    // Студент хабарламасын дерекқорға сақтау
    await pool.query(
      'INSERT INTO chat_messages (student_id, role, content) VALUES ($1, $2, $3)',
      [req.user.id, 'user', message]
    );

    // Жүйелік нұсқаулық — ИИ мінез-құлқын анықтайды
    const systemPrompt = `Ты — эмпатичный виртуальный помощник платформы психологической поддержки студентов MindSpace.
Твоя цель: выслушать студента, поддержать его, помочь справиться со стрессом, дать базовые советы по саморегуляции (дыхание, режим дня, заземление).
Правила:
1. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО ставить диагнозы, назначать медикаменты или выступать в роли квалифицированного врача.
2. Если студент пишет о невыносимой боли, желании навредить себе, суицидальных мыслях или сильном кризисе — сразу же прояви максимальное участие и мягко, но настойчиво порекомендуй ему или ей записаться к живому психологу на нашей платформе (через "Каталог психологов").
3. Используй форматирование Markdown для структурирования длинных списков или советов.
4. Общайся уважительно на "вы", будь поддерживающим и кратким.`;

    // API кілті жоқ болса — fallback жауап
    if (!process.env.PERPLEXITY_API_KEY) {
      return res.json({ reply: 'ИИ-көмекші қазір қол жетімді емес (API кілті орнатылмаған).' });
    }

    // Perplexity API клиентін жасау (OpenAI SDK арқылы)
    const client = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai',
    });

    // Чат тарихын API форматына түрлендіру
    const formattedHistory = historyResult.rows.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    const completion = await client.chat.completions.create({
      model: process.env.PERPLEXITY_MODEL || 'sonar',
      messages: [
        { role: 'system', content: systemPrompt },
        ...formattedHistory,
        { role: 'user', content: message },
      ],
      temperature: 0.7,
    });

    // Perplexity citation маркерлерін [1][4] алып тастау
    const aiResponse = completion.choices[0].message.content
      .replace(/\[\d+\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    // ИИ жауабын дерекқорға сақтау
    await pool.query(
      'INSERT INTO chat_messages (student_id, role, content) VALUES ($1, $2, $3)',
      [req.user.id, 'assistant', aiResponse]
    );

    res.json({ reply: aiResponse });
  } catch (err) {
    console.error('ИИ чат қатесі:', err);
    res.status(500).json({ error: 'ИИ-мен жұмыс кезінде сервер қатесі' });
  }
});

// GET /api/student/profile — студенттің өз профилін алу
router.get('/profile', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, faculty, course, gender, age FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// PATCH /api/student/profile — студенттің өз профилін жаңарту
router.patch('/profile', async (req, res) => {
  try {
    const { name, faculty, course, gender, age } = req.body;
    const result = await pool.query(
      `UPDATE users SET name = COALESCE($1, name), faculty = $2, course = $3, gender = $4, age = $5
       WHERE id = $6 RETURNING id, name, email, faculty, course, gender, age`,
      [name || null, faculty || null, course || null, gender || null, age || null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/student/ai-insight — check-in трендтеріне ИИ талдауы
router.post('/ai-insight', aiLimiter, async (req, res) => {
  try {
    if (!process.env.PERPLEXITY_API_KEY) {
      return res.status(503).json({ error: 'ИИ қызметі қол жетімді емес' });
    }

    // Соңғы 7 check-in деректерін алу
    const checkIns = await pool.query(
      `SELECT date, mood, stress, sleep, energy, productivity
       FROM check_ins WHERE student_id = $1 ORDER BY date DESC LIMIT 7`,
      [req.user.id]
    );

    if (checkIns.rows.length === 0) {
      return res.status(400).json({ error: 'Деректер жеткіліксіз. Кемінде бір check-in толтырыңыз.' });
    }

    // Соңғы скрининг нәтижесі
    const lastSurvey = await pool.query(
      `SELECT score, risk_level FROM surveys
       WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );

    // ИИ-ға жіберілетін деректерді форматтау
    const rows = checkIns.rows.map(r => ({
      дата: r.date,
      настроение: r.mood,
      стресс: r.stress,
      сон: r.sleep,
      энергия: r.energy,
      продуктивность: r.productivity,
    }));

    const surveyInfo = lastSurvey.rows[0]
      ? `Последний скрининг: балл ${lastSurvey.rows[0].score}/25, риск: ${lastSurvey.rows[0].risk_level}.`
      : '';

    const prompt = `Ты — психологический AI-аналитик платформы MindSpace для студентов.
Проанализируй данные ежедневных чек-инов студента (шкала 1–5) за последние дни.
${surveyInfo}

Данные чек-инов (от новых к старым):
${JSON.stringify(rows, null, 2)}

Напиши персональный инсайт в 3 частях (используй Markdown):
**Что происходит** — 2 предложения о текущем состоянии на основе данных.
**Тенденция** — растёт, падает или стабильно? 1-2 предложения.
**3 конкретных совета** — практические, применимые сегодня.

Тон: поддерживающий, без диагнозов. Обращение на "вы". Кратко.`;

    const client = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai',
    });
    const completion = await client.chat.completions.create({
      model: process.env.PERPLEXITY_MODEL || 'sonar',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    // Citation маркерлерін алып тастау
    const insight = completion.choices[0].message.content
      .replace(/\[\d+\]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    res.json({ insight });
  } catch (err) {
    console.error('ИИ талдау қатесі:', err);
    res.status(500).json({ error: 'ИИ талдауында қате' });
  }
});

module.exports = router;
