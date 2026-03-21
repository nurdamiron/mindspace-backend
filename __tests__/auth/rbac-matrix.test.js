const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const { seedUsers, STUDENT_CREDS, PSYCH_CREDS, ADMIN_CREDS } = require('../fixtures');
const { loginViaApi } = require('../helpers/apiClient');

// Login ONCE per role — reuse tokens across all test.each cases to avoid rate limit
let tokens = {};

beforeAll(async () => {
  await clearDb();
  await seedUsers();
  const [s, p, a] = await Promise.all([
    loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password),
    loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password),
    loginViaApi(ADMIN_CREDS.email, ADMIN_CREDS.password),
  ]);
  tokens = { student: s.token, psychologist: p.token, admin: a.token };
});


// ─── RBAC Matrix ──────────────────────────────────────────────────────────────
// [actor, method, path, expectedStatus]
const rbacTable = [
  ['student',      'get', '/api/psychologist/schedule', 403],
  ['student',      'get', '/api/admin/dashboard',       403],
  ['psychologist', 'get', '/api/student/stats',         403],
  ['psychologist', 'get', '/api/admin/dashboard',       403],
  ['admin',        'get', '/api/student/stats',         403],
  ['admin',        'get', '/api/psychologist/schedule', 403],
  ['unauth',       'get', '/api/student/stats',         401],
  ['unauth',       'get', '/api/psychologist/schedule', 401],
  ['unauth',       'get', '/api/admin/dashboard',       401],
];

describe('RBAC access control matrix', () => {
  test.each(rbacTable)(
    '%s %s %s → HTTP %i',
    async (actor, method, path, expectedStatus) => {
      let req = request(app)[method](path);
      if (actor !== 'unauth') {
        req = req.set('Authorization', `Bearer ${tokens[actor]}`);
      }
      const res = await req;
      expect(res.status).toBe(expectedStatus);
    }
  );
});
