const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedUsers,
  seedSlot,
  seedAppointment,
  PSYCH_CREDS,
  STUDENT_CREDS,
  ADMIN_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet } = require('../helpers/apiClient');

let psychToken, studentToken, adminToken, seeded;

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,   PSYCH_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
  adminToken   = (await loginViaApi(ADMIN_CREDS.email,   ADMIN_CREDS.password)).token;
});


describe('GET /api/psychologist/students/:id', () => {
  it('TC-SC-1: student has appointment with this psych → 200, expected shape', async () => {
    const res = await authGet(psychToken, `/api/psychologist/students/${seeded.student.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('student');
    expect(res.body).toHaveProperty('checkIns');
    expect(res.body).toHaveProperty('appointments');
    expect(res.body).toHaveProperty('surveys');
    expect(Array.isArray(res.body.checkIns)).toBe(true);
    expect(Array.isArray(res.body.appointments)).toBe(true);
    expect(Array.isArray(res.body.surveys)).toBe(true);
  });

  it('TC-SC-2: second psychologist has no appointment with this student → 403', async () => {
    // Create a second psychologist in the DB
    const psych2Result = await pool.query(`
      INSERT INTO users (email, password_hash, role, name, specialization)
      VALUES ('psych2@test.com', 'hash', 'psychologist', 'Psych Two', 'Stress')
      RETURNING id, email
    `);
    const psych2 = psych2Result.rows[0];

    // Login as psych2 — need a real password hash
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('test123', 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, psych2.id]);
    const psych2Token = (await loginViaApi('psych2@test.com', 'test123')).token;

    const res = await authGet(psych2Token, `/api/psychologist/students/${seeded.student.id}`);

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  it('TC-SC-3: non-existent student ID → 403 (access check fires first, no appointment found)', async () => {
    const res = await authGet(psychToken, '/api/psychologist/students/99999');

    // Access check: no appointment for student 99999 with this psych → 403
    expect(res.status).toBe(403);
  });

  it('TC-SC-4: admin token → 403', async () => {
    const res = await authGet(adminToken, `/api/psychologist/students/${seeded.student.id}`);

    expect(res.status).toBe(403);
  });

  it('TC-SC-5: student token → 403', async () => {
    const res = await authGet(studentToken, `/api/psychologist/students/${seeded.student.id}`);

    expect(res.status).toBe(403);
  });
});
