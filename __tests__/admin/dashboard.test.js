const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedUsers,
  seedCheckIn,
  ADMIN_CREDS,
  STUDENT_CREDS,
  PSYCH_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet } = require('../helpers/apiClient');

let adminToken, studentToken, psychToken;

beforeEach(async () => {
  await clearDb();
  await seedAll();
  adminToken   = (await loginViaApi(ADMIN_CREDS.email,   ADMIN_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,   PSYCH_CREDS.password)).token;
});


describe('GET /api/admin/dashboard', () => {
  it('TC-DB-1: with data → 200, all expected fields present', async () => {
    const res = await authGet(adminToken, '/api/admin/dashboard');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalStudents');
    expect(res.body).toHaveProperty('activeStudents');
    expect(res.body).toHaveProperty('sessions');
    expect(res.body).toHaveProperty('weeklyTrend');
    expect(res.body).toHaveProperty('facultyStats');
    expect(res.body).toHaveProperty('highStressStudents');
    expect(res.body).toHaveProperty('avgMetrics');
    expect(res.body).toHaveProperty('riskByFaculty');
    expect(Array.isArray(res.body.weeklyTrend)).toBe(true);
    expect(Array.isArray(res.body.facultyStats)).toBe(true);
    expect(Array.isArray(res.body.riskByFaculty)).toBe(true);
  });

  it('TC-DB-2: empty DB (no students) → 200, totalStudents="0"', async () => {
    await clearDb();
    // Seed admin only so we can still log in
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('test123', 10);
    await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ($1, $2, 'admin', 'Test Admin')
    `, [ADMIN_CREDS.email, hash]);
    const freshAdminToken = (await loginViaApi(ADMIN_CREDS.email, ADMIN_CREDS.password)).token;

    const res = await authGet(freshAdminToken, '/api/admin/dashboard');

    expect(res.status).toBe(200);
    expect(res.body.totalStudents).toBe('0');
  });

  it('TC-DB-3: student token → 403', async () => {
    const res = await authGet(studentToken, '/api/admin/dashboard');

    expect(res.status).toBe(403);
  });

  it('TC-DB-4: psychologist token → 403', async () => {
    const res = await authGet(psychToken, '/api/admin/dashboard');

    expect(res.status).toBe(403);
  });
});
