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

// Барлық маршруттар тек психолог рөліне ғана қол жетімді
router.use(authenticate, authorize('psychologist'));

// GET /api/psychologist/profile — психологтың өз профилін алу
router.get('/profile', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, specialization, languages, experience_years, bio FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// PATCH /api/psychologist/profile — психологтың өз профилін жаңарту
router.patch('/profile', async (req, res) => {
  try {
    const { name, specialization, languages, experience_years, bio } = req.body;
    const result = await pool.query(
      `UPDATE users SET name = COALESCE($1, name), specialization = $2,
       languages = $3, experience_years = $4, bio = $5
       WHERE id = $6 RETURNING id, name, email, specialization, languages, experience_years, bio`,
      [name || null, specialization || null, languages || null, experience_years || null, bio || null, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/psychologist/schedule — кесте (бүгін / апта / барлық)
router.get('/schedule', async (req, res) => {
  try {
    const { period = 'today' } = req.query;

    // Кезең параметріне байланысты күн сүзгісі
    let dateFilter = 'ts.date = CURRENT_DATE';
    if (period === 'week') dateFilter = 'ts.date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7';
    if (period === 'all') dateFilter = 'ts.date >= CURRENT_DATE';

    const result = await pool.query(
      `SELECT a.id as appointment_id, a.status, a.reason, a.format,
              ts.date, ts.start_time, ts.end_time,
              u.id as student_id, u.faculty, u.course, u.gender, u.age,
              sn.id as note_id
       FROM appointments a
       JOIN time_slots ts ON a.slot_id = ts.id
       JOIN users u ON a.student_id = u.id
       LEFT JOIN session_notes sn ON sn.appointment_id = a.id
       WHERE a.psychologist_id = $1 AND ${dateFilter}
       ORDER BY ts.date ASC, ts.start_time ASC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Кесте алу қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/psychologist/students/:id — студент картасын алу
router.get('/students/:id', async (req, res) => {
  try {
    // Осы студентпен сеанс болғанын тексеру (қол жеткізу құқығы)
    const access = await pool.query(
      'SELECT id FROM appointments WHERE student_id = $1 AND psychologist_id = $2 LIMIT 1',
      [req.params.id, req.user.id]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: 'Студент деректеріне қол жеткізу жоқ' });
    }

    // Студент негізгі деректерін алу
    const student = await pool.query(
      'SELECT id, faculty, course, gender, age FROM users WHERE id = $1 AND role = $2',
      [req.params.id, 'student']
    );
    if (student.rows.length === 0) {
      return res.status(404).json({ error: 'Студент табылмады' });
    }

    // Check-in тарихы, сеанстар және скрининг нәтижелерін параллель алу
    const checkIns = await pool.query(
      `SELECT date, mood, stress, sleep, energy, productivity FROM check_ins
       WHERE student_id = $1 AND date >= CURRENT_DATE - 30 ORDER BY date ASC`,
      [req.params.id]
    );

    const appointments = await pool.query(
      `SELECT a.id, a.status, a.reason, a.format, ts.date, ts.start_time,
              sn.condition_before, sn.condition_after, sn.tags, sn.notes as session_notes, sn.recommend_followup
       FROM appointments a
       JOIN time_slots ts ON a.slot_id = ts.id
       LEFT JOIN session_notes sn ON sn.appointment_id = a.id
       WHERE a.student_id = $1 AND a.psychologist_id = $2
       ORDER BY ts.date DESC`,
      [req.params.id, req.user.id]
    );

    const surveys = await pool.query(
      'SELECT type, score, risk_level, created_at FROM surveys WHERE student_id = $1 ORDER BY created_at DESC LIMIT 5',
      [req.params.id]
    );

    res.json({
      student: student.rows[0],
      checkIns: checkIns.rows,
      appointments: appointments.rows,
      surveys: surveys.rows,
    });
  } catch (err) {
    console.error('Студент картасы қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/psychologist/sessions/:appointmentId/notes — сеанс жазбасын қосу
router.post('/sessions/:appointmentId/notes', async (req, res) => {
  try {
    const { condition_before, condition_after, recommend_followup, tags, notes } = req.body;

    // Сеанстың осы психологқа тиесілі екенін тексеру
    const appt = await pool.query(
      'SELECT id FROM appointments WHERE id = $1 AND psychologist_id = $2',
      [req.params.appointmentId, req.user.id]
    );
    if (appt.rows.length === 0) {
      return res.status(404).json({ error: 'Жазба табылмады' });
    }

    const result = await pool.query(
      `INSERT INTO session_notes (appointment_id, psychologist_id, condition_before, condition_after, recommend_followup, tags, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.appointmentId, req.user.id, condition_before, condition_after,
       recommend_followup || false, tags || '', notes || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Сеанс жазбасы қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// PATCH /api/psychologist/appointments/:id/complete — сеансты аяқталды деп белгілеу
router.patch('/appointments/:id/complete', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE appointments SET status = 'completed'
       WHERE id = $1 AND psychologist_id = $2 AND status = 'scheduled'
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Жазба табылмады немесе бұрын аяқталған' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Сеансты аяқтау қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/psychologist/stats — психолог статистикасы
router.get('/stats', async (req, res) => {
  try {
    // Барлық сеанстар санауышы
    const totalSessions = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'completed') as completed,
              COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled
       FROM appointments WHERE psychologist_id = $1`,
      [req.user.id]
    );

    // Бірегей студенттер саны
    const uniqueStudents = await pool.query(
      'SELECT COUNT(DISTINCT student_id) as count FROM appointments WHERE psychologist_id = $1',
      [req.user.id]
    );

    // Соңғы 30 күндегі апталық жүктеме
    const weeklyLoad = await pool.query(
      `SELECT ts.date, COUNT(*) as count
       FROM appointments a JOIN time_slots ts ON a.slot_id = ts.id
       WHERE a.psychologist_id = $1 AND ts.date >= CURRENT_DATE - 30
       GROUP BY ts.date ORDER BY ts.date`,
      [req.user.id]
    );

    // Тег статистикасы
    const tagStats = await pool.query(
      `SELECT tags, COUNT(*) as count FROM session_notes
       WHERE psychologist_id = $1 AND tags != '' GROUP BY tags`,
      [req.user.id]
    );

    res.json({
      sessions: totalSessions.rows[0],
      uniqueStudents: uniqueStudents.rows[0].count,
      weeklyLoad: weeklyLoad.rows,
      tagStats: tagStats.rows,
    });
  } catch (err) {
    console.error('Статистика қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/psychologist/students — осы психологтың студенттер тізімі
router.get('/students', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT u.id, u.name, u.faculty, u.course, u.gender, u.age,
              COUNT(a.id)::int as total_sessions,
              COUNT(a.id) FILTER (WHERE a.status = 'completed')::int as completed_sessions,
              MAX(ts.date) as last_session,
              (SELECT risk_level FROM surveys WHERE student_id = u.id ORDER BY created_at DESC LIMIT 1) as latest_risk
       FROM appointments a
       JOIN users u ON a.student_id = u.id
       JOIN time_slots ts ON a.slot_id = ts.id
       WHERE a.psychologist_id = $1
       GROUP BY u.id, u.name, u.faculty, u.course, u.gender, u.age
       ORDER BY MAX(ts.date) DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Студенттер тізімі қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/psychologist/students/:id/ai-summary — сеанс алдындағы ИИ сараптамасы
router.post('/students/:id/ai-summary', aiLimiter, async (req, res) => {
  try {
    // Қол жеткізу құқығын тексеру
    const access = await pool.query(
      'SELECT id FROM appointments WHERE student_id = $1 AND psychologist_id = $2 LIMIT 1',
      [req.params.id, req.user.id]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: 'Студент деректеріне қол жеткізу жоқ' });
    }

    if (!process.env.PERPLEXITY_API_KEY) {
      return res.status(503).json({ error: 'ИИ қызметі қол жетімді емес' });
    }

    // Check-in, сеанстар және скрининг деректерін параллель алу
    const [checkIns, appointments, surveys] = await Promise.all([
      pool.query(
        `SELECT date, mood, stress, sleep, energy, productivity
         FROM check_ins WHERE student_id = $1 ORDER BY date DESC LIMIT 14`,
        [req.params.id]
      ),
      pool.query(
        `SELECT a.status, ts.date, sn.condition_before, sn.condition_after,
                sn.tags, sn.notes as session_notes, sn.recommend_followup
         FROM appointments a
         JOIN time_slots ts ON a.slot_id = ts.id
         LEFT JOIN session_notes sn ON sn.appointment_id = a.id
         WHERE a.student_id = $1 AND a.psychologist_id = $2
         ORDER BY ts.date DESC LIMIT 5`,
        [req.params.id, req.user.id]
      ),
      pool.query(
        `SELECT score, risk_level, created_at FROM surveys
         WHERE student_id = $1 ORDER BY created_at DESC LIMIT 3`,
        [req.params.id]
      ),
    ]);

    // Орташа стресс және көңіл-күй есептеу
    const avgStress = checkIns.rows.length
      ? (checkIns.rows.reduce((s, r) => s + r.stress, 0) / checkIns.rows.length).toFixed(1)
      : null;
    const avgMood = checkIns.rows.length
      ? (checkIns.rows.reduce((s, r) => s + r.mood, 0) / checkIns.rows.length).toFixed(1)
      : null;

    const completedWithNotes = appointments.rows.filter(a => a.session_notes);

    const prompt = `Ты — аналитический AI-ассистент для практикующего психолога.
Составь краткую предсессионную сводку по студенту на основе объективных данных.

ДАННЫЕ ЧЕК-ИНОВ (последние 14 дней, шкала 1–5):
${JSON.stringify(checkIns.rows.map(r => ({ дата: r.date, настроение: r.mood, стресс: r.stress, сон: r.sleep, энергия: r.energy, продуктивность: r.productivity })), null, 2)}
Средний стресс: ${avgStress ?? 'нет данных'}, среднее настроение: ${avgMood ?? 'нет данных'}.

ИСТОРИЯ СЕССИЙ С ЭТИМ ПСИХОЛОГОМ (${appointments.rows.length} сессий):
${JSON.stringify(completedWithNotes.map(a => ({ дата: a.date, до: a.condition_before, после: a.condition_after, теги: a.tags, заметки: a.session_notes, повтор: a.recommend_followup })), null, 2)}

СКРИНИНГИ (последние 3):
${JSON.stringify(surveys.rows.map(s => ({ балл: s.score + '/25', риск: s.risk_level, дата: s.created_at })), null, 2)}

Напиши сводку в формате Markdown, строго по структуре:
**Общее состояние** — 2 предложения, что сейчас происходит с динамикой.
**Тенденции** — что улучшается, что ухудшается.
**На что обратить внимание** — 2-3 конкретных момента для сессии.
**Рекомендуемые темы** — что стоит обсудить.

Тон: профессиональный, клинически нейтральный. Без диагнозов. Кратко.

Строгие правила форматирования:
- Никаких сносок вида [1], [2], [3] и т.п.
- Никаких внешних ссылок и URL
- Не упоминай себя, не говори что ты ИИ, ассистент, языковая модель или любой сервис
- Только структурированный текст по заданным разделам`;

    const client = new OpenAI({
      apiKey: process.env.PERPLEXITY_API_KEY,
      baseURL: 'https://api.perplexity.ai',
    });
    const completion = await client.chat.completions.create({
      model: process.env.PERPLEXITY_MODEL || 'sonar',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    // Citation маркерлері мен URL-дерді алып тастау
    const raw = completion.choices[0].message.content;
    const summary = raw
      .replace(/\[\d+\]/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/^\s*\[\d[\d,\s]*\].*$/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    res.json({ summary });
  } catch (err) {
    console.error('ИИ сараптама қатесі:', err);
    res.status(500).json({ error: 'ИИ талдауында қате' });
  }
});

// GET /api/psychologist/slots — психологтың бос слоттары
router.get('/slots', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, date, start_time, end_time, is_available FROM time_slots
       WHERE psychologist_id = $1 AND date >= CURRENT_DATE
       ORDER BY date ASC, start_time ASC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/psychologist/slots — жаңа уақыт слоттарын жасау
router.post('/slots', async (req, res) => {
  try {
    const { date, slots } = req.body;
    if (!date || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'Күн мен слоттарды көрсетіңіз' });
    }
    // Барлық слоттарды бірізді жасау
    const created = [];
    for (const { start_time, end_time } of slots) {
      const r = await pool.query(
        `INSERT INTO time_slots (psychologist_id, date, start_time, end_time, is_available)
         VALUES ($1, $2, $3, $4, true) RETURNING *`,
        [req.user.id, date, start_time, end_time]
      );
      created.push(r.rows[0]);
    }
    res.status(201).json(created);
  } catch (err) {
    console.error('Слот жасау қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// DELETE /api/psychologist/slots/:id — бос слотты жою
router.delete('/slots/:id', async (req, res) => {
  try {
    // Тек осы психологтың бос слотын жоюға болады
    const result = await pool.query(
      `DELETE FROM time_slots WHERE id = $1 AND psychologist_id = $2 AND is_available = true RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Слот табылмады немесе бұрын брондалған' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

module.exports = router;
