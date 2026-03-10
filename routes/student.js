const express = require('express');
const pool = require('../db/pool');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// All routes require student role
router.use(authenticate, authorize('student'));

// GET /api/student/check-ins — history of check-ins
router.get('/check-ins', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const result = await pool.query(
      `SELECT * FROM check_ins WHERE student_id = $1 AND date >= CURRENT_DATE - $2::INTEGER
       ORDER BY date DESC`,
      [req.user.id, days]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('CheckIn GET error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/student/check-ins — create a new check-in
router.post('/check-ins', async (req, res) => {
  try {
    const { mood, stress, sleep, energy, productivity, notes } = req.body;
    const result = await pool.query(
      `INSERT INTO check_ins (student_id, date, mood, stress, sleep, energy, productivity, notes)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, mood, stress, sleep, energy, productivity, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('CheckIn POST error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/student/stats — personal statistics
router.get('/stats', async (req, res) => {
  try {
    const checkIns = await pool.query(
      `SELECT date, mood, stress, sleep, energy, productivity FROM check_ins
       WHERE student_id = $1 AND date >= CURRENT_DATE - 30
       ORDER BY date ASC`,
      [req.user.id]
    );

    const appointments = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'completed') as completed,
              COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled
       FROM appointments WHERE student_id = $1`,
      [req.user.id]
    );

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
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/student/psychologists — catalog
router.get('/psychologists', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, specialization, languages, experience_years, bio, avatar, gender
       FROM users WHERE role = 'psychologist' ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Psychologists error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/student/psychologists/:id/slots — available slots
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
    console.error('Slots error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/student/appointments — create an appointment
router.post('/appointments', async (req, res) => {
  try {
    const { psychologist_id, slot_id, reason, format } = req.body;

    // Check if slot is available
    const slot = await pool.query(
      'SELECT * FROM time_slots WHERE id = $1 AND is_available = true',
      [slot_id]
    );
    if (slot.rows.length === 0) {
      return res.status(400).json({ error: 'Слот уже занят или не существует' });
    }

    // Mark slot as unavailable
    await pool.query('UPDATE time_slots SET is_available = false WHERE id = $1', [slot_id]);

    const result = await pool.query(
      `INSERT INTO appointments (student_id, psychologist_id, slot_id, status, reason, format)
       VALUES ($1, $2, $3, 'scheduled', $4, $5) RETURNING *`,
      [req.user.id, psychologist_id, slot_id, reason || null, format || 'offline']
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Appointment POST error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/student/appointments — my appointments
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
    console.error('Appointments GET error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/student/surveys — submit a survey
router.post('/surveys', async (req, res) => {
  try {
    const { type, answers } = req.body;
    // Calculate simple score
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
    console.error('Survey POST error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/student/appointments/:id/feedback — appointment feedback
router.post('/appointments/:id/feedback', async (req, res) => {
  try {
    const { feedback_score, feedback_text } = req.body;
    const result = await pool.query(
      `UPDATE appointments SET feedback_score = $1, feedback_text = $2
       WHERE id = $3 AND student_id = $4 RETURNING *`,
      [feedback_score, feedback_text, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Запись не найдена' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/student/chat — get chat history
router.get('/chat', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM chat_messages WHERE student_id = $1 ORDER BY created_at ASC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/student/chat — send message to AI chat (mock)
router.post('/chat', async (req, res) => {
  try {
    const { content } = req.body;

    // Save user message
    await pool.query(
      'INSERT INTO chat_messages (student_id, role, content) VALUES ($1, $2, $3)',
      [req.user.id, 'user', content]
    );

    // Generate AI response (mock)
    const responses = [
      'Я понимаю, что вам сейчас непросто. Давайте поговорим об этом подробнее. Что именно вызывает у вас наибольшее беспокойство?',
      'Спасибо, что поделились. Попробуйте технику дыхания: вдох на 4 счёта, задержка на 4 счёта, выдох на 6 счётов. Повторите 5 раз.',
      'Это нормальная реакция на стресс. Важно помнить, что вы не одиноки. Хотите, я подскажу несколько техник релаксации?',
      'Похоже, вам может помочь консультация с психологом. Хотите, я помогу записаться на приём?',
      'Старайтесь делать перерывы каждые 45 минут учёбы. Физическая активность, даже короткая прогулка, может значительно улучшить настроение.',
      'Важно поддерживать режим сна. Попробуйте не использовать телефон за час до сна и ложиться в одно и то же время.',
    ];
    const aiResponse = responses[Math.floor(Math.random() * responses.length)];

    await pool.query(
      'INSERT INTO chat_messages (student_id, role, content) VALUES ($1, $2, $3)',
      [req.user.id, 'assistant', aiResponse]
    );

    res.json({ response: aiResponse });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
