const bcrypt = require('bcryptjs');
const pool = require('../../db/pool');

const PASSWORD = 'test123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 10);

// ─── Raw credential objects (for login calls) ────────────────────────────────
const STUDENT_CREDS    = { email: 'student@test.com',  password: PASSWORD };
const PSYCH_CREDS      = { email: 'psych@test.com',    password: PASSWORD };
const ADMIN_CREDS      = { email: 'admin@test.com',    password: PASSWORD };
const STUDENT2_CREDS   = { email: 'student2@test.com', password: PASSWORD };

// ─── Seed functions ───────────────────────────────────────────────────────────

async function seedUsers() {
  const result = await pool.query(`
    INSERT INTO users (email, password_hash, role, name, faculty, course, specialization)
    VALUES
      ($1, $2, 'student',       'Test Student',   'IT',  2,    NULL),
      ($3, $2, 'psychologist',  'Test Psych',     NULL,  NULL, 'Anxiety'),
      ($4, $2, 'admin',         'Test Admin',     NULL,  NULL, NULL),
      ($5, $2, 'student',       'Test Student 2', 'CS',  3,    NULL)
    RETURNING id, email, role
  `, [
    STUDENT_CREDS.email,
    PASSWORD_HASH,
    PSYCH_CREDS.email,
    ADMIN_CREDS.email,
    STUDENT2_CREDS.email,
  ]);

  const [student, psych, admin, student2] = result.rows;
  return { student, psych, admin, student2 };
}

async function seedSlot(psychId, { daysFromNow = 1 } = {}) {
  const result = await pool.query(`
    INSERT INTO time_slots (psychologist_id, date, start_time, end_time, is_available)
    VALUES ($1, CURRENT_DATE + ($2 || ' days')::INTERVAL, '10:00', '11:00', true)
    RETURNING *
  `, [psychId, daysFromNow]);
  return result.rows[0];
}

async function seedSlotUnavailable(psychId) {
  const result = await pool.query(`
    INSERT INTO time_slots (psychologist_id, date, start_time, end_time, is_available)
    VALUES ($1, CURRENT_DATE + INTERVAL '2 days', '14:00', '15:00', false)
    RETURNING *
  `, [psychId]);
  return result.rows[0];
}

async function seedAppointment(studentId, psychId, slotId, status = 'scheduled') {
  const result = await pool.query(`
    INSERT INTO appointments (student_id, psychologist_id, slot_id, status, reason, format)
    VALUES ($1, $2, $3, $4, 'Test reason', 'online')
    RETURNING *
  `, [studentId, psychId, slotId, status]);
  return result.rows[0];
}

async function seedCheckIn(studentId, { mood = 3, stress = 3, sleep = 3, energy = 3, productivity = 3, daysAgo = 0 } = {}) {
  const result = await pool.query(`
    INSERT INTO check_ins (student_id, date, mood, stress, sleep, energy, productivity, notes)
    VALUES ($1, CURRENT_DATE - ($2 || ' days')::INTERVAL, $3, $4, $5, $6, $7, 'Test note')
    RETURNING *
  `, [studentId, daysAgo, mood, stress, sleep, energy, productivity]);
  return result.rows[0];
}

async function seedSurvey(studentId, riskLevel = 'low') {
  const score = riskLevel === 'high' ? 20 : riskLevel === 'moderate' ? 13 : 5;
  const answers = { q1: score, q2: 0, q3: 0 };
  const result = await pool.query(`
    INSERT INTO surveys (student_id, type, answers, score, risk_level)
    VALUES ($1, 'PHQ-9', $2, $3, $4)
    RETURNING *
  `, [studentId, JSON.stringify(answers), score, riskLevel]);
  return result.rows[0];
}

async function seedSessionNotes(appointmentId, psychId) {
  const result = await pool.query(`
    INSERT INTO session_notes (appointment_id, psychologist_id, condition_before, condition_after, recommend_followup, tags, notes)
    VALUES ($1, $2, 5, 7, false, 'anxiety', 'Test session notes')
    RETURNING *
  `, [appointmentId, psychId]);
  return result.rows[0];
}

/**
 * Full seed: creates all users + a slot + a scheduled appointment between student1 and psych.
 * Returns all created objects for use in tests.
 */
async function seedAll() {
  const users = await seedUsers();
  const slot  = await seedSlot(users.psych.id);
  const appointment = await seedAppointment(users.student.id, users.psych.id, slot.id, 'scheduled');
  return { ...users, slot, appointment };
}

module.exports = {
  PASSWORD,
  PASSWORD_HASH,
  STUDENT_CREDS,
  PSYCH_CREDS,
  ADMIN_CREDS,
  STUDENT2_CREDS,
  seedUsers,
  seedSlot,
  seedSlotUnavailable,
  seedAppointment,
  seedCheckIn,
  seedSurvey,
  seedSessionNotes,
  seedAll,
};
