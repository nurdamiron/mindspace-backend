const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimits');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();

router.use(authenticate, authorize('psychologist'));

// GET /api/psychologist/profile — get own profile
router.get('/profile', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, specialization, languages, experience_years, bio FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/psychologist/profile — update own profile
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
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/psychologist/schedule — today's and future schedule
router.get('/schedule', async (req, res) => {
  try {
    const { period = 'today' } = req.query;

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
    console.error('Schedule error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/psychologist/students/:id — student card
router.get('/students/:id', async (req, res) => {
  try {
    // Verify this student has an appointment with this psychologist
    const access = await pool.query(
      'SELECT id FROM appointments WHERE student_id = $1 AND psychologist_id = $2 LIMIT 1',
      [req.params.id, req.user.id]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к данным студента' });
    }

    const student = await pool.query(
      'SELECT id, faculty, course, gender, age FROM users WHERE id = $1 AND role = $2',
      [req.params.id, 'student']
    );
    if (student.rows.length === 0) {
      return res.status(404).json({ error: 'Студент не найден' });
    }

    const checkIns = await pool.query(
      `SELECT date, mood, stress, sleep, energy, productivity FROM check_ins
       WHERE student_id = $1 AND date >= CURRENT_DATE - 30
       ORDER BY date ASC`,
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
    console.error('Student card error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/psychologist/sessions/:appointmentId/notes — add session notes
router.post('/sessions/:appointmentId/notes', async (req, res) => {
  try {
    const { condition_before, condition_after, recommend_followup, tags, notes } = req.body;

    // Verify appointment belongs to this psychologist
    const appt = await pool.query(
      'SELECT id FROM appointments WHERE id = $1 AND psychologist_id = $2',
      [req.params.appointmentId, req.user.id]
    );
    if (appt.rows.length === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }

    const result = await pool.query(
      `INSERT INTO session_notes (appointment_id, psychologist_id, condition_before, condition_after, recommend_followup, tags, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.params.appointmentId, req.user.id, condition_before, condition_after, recommend_followup || false, tags || '', notes || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Session notes error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/psychologist/appointments/:id/complete — mark as completed
router.patch('/appointments/:id/complete', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE appointments SET status = 'completed'
       WHERE id = $1 AND psychologist_id = $2 AND status = 'scheduled'
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Запись не найдена или уже завершена' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Complete appointment error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/psychologist/stats — statistics
router.get('/stats', async (req, res) => {
  try {
    const totalSessions = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'completed') as completed,
              COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled
       FROM appointments WHERE psychologist_id = $1`,
      [req.user.id]
    );

    const uniqueStudents = await pool.query(
      'SELECT COUNT(DISTINCT student_id) as count FROM appointments WHERE psychologist_id = $1',
      [req.user.id]
    );

    const weeklyLoad = await pool.query(
      `SELECT ts.date, COUNT(*) as count
       FROM appointments a JOIN time_slots ts ON a.slot_id = ts.id
       WHERE a.psychologist_id = $1 AND ts.date >= CURRENT_DATE - 30
       GROUP BY ts.date ORDER BY ts.date`,
      [req.user.id]
    );

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
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/psychologist/students/:id/ai-summary — AI pre-session briefing
router.post('/students/:id/ai-summary', aiLimiter, async (req, res) => {
  try {
    const access = await pool.query(
      'SELECT id FROM appointments WHERE student_id = $1 AND psychologist_id = $2 LIMIT 1',
      [req.params.id, req.user.id]
    );
    if (access.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к данным студента' });
    }

    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(503).json({ error: 'AI-сервис недоступен' });
    }

    const [checkIns, appointments, surveys] = await Promise.all([
      pool.query(
        `SELECT date, mood, stress, sleep, energy, productivity
         FROM check_ins WHERE student_id = $1
         ORDER BY date DESC LIMIT 14`,
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

Тон: профессиональный, клинически нейтральный. Без диагнозов. Кратко.`;

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GOOGLE_AI_MODEL || 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    res.json({ summary });
  } catch (err) {
    console.error('AI Summary error:', err);
    res.status(500).json({ error: 'Ошибка AI-анализа' });
  }
});

module.exports = router;
