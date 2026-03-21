const { clearDb } = require('../setup/db');
const {
  seedUsers,
  PSYCH_CREDS,
  STUDENT_CREDS,
  ADMIN_CREDS,
} = require('../fixtures');
const {
  loginViaApi,
  authGet,
  authPatch,
  assertNoPasswordHash,
} = require('../helpers/apiClient');

let psychToken, studentToken, adminToken, users;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,    PSYCH_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email,  STUDENT_CREDS.password)).token;
  adminToken   = (await loginViaApi(ADMIN_CREDS.email,    ADMIN_CREDS.password)).token;
});


describe('GET /api/psychologist/profile', () => {
  it('TC-PP-1: own profile → 200, expected fields present', async () => {
    const res = await authGet(psychToken, '/api/psychologist/profile');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('email');
    expect(res.body).toHaveProperty('specialization');
    expect(res.body).toHaveProperty('languages');
    expect(res.body).toHaveProperty('experience_years');
    expect(res.body).toHaveProperty('bio');
    expect(res.body.email).toBe(PSYCH_CREDS.email);
  });

  it('TC-PP-2: response does not contain password_hash', async () => {
    const res = await authGet(psychToken, '/api/psychologist/profile');

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
  });

  it('TC-PP-3: student token → 403', async () => {
    const res = await authGet(studentToken, '/api/psychologist/profile');

    expect(res.status).toBe(403);
  });

  it('TC-PP-4: admin token → 403', async () => {
    const res = await authGet(adminToken, '/api/psychologist/profile');

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/psychologist/profile', () => {
  it('TC-PP-5: valid update → 200, returns updated profile', async () => {
    const res = await authPatch(psychToken, '/api/psychologist/profile', {
      name: 'New Name',
      specialization: 'Depression',
      bio: 'test bio',
    });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    expect(res.body.specialization).toBe('Depression');
    expect(res.body.bio).toBe('test bio');
  });

  it('TC-PP-6: update response does not contain password_hash', async () => {
    const res = await authPatch(psychToken, '/api/psychologist/profile', {
      name: 'Updated Name',
    });

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
  });

  it('TC-PP-7: student token → 403', async () => {
    const res = await authPatch(studentToken, '/api/psychologist/profile', {
      name: 'Hacker',
    });

    expect(res.status).toBe(403);
  });

  it('TC-PP-8: admin token → 403', async () => {
    const res = await authPatch(adminToken, '/api/psychologist/profile', {
      name: 'Hacker',
    });

    expect(res.status).toBe(403);
  });
});
