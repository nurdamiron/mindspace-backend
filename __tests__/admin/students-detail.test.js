const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedCheckIn,
  seedSurvey,
  ADMIN_CREDS,
  STUDENT_CREDS,
  PSYCH_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet, assertNoPasswordHash } = require('../helpers/apiClient');

let adminToken, studentToken, psychToken, seeded;

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  await seedCheckIn(seeded.student.id, { mood: 4, stress: 2 });
  await seedSurvey(seeded.student.id, 'low');

  adminToken   = (await loginViaApi(ADMIN_CREDS.email,   ADMIN_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,   PSYCH_CREDS.password)).token;
});


describe('GET /api/admin/students/:id', () => {
  it('TC-ASTD-1: existing student → 200, { student, checkIns, appointments, surveys }', async () => {
    const res = await authGet(adminToken, `/api/admin/students/${seeded.student.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('student');
    expect(res.body).toHaveProperty('checkIns');
    expect(res.body).toHaveProperty('appointments');
    expect(res.body).toHaveProperty('surveys');
    expect(Array.isArray(res.body.checkIns)).toBe(true);
    expect(Array.isArray(res.body.appointments)).toBe(true);
    expect(Array.isArray(res.body.surveys)).toBe(true);
  });

  it('TC-ASTD-2: student object has expected fields and no password_hash', async () => {
    const res = await authGet(adminToken, `/api/admin/students/${seeded.student.id}`);

    expect(res.status).toBe(200);
    const s = res.body.student;
    expect(s).toHaveProperty('id');
    expect(s).toHaveProperty('name');
    expect(s).toHaveProperty('email');
    expect(s).toHaveProperty('faculty');
    expect(s).toHaveProperty('course');
    assertNoPasswordHash(res.body);
  });

  it('TC-ASTD-3: non-existent student ID → 404 { error: "Студент не найден" }', async () => {
    const res = await authGet(adminToken, '/api/admin/students/99999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Студент не найден');
  });

  it('TC-ASTD-4: psychologist ID (wrong role) → 404 (WHERE role=student does not match)', async () => {
    const res = await authGet(adminToken, `/api/admin/students/${seeded.psych.id}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Студент не найден');
  });

  it('TC-ASTD-5: student token → 403', async () => {
    const res = await authGet(studentToken, `/api/admin/students/${seeded.student.id}`);

    expect(res.status).toBe(403);
  });

  it('TC-ASTD-6: psychologist token → 403', async () => {
    const res = await authGet(psychToken, `/api/admin/students/${seeded.student.id}`);

    expect(res.status).toBe(403);
  });
});
