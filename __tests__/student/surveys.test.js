const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const {
  seedUsers,
  STUDENT_CREDS,
  ADMIN_CREDS,
} = require('../fixtures');
const { loginViaApi, authPost, authGet } = require('../helpers/apiClient');

let studentToken, adminToken, users;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  const student = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = student.token;
  const admin = await loginViaApi(ADMIN_CREDS.email, ADMIN_CREDS.password);
  adminToken = admin.token;
});


describe('POST /api/student/surveys', () => {
  it('TC-SV-1: valid PHQ-9 answers → 201, score=13, risk_level=moderate', async () => {
    const res = await authPost(studentToken, '/api/student/surveys', {
      type: 'PHQ-9',
      answers: { q1: 5, q2: 4, q3: 4 },
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.score).toBe(13);
    expect(res.body.risk_level).toBe('moderate');
    expect(res.body.type).toBe('PHQ-9');
  });

  it('TC-SV-2: high risk answers (sum > 16) → risk_level=high', async () => {
    // 6 + 6 + 5 = 17 > 16
    const res = await authPost(studentToken, '/api/student/surveys', {
      type: 'PHQ-9',
      answers: { q1: 6, q2: 6, q3: 5 },
    });

    expect(res.status).toBe(201);
    expect(res.body.score).toBe(17);
    expect(res.body.risk_level).toBe('high');
  });

  it('TC-SV-3: low risk answers (sum <= 10) → risk_level=low', async () => {
    // 2 + 3 + 2 = 7 <= 10
    const res = await authPost(studentToken, '/api/student/surveys', {
      type: 'PHQ-9',
      answers: { q1: 2, q2: 3, q3: 2 },
    });

    expect(res.status).toBe(201);
    expect(res.body.score).toBe(7);
    expect(res.body.risk_level).toBe('low');
  });

  it('TC-SV-4: empty answers {} → 201, score=0, risk_level=low (not an error)', async () => {
    // Object.values({}) returns [], reduce on [] = 0 (initial value), so score=0, risk_level='low'
    const res = await authPost(studentToken, '/api/student/surveys', {
      type: 'PHQ-9',
      answers: {},
    });

    expect(res.status).toBe(201);
    expect(res.body.score).toBe(0);
    expect(res.body.risk_level).toBe('low');
  });

  // BUG: missing 'answers' field → Object.values(undefined) throws TypeError → 500
  it('TC-SV-5: missing answers field → 500 (BUG: Object.values(undefined) crashes)', async () => {
    const res = await authPost(studentToken, '/api/student/surveys', {
      type: 'PHQ-9',
    });

    expect(res.status).toBe(500);
  });

  it('TC-SV-6: integration — high-risk student appears in admin GET /admin/students?risk=high', async () => {
    // Submit a high-risk survey for the student
    await authPost(studentToken, '/api/student/surveys', {
      type: 'PHQ-9',
      answers: { q1: 6, q2: 6, q3: 5 }, // score=17, risk=high
    });

    const res = await authGet(adminToken, '/api/admin/students?risk=high');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('students');
    const studentIds = res.body.students.map(s => s.id);
    expect(studentIds).toContain(users.student.id);
  });

  it('TC-SV-7: low-risk student does NOT appear in admin GET /admin/students?risk=high', async () => {
    // Submit a low-risk survey
    await authPost(studentToken, '/api/student/surveys', {
      type: 'PHQ-9',
      answers: { q1: 1, q2: 2, q3: 1 }, // score=4, risk=low
    });

    const res = await authGet(adminToken, '/api/admin/students?risk=high');

    expect(res.status).toBe(200);
    const studentIds = (res.body.students || []).map(s => s.id);
    expect(studentIds).not.toContain(users.student.id);
  });
});
