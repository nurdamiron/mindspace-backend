// express — маршрутизатор жасау үшін
const express = require('express');
// pool — дерекқор сұраныстары үшін
const pool = require('../db/pool');
// bcryptjs — жаңа психолог құпия сөзін хэштеу үшін
const bcrypt = require('bcryptjs');
// authenticate, authorize — токен тексеру және рөл шектеу middleware
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Барлық маршруттар тек әкімші рөліне ғана қол жетімді
router.use(authenticate, authorize('admin'));

// GET /api/admin/dashboard — жалпы статистика
router.get('/dashboard', async (req, res) => {
  try {
    // Студенттер жалпы саны
    const totalStudents = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'student'"
    );

    // Соңғы 7 күнде белсенді студенттер (check-in жасағандар)
    const activeStudents = await pool.query(
      `SELECT COUNT(DISTINCT student_id) as count FROM check_ins WHERE date >= CURRENT_DATE - 7`
    );

    // Сеанстар жалпы, аяқталған және жоспарланған санауышы
    const totalSessions = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'completed') as completed,
              COUNT(*) FILTER (WHERE status = 'scheduled') as upcoming
       FROM appointments`
    );

    // Соңғы 30 күндегі апталық сеанс тренді
    const weeklyTrend = await pool.query(
      `SELECT ts.date, COUNT(*) as count
       FROM appointments a JOIN time_slots ts ON a.slot_id = ts.id
       WHERE ts.date >= CURRENT_DATE - 30
       GROUP BY ts.date ORDER BY ts.date`
    );

    // Факультет бойынша студент және сеанс статистикасы
    const facultyStats = await pool.query(
      `SELECT u.faculty, COUNT(DISTINCT a.student_id) as students, COUNT(a.id) as sessions
       FROM appointments a
       JOIN users u ON a.student_id = u.id
       WHERE u.faculty IS NOT NULL
       GROUP BY u.faculty ORDER BY sessions DESC`
    );

    // Жоғары стресс деңгейі бар студенттер (7 күнде stress >= 4)
    const highStressStudents = await pool.query(
      `SELECT COUNT(DISTINCT student_id) as count FROM check_ins
       WHERE date >= CURRENT_DATE - 7 AND stress >= 4`
    );

    // Соңғы 7 күндегі орташа метрикалар
    const avgMetrics = await pool.query(
      `SELECT
        ROUND(AVG(mood)::numeric, 1) as avg_mood,
        ROUND(AVG(stress)::numeric, 1) as avg_stress,
        ROUND(AVG(sleep)::numeric, 1) as avg_sleep,
        ROUND(AVG(energy)::numeric, 1) as avg_energy,
        ROUND(AVG(productivity)::numeric, 1) as avg_productivity
       FROM check_ins WHERE date >= CURRENT_DATE - 7`
    );

    // Факультет бойынша қауіп деңгейі
    const riskByFaculty = await pool.query(
      `SELECT u.faculty,
              ROUND(AVG(c.stress)::numeric, 1) as avg_stress,
              ROUND(AVG(c.mood)::numeric, 1) as avg_mood,
              COUNT(DISTINCT c.student_id) as active_students
       FROM check_ins c
       JOIN users u ON c.student_id = u.id
       WHERE c.date >= CURRENT_DATE - 7 AND u.faculty IS NOT NULL
       GROUP BY u.faculty`
    );

    res.json({
      totalStudents: totalStudents.rows[0].count,
      activeStudents: activeStudents.rows[0].count,
      sessions: totalSessions.rows[0],
      weeklyTrend: weeklyTrend.rows,
      facultyStats: facultyStats.rows,
      highStressStudents: highStressStudents.rows[0].count,
      avgMetrics: avgMetrics.rows[0],
      riskByFaculty: riskByFaculty.rows,
    });
  } catch (err) {
    console.error('Дашборд қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/admin/psychologists — психологтар тізімі (статистикамен)
router.get('/psychologists', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.specialization, u.languages, u.experience_years, u.bio,
              COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'completed') as completed_sessions,
              COUNT(DISTINCT a.student_id) as total_students
       FROM users u
       LEFT JOIN appointments a ON u.id = a.psychologist_id
       WHERE u.role = 'psychologist'
       GROUP BY u.id ORDER BY u.name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Психологтар тізімі қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/admin/psychologists — жаңа психолог қосу
router.post('/psychologists', async (req, res) => {
  try {
    const { email, password, name, specialization, languages, experience_years, bio } = req.body;
    // Берілмесе әдепкі құпия сөз қолданылады
    const hash = await bcrypt.hash(password || 'password123', 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, name, specialization, languages, experience_years, bio)
       VALUES ($1, $2, 'psychologist', $3, $4, $5, $6, $7) RETURNING id, email, name, specialization`,
      [email, hash, name, specialization, languages, experience_years, bio]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    // Email қайталануы
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Бұл email бұрын пайдаланылуда' });
    }
    console.error('Психолог қосу қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// DELETE /api/admin/psychologists/:id — психологты жою
router.delete('/psychologists/:id', async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 AND role = 'psychologist' RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Психолог табылмады' });
    }
    res.json({ message: 'Психолог жойылды' });
  } catch (err) {
    console.error('Психологты жою қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/admin/slots — барлық болашақ слоттар (психолог атымен)
router.get('/slots', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ts.*, u.name as psychologist_name
       FROM time_slots ts
       JOIN users u ON ts.psychologist_id = u.id
       WHERE ts.date >= CURRENT_DATE
       ORDER BY ts.date, ts.start_time`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Слоттар алу қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// POST /api/admin/slots — психолог үшін слоттар жасау
router.post('/slots', async (req, res) => {
  try {
    const { psychologist_id, date, slots } = req.body;
    // slots — { start_time, end_time } массиві
    const results = [];
    for (const slot of slots) {
      const result = await pool.query(
        `INSERT INTO time_slots (psychologist_id, date, start_time, end_time)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [psychologist_id, date, slot.start_time, slot.end_time]
      );
      results.push(result.rows[0]);
    }
    res.status(201).json(results);
  } catch (err) {
    console.error('Слот жасау қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// DELETE /api/admin/slots/:id — слотты жою (тек бос слоттарды)
router.delete('/slots/:id', async (req, res) => {
  try {
    const slot = await pool.query(
      'SELECT id, is_available FROM time_slots WHERE id = $1', [req.params.id]
    );
    if (slot.rows.length === 0) return res.status(404).json({ error: 'Слот табылмады' });
    if (!slot.rows[0].is_available) {
      return res.status(400).json({ error: 'Брондалған слотты жоюға болмайды' });
    }
    await pool.query('DELETE FROM time_slots WHERE id = $1', [req.params.id]);
    res.json({ message: 'Слот жойылды' });
  } catch (err) {
    console.error('Слотты жою қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/admin/students/:id — студенттің толық деректері
router.get('/students/:id', async (req, res) => {
  try {
    const student = await pool.query(
      'SELECT id, name, email, faculty, course, gender, age, created_at FROM users WHERE id = $1 AND role = $2',
      [req.params.id, 'student']
    );
    if (student.rows.length === 0) return res.status(404).json({ error: 'Студент табылмады' });

    // Check-in тарихы, сеанстар және скрининг деректерін параллель алу
    const [checkIns, appointments, surveys] = await Promise.all([
      pool.query(
        `SELECT date, mood, stress, sleep, energy, productivity FROM check_ins
         WHERE student_id = $1 AND date >= CURRENT_DATE - 30 ORDER BY date ASC`,
        [req.params.id]
      ),
      pool.query(
        `SELECT a.id, a.status, a.reason, a.format, ts.date, ts.start_time, ts.end_time,
                u.name as psychologist_name,
                sn.condition_before, sn.condition_after, sn.tags, sn.notes as session_notes, sn.recommend_followup
         FROM appointments a
         JOIN time_slots ts ON a.slot_id = ts.id
         JOIN users u ON a.psychologist_id = u.id
         LEFT JOIN session_notes sn ON sn.appointment_id = a.id
         WHERE a.student_id = $1 ORDER BY ts.date DESC`,
        [req.params.id]
      ),
      pool.query(
        'SELECT score, risk_level, created_at FROM surveys WHERE student_id = $1 ORDER BY created_at DESC LIMIT 5',
        [req.params.id]
      ),
    ]);

    res.json({
      student: student.rows[0],
      checkIns: checkIns.rows,
      appointments: appointments.rows,
      surveys: surveys.rows,
    });
  } catch (err) {
    console.error('Студент деректілері қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

// GET /api/admin/students — студенттер тізімі (іздеу, сүзгі, беттеу)
router.get('/students', async (req, res) => {
  try {
    const { search = '', faculty = '', risk = '', page = 1, limit = 25 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // Іздеу, факультет және қауіп деңгейі сүзгілерімен студенттер тізімі
    const result = await pool.query(
      `SELECT
         u.id, u.name, u.email, u.faculty, u.course, u.gender, u.age, u.created_at,
         COALESCE(ci.last_checkin, NULL) as last_checkin,
         COALESCE(ci.checkin_count, 0) as checkin_count,
         COALESCE(ci.avg_stress, 0) as avg_stress,
         COALESCE(ci.avg_mood, 0) as avg_mood,
         sv.risk_level as last_risk,
         sv.score as last_score,
         COALESCE(ap.session_count, 0) as session_count
       FROM users u
       LEFT JOIN LATERAL (
         SELECT MAX(date) as last_checkin, COUNT(*) as checkin_count,
                ROUND(AVG(stress)::numeric, 1) as avg_stress,
                ROUND(AVG(mood)::numeric, 1) as avg_mood
         FROM check_ins WHERE student_id = u.id AND date >= CURRENT_DATE - 30
       ) ci ON true
       LEFT JOIN LATERAL (
         SELECT risk_level, score FROM surveys
         WHERE student_id = u.id ORDER BY created_at DESC LIMIT 1
       ) sv ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) as session_count FROM appointments WHERE student_id = u.id
       ) ap ON true
       WHERE u.role = 'student'
         AND ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
         AND ($2 = '' OR u.faculty = $2)
         AND ($3 = '' OR sv.risk_level = $3)
       ORDER BY ci.last_checkin DESC NULLS LAST, u.created_at DESC
       LIMIT $4 OFFSET $5`,
      [search, faculty, risk, Number(limit), offset]
    );

    // Беттеу үшін жалпы сан
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM users u
       LEFT JOIN LATERAL (
         SELECT risk_level FROM surveys WHERE student_id = u.id ORDER BY created_at DESC LIMIT 1
       ) sv ON true
       WHERE u.role = 'student'
         AND ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%')
         AND ($2 = '' OR u.faculty = $2)
         AND ($3 = '' OR sv.risk_level = $3)`,
      [search, faculty, risk]
    );

    // Факультеттер тізімі — сүзгі үшін
    const faculties = await pool.query(
      `SELECT DISTINCT faculty FROM users WHERE role = 'student' AND faculty IS NOT NULL ORDER BY faculty`
    );

    res.json({
      students: result.rows,
      faculties: faculties.rows.map(r => r.faculty),
      total: Number(countResult.rows[0].count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error('Студенттер тізімі қатесі:', err);
    res.status(500).json({ error: 'Сервер қатесі' });
  }
});

module.exports = router;
