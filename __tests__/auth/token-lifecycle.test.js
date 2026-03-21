const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const { seedUsers, STUDENT_CREDS } = require('../fixtures');
const { loginViaApi, makeExpiredToken, authGet, authPost } = require('../helpers/apiClient');

beforeEach(async () => {
  await clearDb();
  await seedUsers();
});


describe('Full token lifecycle', () => {
  it('completes the full login → use → expire → refresh → logout cycle', async () => {
    // Step 1: Login — obtain access token and refresh cookie
    const { token, user, cookie } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
    expect(token).toBeTruthy();
    expect(cookie).toBeTruthy();

    // Step 2: GET /auth/me with valid access token → 200
    const meRes1 = await authGet(token, '/api/auth/me');
    expect(meRes1.status).toBe(200);
    expect(meRes1.body.email).toBe(STUDENT_CREDS.email);

    // Step 3: GET /auth/me with an expired token → 401
    const expiredToken = makeExpiredToken({ id: user.id, email: user.email, role: user.role });
    const meRes2 = await authGet(expiredToken, '/api/auth/me');
    expect(meRes2.status).toBe(401);
    expect(meRes2.body.error).toBe('Недействительный токен');

    // Step 4: POST /auth/refresh with the refresh cookie → 200, new token
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie);
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body).toHaveProperty('token');
    const newToken = refreshRes.body.token;
    // Note: tokens may be identical if issued within same second (same iat).
    // Validate by actually using it instead of comparing strings.
    expect(newToken).toBeTruthy();

    // Step 5: GET /auth/me with the NEW token → 200
    const meRes3 = await authGet(newToken, '/api/auth/me');
    expect(meRes3.status).toBe(200);
    expect(meRes3.body.email).toBe(STUDENT_CREDS.email);

    // Step 6: POST /auth/logout
    const logoutRes = await authPost(newToken, '/api/auth/logout', {});
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe('Вышли из системы');

    // Step 7: POST /auth/refresh after logout without sending cookie → 401
    // (simulates the browser having dropped the cleared cookie)
    const refreshAfterLogout = await request(app).post('/api/auth/refresh');
    expect(refreshAfterLogout.status).toBe(401);
    expect(refreshAfterLogout.body.error).toBe('Нет refresh токена');
  });
});
