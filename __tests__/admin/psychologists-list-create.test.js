const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedUsers,
  ADMIN_CREDS,
  STUDENT_CREDS,
  PSYCH_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet, authPost } = require('../helpers/apiClient');

let adminToken, studentToken, psychToken, seeded;

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  adminToken   = (await loginViaApi(ADMIN_CREDS.email,   ADMIN_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,   PSYCH_CREDS.password)).token;
});


describe('GET /api/admin/psychologists', () => {
  it('TC-APL-1: → 200, array of psychologists with completed_sessions and total_students', async () => {
    const res = await authGet(adminToken, '/api/admin/psychologists');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const psych = res.body.find(p => p.email === PSYCH_CREDS.email);
    expect(psych).toBeDefined();
    expect(psych).toHaveProperty('completed_sessions');
    expect(psych).toHaveProperty('total_students');
    expect(psych).toHaveProperty('id');
    expect(psych).toHaveProperty('name');
    expect(psych).toHaveProperty('email');
    expect(psych).toHaveProperty('specialization');
  });

  it('TC-APL-2: student token → 403', async () => {
    const res = await authGet(studentToken, '/api/admin/psychologists');

    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/psychologists', () => {
  it('TC-APC-1: valid data → 201, returns new psychologist without password', async () => {
    const res = await authPost(adminToken, '/api/admin/psychologists', {
      email: 'newpsych@test.com',
      password: 'securepass',
      name: 'New Psychologist',
      specialization: 'Cognitive Therapy',
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.email).toBe('newpsych@test.com');
    expect(res.body.name).toBe('New Psychologist');
    expect(res.body.specialization).toBe('Cognitive Therapy');
    // No password hash in response
    expect(res.body).not.toHaveProperty('password_hash');
    expect(res.body).not.toHaveProperty('password');
  });

  it('TC-APC-2: DB record has role=psychologist', async () => {
    await authPost(adminToken, '/api/admin/psychologists', {
      email: 'newpsych2@test.com',
      password: 'securepass',
      name: 'New Psychologist 2',
      specialization: 'Depression',
    });

    const dbResult = await pool.query(
      'SELECT role FROM users WHERE email = $1',
      ['newpsych2@test.com']
    );

    expect(dbResult.rows.length).toBe(1);
    expect(dbResult.rows[0].role).toBe('psychologist');
  });

  it('TC-APC-3: duplicate email → 400 { error: "Email уже используется" } (NOT 409)', async () => {
    const res = await authPost(adminToken, '/api/admin/psychologists', {
      email: PSYCH_CREDS.email, // already exists
      password: 'securepass',
      name: 'Duplicate Psych',
      specialization: 'Anxiety',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email уже используется');
  });

  // BUG: no app-level validation for required email field
  // email=undefined → INSERT passes null → NOT NULL DB constraint fires → 500
  it('TC-APC-4: missing email → 500 (BUG: no app-level validation, DB NOT NULL constraint fires)', async () => {
    const res = await authPost(adminToken, '/api/admin/psychologists', {
      password: 'securepass',
      name: 'No Email Psych',
      specialization: 'Anxiety',
    });

    expect(res.status).toBe(500);
  });

  it('TC-APC-5: student token → 403', async () => {
    const res = await authPost(studentToken, '/api/admin/psychologists', {
      email: 'blocked@test.com',
      password: 'pass',
      name: 'Blocked',
    });

    expect(res.status).toBe(403);
  });

  it('TC-APC-6: psychologist token → 403', async () => {
    const res = await authPost(psychToken, '/api/admin/psychologists', {
      email: 'blocked2@test.com',
      password: 'pass',
      name: 'Blocked',
    });

    expect(res.status).toBe(403);
  });
});
