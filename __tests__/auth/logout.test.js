const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const { seedUsers, STUDENT_CREDS } = require('../fixtures');
const { loginViaApi, authPost } = require('../helpers/apiClient');

beforeEach(async () => {
  await clearDb();
  await seedUsers();
});


describe('POST /api/auth/logout', () => {
  // TC-1: Logout returns 200 with success message
  it('TC-1: logout → 200, { message: Вышли из системы }', async () => {
    const { token } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);

    const res = await authPost(token, '/api/auth/logout', {});

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Вышли из системы');
  });

  // TC-2: After logout the Set-Cookie header clears the refresh_token cookie
  it('TC-2: logout clears refresh_token cookie (Set-Cookie header present)', async () => {
    const { token } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);

    const res = await authPost(token, '/api/auth/logout', {});

    expect(res.status).toBe(200);

    // The server must send a Set-Cookie header that clears the refresh_token
    const setCookieHeader = res.headers['set-cookie'];
    expect(setCookieHeader).toBeDefined();

    const refreshClearCookie = setCookieHeader.find(c => c.startsWith('refresh_token='));
    expect(refreshClearCookie).toBeDefined();

    // Cookie should be cleared: either empty value or Expires in the past or Max-Age=0
    const isCleared =
      refreshClearCookie.includes('refresh_token=;') ||
      refreshClearCookie.match(/refresh_token=\s*;/) ||
      refreshClearCookie.includes('Expires=Thu, 01 Jan 1970') ||
      refreshClearCookie.includes('Max-Age=0');
    expect(isCleared).toBe(true);
  });

  // TC-3: After logout, POST /auth/refresh has no cookie → 401
  it('TC-3: after logout, POST /auth/refresh without cookie → 401', async () => {
    const { token } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);

    // Log out (the client-side cookie is gone; we simulate by NOT sending the cookie)
    await authPost(token, '/api/auth/logout', {});

    // Attempt refresh without any cookie
    const refreshRes = await request(app).post('/api/auth/refresh');

    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.error).toBe('Нет refresh токена');
  });
});
