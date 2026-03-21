const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const { PASSWORD_HASH } = require('../fixtures');

beforeEach(async () => {
  await clearDb();
});


// Helper: insert a valid student user and return its id
async function insertValidStudent(email = 'test@test.com') {
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, role, name)
     VALUES ($1, $2, 'student', 'Test')
     RETURNING id`,
    [email, PASSWORD_HASH]
  );
  return res.rows[0].id;
}

// Helper: insert a valid psychologist user and return its id
async function insertValidPsych(email = 'psych@test.com') {
  const res = await pool.query(
    `INSERT INTO users (email, password_hash, role, name)
     VALUES ($1, $2, 'psychologist', 'Psych')
     RETURNING id`,
    [email, PASSWORD_HASH]
  );
  return res.rows[0].id;
}

// Helper: insert a valid time slot for a psychologist and return its id
async function insertValidSlot(psychId) {
  const res = await pool.query(
    `INSERT INTO time_slots (psychologist_id, date, start_time, end_time, is_available)
     VALUES ($1, CURRENT_DATE + 1, '10:00', '11:00', true)
     RETURNING id`,
    [psychId]
  );
  return res.rows[0].id;
}

// Helper: insert a valid appointment and return its id
async function insertValidAppointment(studentId, psychId, slotId) {
  const res = await pool.query(
    `INSERT INTO appointments (student_id, psychologist_id, slot_id, status, reason, format)
     VALUES ($1, $2, $3, 'scheduled', 'Test', 'online')
     RETURNING id`,
    [studentId, psychId, slotId]
  );
  return res.rows[0].id;
}

describe('DB Constraints: users table', () => {
  it('DB-C-1: insert user with role=hacker → check_violation (23514)', async () => {
    expect.assertions(1);
    try {
      await pool.query(
        `INSERT INTO users (email, password_hash, role, name)
         VALUES ('hacker@test.com', $1, 'hacker', 'Hacker')`,
        [PASSWORD_HASH]
      );
    } catch (err) {
      expect(err.code).toBe('23514');
    }
  });

  it('DB-C-2: insert user with duplicate email → unique_violation (23505)', async () => {
    expect.assertions(1);
    await insertValidStudent('dup@test.com');
    try {
      await pool.query(
        `INSERT INTO users (email, password_hash, role, name)
         VALUES ('dup@test.com', $1, 'student', 'Dup')`,
        [PASSWORD_HASH]
      );
    } catch (err) {
      expect(err.code).toBe('23505');
    }
  });
});

describe('DB Constraints: check_ins table', () => {
  it('DB-C-3: insert check_in with mood=6 → check_violation (23514)', async () => {
    expect.assertions(1);
    const userId = await insertValidStudent();
    try {
      await pool.query(
        `INSERT INTO check_ins (student_id, date, mood, stress, sleep, energy, productivity)
         VALUES ($1, CURRENT_DATE, 6, 3, 3, 3, 3)`,
        [userId]
      );
    } catch (err) {
      expect(err.code).toBe('23514');
    }
  });

  it('DB-C-4: insert check_in with mood=0 → check_violation (23514)', async () => {
    expect.assertions(1);
    const userId = await insertValidStudent();
    try {
      await pool.query(
        `INSERT INTO check_ins (student_id, date, mood, stress, sleep, energy, productivity)
         VALUES ($1, CURRENT_DATE, 0, 3, 3, 3, 3)`,
        [userId]
      );
    } catch (err) {
      expect(err.code).toBe('23514');
    }
  });
});

describe('DB Constraints: appointments table', () => {
  it('DB-C-5: insert appointment with status=invalid → check_violation (23514)', async () => {
    expect.assertions(1);
    const studentId = await insertValidStudent();
    const psychId = await insertValidPsych();
    const slotId = await insertValidSlot(psychId);
    try {
      await pool.query(
        `INSERT INTO appointments (student_id, psychologist_id, slot_id, status, format)
         VALUES ($1, $2, $3, 'invalid', 'online')`,
        [studentId, psychId, slotId]
      );
    } catch (err) {
      expect(err.code).toBe('23514');
    }
  });

  it('DB-C-6: insert appointment with format=telegram → check_violation (23514)', async () => {
    expect.assertions(1);
    const studentId = await insertValidStudent();
    const psychId = await insertValidPsych();
    const slotId = await insertValidSlot(psychId);
    try {
      await pool.query(
        `INSERT INTO appointments (student_id, psychologist_id, slot_id, status, format)
         VALUES ($1, $2, $3, 'scheduled', 'telegram')`,
        [studentId, psychId, slotId]
      );
    } catch (err) {
      expect(err.code).toBe('23514');
    }
  });

  it('DB-C-9: insert appointment with non-existent student_id → fk_violation (23503)', async () => {
    expect.assertions(1);
    const psychId = await insertValidPsych();
    const slotId = await insertValidSlot(psychId);
    try {
      await pool.query(
        `INSERT INTO appointments (student_id, psychologist_id, slot_id, status, format)
         VALUES (999999, $1, $2, 'scheduled', 'online')`,
        [psychId, slotId]
      );
    } catch (err) {
      expect(err.code).toBe('23503');
    }
  });
});

describe('DB Constraints: session_notes table', () => {
  it('DB-C-7: insert session_notes with condition_before=11 → check_violation (23514)', async () => {
    expect.assertions(1);
    const studentId = await insertValidStudent();
    const psychId = await insertValidPsych();
    const slotId = await insertValidSlot(psychId);
    const apptId = await insertValidAppointment(studentId, psychId, slotId);
    try {
      await pool.query(
        `INSERT INTO session_notes (appointment_id, psychologist_id, condition_before, condition_after, recommend_followup, tags, notes)
         VALUES ($1, $2, 11, 5, false, '', '')`,
        [apptId, psychId]
      );
    } catch (err) {
      expect(err.code).toBe('23514');
    }
  });

  it('DB-C-8: insert session_notes with condition_before=0 → check_violation (23514)', async () => {
    expect.assertions(1);
    const studentId = await insertValidStudent();
    const psychId = await insertValidPsych();
    const slotId = await insertValidSlot(psychId);
    const apptId = await insertValidAppointment(studentId, psychId, slotId);
    try {
      await pool.query(
        `INSERT INTO session_notes (appointment_id, psychologist_id, condition_before, condition_after, recommend_followup, tags, notes)
         VALUES ($1, $2, 0, 5, false, '', '')`,
        [apptId, psychId]
      );
    } catch (err) {
      expect(err.code).toBe('23514');
    }
  });
});

describe('DB Constraints: time_slots table', () => {
  it('DB-C-10: insert time_slot with non-existent psychologist_id → fk_violation (23503)', async () => {
    expect.assertions(1);
    try {
      await pool.query(
        `INSERT INTO time_slots (psychologist_id, date, start_time, end_time)
         VALUES (999999, CURRENT_DATE + 1, '10:00', '11:00')`
      );
    } catch (err) {
      expect(err.code).toBe('23503');
    }
  });
});
