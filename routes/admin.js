const express = require('express');
const pool = require('../db/pool');
const bcrypt = require('bcryptjs');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('admin'));

// GET /api/admin/dashboard — aggregate statistics
router.get('/dashboard', async (req, res) => {
  try {
    const totalStudents = await pool.query(
      "SELECT COUNT(*) as count FROM users WHERE role = 'student'"
    );

    const activeStudents = await pool.query(
      `SELECT COUNT(DISTINCT student_id) as count FROM check_ins WHERE date >= CURRENT_DATE - 7`
    );

    const totalSessions = await pool.query(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE status = 'completed') as completed,
              COUNT(*) FILTER (WHERE status = 'scheduled') as upcoming
       FROM appointments`
    );

    const weeklyTrend = await pool.query(
      `SELECT ts.date, COUNT(*) as count
       FROM appointments a JOIN time_slots ts ON a.slot_id = ts.id
       WHERE ts.date >= CURRENT_DATE - 30
       GROUP BY ts.date ORDER BY ts.date`
    );

    const facultyStats = await pool.query(
      `SELECT u.faculty, COUNT(DISTINCT a.student_id) as students, COUNT(a.id) as sessions
       FROM appointments a
       JOIN users u ON a.student_id = u.id
       WHERE u.faculty IS NOT NULL
       GROUP BY u.faculty ORDER BY sessions DESC`
    );

    const highStressStudents = await pool.query(
      `SELECT COUNT(DISTINCT student_id) as count FROM check_ins
       WHERE date >= CURRENT_DATE - 7 AND stress >= 4`
    );

    const avgMetrics = await pool.query(
      `SELECT
        ROUND(AVG(mood)::numeric, 1) as avg_mood,
        ROUND(AVG(stress)::numeric, 1) as avg_stress,
        ROUND(AVG(sleep)::numeric, 1) as avg_sleep,
        ROUND(AVG(energy)::numeric, 1) as avg_energy,
        ROUND(AVG(productivity)::numeric, 1) as avg_productivity
       FROM check_ins WHERE date >= CURRENT_DATE - 7`
    );

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
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/admin/psychologists — list psychologists
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
    console.error('Admin psychologists error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/psychologists — add a psychologist
router.post('/psychologists', async (req, res) => {
  try {
    const { email, password, name, specialization, languages, experience_years, bio } = req.body;
    const hash = await bcrypt.hash(password || 'password123', 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, name, specialization, languages, experience_years, bio)
       VALUES ($1, $2, 'psychologist', $3, $4, $5, $6, $7) RETURNING id, email, name, specialization`,
      [email, hash, name, specialization, languages, experience_years, bio]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Email уже используется' });
    }
    console.error('Add psychologist error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/admin/psychologists/:id — remove a psychologist
router.delete('/psychologists/:id', async (req, res) => {
  try {
    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 AND role = 'psychologist' RETURNING id",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Психолог не найден' });
    }
    res.json({ message: 'Психолог удалён' });
  } catch (err) {
    console.error('Delete psychologist error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/admin/slots — all slots
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
    console.error('Admin slots error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/admin/slots — create time slots
router.post('/slots', async (req, res) => {
  try {
    const { psychologist_id, date, slots } = req.body;
    // slots is an array of { start_time, end_time }
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
    console.error('Create slots error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
