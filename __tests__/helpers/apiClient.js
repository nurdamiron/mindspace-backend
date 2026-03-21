const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');

const JWT_SECRET = process.env.JWT_SECRET || 'mental-health-platform-secret-key-2024';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'mental-health-platform-refresh-secret-2024';

/**
 * Login via the API and return { token, user, cookie }
 */
async function loginViaApi(email, password) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  }

  const setCookieHeader = res.headers['set-cookie'] || [];
  const refreshCookie = setCookieHeader.find(c => c.startsWith('refresh_token='));

  return {
    token: res.body.token,
    user: res.body.user,
    cookie: refreshCookie || '',
    res,
  };
}

/**
 * Create an expired JWT for testing token expiry scenarios.
 */
function makeExpiredToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' });
}

/**
 * Create a valid refresh token for a given user id.
 */
function makeRefreshToken(userId) {
  return jwt.sign({ id: userId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

/**
 * Shorthand authenticated request helpers.
 */
const authGet    = (token, path) => request(app).get(path).set('Authorization', `Bearer ${token}`);
const authPost   = (token, path, body) => request(app).post(path).set('Authorization', `Bearer ${token}`).send(body);
const authPatch  = (token, path, body) => request(app).patch(path).set('Authorization', `Bearer ${token}`).send(body);
const authDelete = (token, path) => request(app).delete(path).set('Authorization', `Bearer ${token}`);

/**
 * Assert that a response body does NOT contain password_hash anywhere.
 */
function assertNoPasswordHash(body) {
  const str = JSON.stringify(body);
  expect(str).not.toContain('password_hash');
  expect(str).not.toContain('password');
}

module.exports = {
  loginViaApi,
  makeExpiredToken,
  makeRefreshToken,
  authGet,
  authPost,
  authPatch,
  authDelete,
  assertNoPasswordHash,
};
