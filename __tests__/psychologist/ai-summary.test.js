const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedUsers,
  PSYCH_CREDS,
  STUDENT_CREDS,
} = require('../fixtures');
const { loginViaApi, authPost } = require('../helpers/apiClient');

let psychToken, studentToken, seeded;

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,   PSYCH_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
});


describe('POST /api/psychologist/students/:id/ai-summary', () => {
  it('TC-AI-1: no appointment between psych and student → 403', async () => {
    // Create a student with no appointment with this psych
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('test123', 10);
    const otherStudentResult = await pool.query(`
      INSERT INTO users (email, password_hash, role, name, faculty, course)
      VALUES ('noappointment@test.com', $1, 'student', 'No Appt Student', 'IT', 1)
      RETURNING id
    `, [hash]);
    const otherStudentId = otherStudentResult.rows[0].id;

    const res = await authPost(
      psychToken,
      `/api/psychologist/students/${otherStudentId}/ai-summary`,
      {}
    );

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  it('TC-AI-2: has appointment but no PERPLEXITY_API_KEY → 503', async () => {
    // .env.test has no PERPLEXITY_API_KEY, so the check fires after access check passes
    const originalKey = process.env.PERPLEXITY_API_KEY;
    delete process.env.PERPLEXITY_API_KEY;

    const res = await authPost(
      psychToken,
      `/api/psychologist/students/${seeded.student.id}/ai-summary`,
      {}
    );

    // Restore env var if it was set (it should be empty in test env)
    if (originalKey !== undefined) process.env.PERPLEXITY_API_KEY = originalKey;

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI-сервис недоступен');
  });

  it('TC-AI-3: student token → 403', async () => {
    const res = await authPost(
      studentToken,
      `/api/psychologist/students/${seeded.student.id}/ai-summary`,
      {}
    );

    expect(res.status).toBe(403);
  });
});
