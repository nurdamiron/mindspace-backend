const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const { seedUsers, STUDENT_CREDS } = require('../fixtures');
const { loginViaApi, makeExpiredToken, authGet, assertNoPasswordHash } = require('../helpers/apiClient');

beforeEach(async () => {
  await clearDb();
  await seedUsers();
});


describe('GET /api/auth/me', () => {
  // TC-1: Valid access token → 200, user object, NO password_hash
  it('TC-1: valid token → 200, user object, no password_hash', async () => {
    const { token, user } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);

    const res = await authGet(token, '/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('email', STUDENT_CREDS.email);
    expect(res.body).toHaveProperty('role', 'student');
    assertNoPasswordHash(res.body);
  });

  // TC-2: No Authorization header → 401
  it('TC-2: no token → 401', async () => {
    const res = await request(app).get('/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Требуется авторизация');
  });

  // TC-3: Fake/malformed token → 401
  it('TC-3: fake/malformed token → 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer this.is.not.a.real.token');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Недействительный токен');
  });

  // TC-4: Expired token (signed with valid secret but expiresIn=-1s) → 401
  it('TC-4: expired token → 401', async () => {
    const { user } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
    const expiredToken = makeExpiredToken({ id: user.id, email: user.email, role: user.role });

    const res = await authGet(expiredToken, '/api/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Недействительный токен');
  });
});
