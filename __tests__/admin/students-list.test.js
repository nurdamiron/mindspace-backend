const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedSurvey,
  seedCheckIn,
  ADMIN_CREDS,
  STUDENT_CREDS,
  PSYCH_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet } = require('../helpers/apiClient');

let adminToken, studentToken, psychToken, seeded;

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  // Seed a high-risk survey for the main student
  await seedSurvey(seeded.student.id, 'high');
  // Seed a check-in for the main student
  await seedCheckIn(seeded.student.id, { mood: 3, stress: 4 });

  adminToken   = (await loginViaApi(ADMIN_CREDS.email,   ADMIN_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,   PSYCH_CREDS.password)).token;
});


describe('GET /api/admin/students', () => {
  it('TC-ASTL-1: default → 200, { students, total, page, limit, faculties }', async () => {
    const res = await authGet(adminToken, '/api/admin/students');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('students');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('faculties');
    expect(Array.isArray(res.body.students)).toBe(true);
    expect(Array.isArray(res.body.faculties)).toBe(true);
    expect(res.body.students.length).toBeGreaterThanOrEqual(1);
  });

  it('TC-ASTL-2: ?search=student → filters by name/email', async () => {
    const res = await authGet(adminToken, '/api/admin/students?search=student');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.students)).toBe(true);
    // Both seeded students have "student" in email
    expect(res.body.students.length).toBeGreaterThanOrEqual(1);
    res.body.students.forEach(s => {
      const matchesName  = s.name.toLowerCase().includes('student');
      const matchesEmail = s.email.toLowerCase().includes('student');
      expect(matchesName || matchesEmail).toBe(true);
    });
  });

  it('TC-ASTL-3: ?faculty=IT → only IT faculty students', async () => {
    const res = await authGet(adminToken, '/api/admin/students?faculty=IT');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.students)).toBe(true);
    res.body.students.forEach(s => {
      expect(s.faculty).toBe('IT');
    });
  });

  it('TC-ASTL-4: ?risk=high → only students with high risk survey', async () => {
    const res = await authGet(adminToken, '/api/admin/students?risk=high');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.students)).toBe(true);
    expect(res.body.students.length).toBeGreaterThanOrEqual(1);
    res.body.students.forEach(s => {
      expect(s.last_risk).toBe('high');
    });
  });

  it('TC-ASTL-5: ?page=1&limit=1 → returns 1 student, total >= 1', async () => {
    const res = await authGet(adminToken, '/api/admin/students?page=1&limit=1');

    expect(res.status).toBe(200);
    expect(res.body.students.length).toBe(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(1);
  });

  it('TC-ASTL-6: ?page=9999 → 200, students=[]', async () => {
    const res = await authGet(adminToken, '/api/admin/students?page=9999');

    expect(res.status).toBe(200);
    expect(res.body.students).toEqual([]);
  });

  it('TC-ASTL-7: student token → 403', async () => {
    const res = await authGet(studentToken, '/api/admin/students');

    expect(res.status).toBe(403);
  });

  it('TC-ASTL-8: psychologist token → 403', async () => {
    const res = await authGet(psychToken, '/api/admin/students');

    expect(res.status).toBe(403);
  });
});
