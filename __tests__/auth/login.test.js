const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const { seedUsers, STUDENT_CREDS, PSYCH_CREDS, ADMIN_CREDS } = require('../fixtures');
const { assertNoPasswordHash } = require('../helpers/apiClient');

beforeEach(async () => {
  await clearDb();
  await seedUsers();
});


describe('POST /api/auth/login', () => {
  // TC-1: Student login returns 200, token+user, and httpOnly refresh_token cookie
  it('TC-1: student login → 200, { token, user }, Set-Cookie refresh_token httpOnly', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send(STUDENT_CREDS);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.role).toBe('student');
    expect(res.body.user.email).toBe(STUDENT_CREDS.email);

    const setCookieHeader = res.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();
    const refreshCookie = setCookieHeader.find(c => c.startsWith('refresh_token='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
  });

  // TC-2: Psychologist login returns correct role
  it('TC-2: psychologist login → 200, user.role=psychologist', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send(PSYCH_CREDS);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('psychologist');
    expect(res.body.user.email).toBe(PSYCH_CREDS.email);
  });

  // TC-3: Admin login returns correct role
  it('TC-3: admin login → 200, user.role=admin', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send(ADMIN_CREDS);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.email).toBe(ADMIN_CREDS.email);
  });

  // TC-4: Wrong password → 401
  it('TC-4: wrong password → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: STUDENT_CREDS.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Неверный email или пароль');
  });

  // TC-5: Non-existent email → 401
  it('TC-5: non-existent email → 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'anypassword' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Неверный email или пароль');
  });

  // TC-6: Missing email → 400
  it('TC-6: missing email → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'somepassword' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email и пароль обязательны');
  });

  // TC-7: Missing password → 400
  it('TC-7: missing password → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: STUDENT_CREDS.email });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email и пароль обязательны');
  });

  // TC-8: Missing both email and password → 400
  it('TC-8: missing both email and password → 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email и пароль обязательны');
  });

  // TC-9: password_hash must NOT be in the response
  it('TC-9: password_hash is NOT in the response', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send(STUDENT_CREDS);

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
  });
});
