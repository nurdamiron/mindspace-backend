const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const { seedUsers, STUDENT_CREDS, PSYCH_CREDS, ADMIN_CREDS } = require('../fixtures');
const { loginViaApi, authGet, assertNoPasswordHash } = require('../helpers/apiClient');

let studentToken, psychToken, adminToken, users;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  const studentLogin = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = studentLogin.token;
  const psychLogin = await loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password);
  psychToken = psychLogin.token;
  const adminLogin = await loginViaApi(ADMIN_CREDS.email, ADMIN_CREDS.password);
  adminToken = adminLogin.token;
});


function assertNoSensitiveData(body) {
  const str = JSON.stringify(body);
  expect(str).not.toContain('password_hash');
  // Check 'password' doesn't appear as a key (it shouldn't since login returns user without password)
}

describe('Security: password_hash never leaks in API responses', () => {
  it('SEC-PH-1: POST /auth/register does not expose password_hash', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'New Student',
        email: 'newstudent@test.com',
        password: 'test123',
        faculty: 'IT',
        course: 1,
      });

    expect(res.status).toBe(201);
    assertNoPasswordHash(res.body);
    assertNoSensitiveData(res.body);
  });

  it('SEC-PH-2: POST /auth/login does not expose password_hash', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send(STUDENT_CREDS);

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
    assertNoSensitiveData(res.body);
  });

  it('SEC-PH-3: GET /auth/me does not expose password_hash', async () => {
    const res = await authGet(studentToken, '/api/auth/me');

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
    assertNoSensitiveData(res.body);
  });

  it('SEC-PH-4: GET /student/profile does not expose password_hash', async () => {
    const res = await authGet(studentToken, '/api/student/profile');

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
    assertNoSensitiveData(res.body);
  });

  it('SEC-PH-5: GET /psychologist/profile does not expose password_hash', async () => {
    const res = await authGet(psychToken, '/api/psychologist/profile');

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
    assertNoSensitiveData(res.body);
  });

  it('SEC-PH-6: GET /admin/psychologists does not expose password_hash', async () => {
    const res = await authGet(adminToken, '/api/admin/psychologists');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    assertNoPasswordHash(res.body);
    assertNoSensitiveData(res.body);
  });

  it('SEC-PH-7: GET /admin/students does not expose password_hash', async () => {
    const res = await authGet(adminToken, '/api/admin/students');

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
    assertNoSensitiveData(res.body);
  });

  it('SEC-PH-8: GET /admin/students/:id does not expose password_hash', async () => {
    const res = await authGet(adminToken, `/api/admin/students/${users.student.id}`);

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
    assertNoSensitiveData(res.body);
  });
});
