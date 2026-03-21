const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const { seedUsers, STUDENT_CREDS } = require('../fixtures');
const { loginViaApi, authGet } = require('../helpers/apiClient');

beforeEach(async () => {
  await clearDb();
  await seedUsers();
});


describe('POST /api/auth/refresh', () => {
  // TC-1: Valid refresh cookie → 200, { token }, new token is a valid JWT
  it('TC-1: valid refresh cookie → 200, { token }, new token is valid JWT', async () => {
    const { cookie } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
    expect(cookie).toBeTruthy();

    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');

    // Verify the returned token is a structurally valid JWT (3 dot-separated parts)
    const parts = res.body.token.split('.');
    expect(parts).toHaveLength(3);

    // Verify the token can be decoded
    const decoded = jwt.decode(res.body.token);
    expect(decoded).toHaveProperty('id');
    expect(decoded).toHaveProperty('role');
  });

  // TC-2: No cookie → 401
  it('TC-2: no cookie → 401', async () => {
    const res = await request(app).post('/api/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Нет refresh токена');
  });

  // TC-3: Fake/invalid refresh token value → 401
  it('TC-3: fake/invalid refresh token → 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refresh_token=totally.fake.refreshtoken');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Неверный или просроченный refresh токен');
  });

  // TC-4: After refresh, use new token for /auth/me → 200
  it('TC-4: new token from refresh works for GET /auth/me', async () => {
    const { cookie } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);

    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie);

    expect(refreshRes.status).toBe(200);
    const newToken = refreshRes.body.token;

    const meRes = await authGet(newToken, '/api/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body).toHaveProperty('email', STUDENT_CREDS.email);
  });
});
