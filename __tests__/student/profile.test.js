const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const {
  seedUsers,
  STUDENT_CREDS,
  PSYCH_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet, authPatch, assertNoPasswordHash } = require('../helpers/apiClient');

let studentToken, psychToken, users;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  const student = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = student.token;
  const psych = await loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password);
  psychToken = psych.token;
});


describe('GET /api/student/profile', () => {
  it('TC-PR-1: → 200, returns profile with expected fields', async () => {
    const res = await authGet(studentToken, '/api/student/profile');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('email');
    expect(res.body).toHaveProperty('faculty');
    expect(res.body).toHaveProperty('course');
    expect(res.body).toHaveProperty('gender');
    expect(res.body).toHaveProperty('age');
    expect(res.body.email).toBe(STUDENT_CREDS.email);
    expect(res.body.id).toBe(users.student.id);
  });

  it('TC-PR-2: response does NOT contain password_hash', async () => {
    const res = await authGet(studentToken, '/api/student/profile');

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
  });

  it('TC-PR-3: psychologist token → 403', async () => {
    const res = await authGet(psychToken, '/api/student/profile');

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/student/profile', () => {
  it('TC-PR-4: update name → 200, name is updated', async () => {
    const res = await authPatch(studentToken, '/api/student/profile', {
      name: 'Updated Name',
    });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Name');
    expect(res.body.email).toBe(STUDENT_CREDS.email);
  });

  it('TC-PR-5: update multiple fields → 200, all fields updated', async () => {
    const res = await authPatch(studentToken, '/api/student/profile', {
      name: 'New Name',
      faculty: 'Medicine',
      course: 4,
      gender: 'male',
      age: 22,
    });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
    expect(res.body.faculty).toBe('Medicine');
    expect(res.body.course).toBe(4);
    expect(res.body.gender).toBe('male');
    expect(res.body.age).toBe(22);
  });

  it('TC-PR-6: PATCH without name field → COALESCE keeps the old name', async () => {
    // First set a known name
    await authPatch(studentToken, '/api/student/profile', { name: 'Original Name' });

    // Patch without name — code does `name || null` which sends null,
    // COALESCE($1, name) with $1=null → keeps the existing name in DB
    const res = await authPatch(studentToken, '/api/student/profile', {
      faculty: 'Engineering',
    });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Original Name');
    expect(res.body.faculty).toBe('Engineering');
  });

  it('TC-PR-7: PATCH with faculty=null (not sent) → faculty cleared to null', async () => {
    // First set faculty
    await authPatch(studentToken, '/api/student/profile', {
      name: 'Test',
      faculty: 'Science',
    });

    // Now PATCH without faculty: code does `faculty || null` = null → DB sets faculty=null
    const res = await authPatch(studentToken, '/api/student/profile', {
      name: 'Test',
    });

    expect(res.status).toBe(200);
    // faculty is not sent → `faculty || null` = null → PATCH sets it to null (not COALESCE)
    expect(res.body.faculty).toBeNull();
  });

  it('TC-PR-8: response does NOT contain password_hash', async () => {
    const res = await authPatch(studentToken, '/api/student/profile', {
      name: 'Safe Name',
    });

    expect(res.status).toBe(200);
    assertNoPasswordHash(res.body);
  });

  it('TC-PR-9: psychologist token → 403', async () => {
    const res = await authPatch(psychToken, '/api/student/profile', {
      name: 'Hacked',
    });

    expect(res.status).toBe(403);
  });
});
