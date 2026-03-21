const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const {
  seedUsers,
  seedCheckIn,
  STUDENT_CREDS,
  PSYCH_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet, authPost } = require('../helpers/apiClient');

let studentToken, psychToken, users;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  const student = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = student.token;
  const psych = await loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password);
  psychToken = psych.token;
});


describe('POST /api/student/check-ins', () => {
  it('TC-CI-1: all fields provided → 201, returns created check-in', async () => {
    const res = await authPost(studentToken, '/api/student/check-ins', {
      mood: 4,
      stress: 2,
      sleep: 5,
      energy: 3,
      productivity: 4,
      notes: 'Feeling good today',
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.mood).toBe(4);
    expect(res.body.stress).toBe(2);
    expect(res.body.sleep).toBe(5);
    expect(res.body.energy).toBe(3);
    expect(res.body.productivity).toBe(4);
    expect(res.body.notes).toBe('Feeling good today');
    expect(res.body.student_id).toBe(users.student.id);
  });

  it('TC-CI-2: notes not provided → 201, notes is null', async () => {
    const res = await authPost(studentToken, '/api/student/check-ins', {
      mood: 3,
      stress: 3,
      sleep: 3,
      energy: 3,
      productivity: 3,
    });

    expect(res.status).toBe(201);
    expect(res.body.notes).toBeNull();
  });

  // BUG: app doesn't validate mood range (1-5), should return 400 but instead
  // passes the value to PostgreSQL which enforces a CHECK constraint → 500
  it('TC-CI-3: mood=6 (out of range) → 500 (BUG: should be 400, no app-level validation)', async () => {
    const res = await authPost(studentToken, '/api/student/check-ins', {
      mood: 6,
      stress: 3,
      sleep: 3,
      energy: 3,
      productivity: 3,
    });

    expect(res.status).toBe(500);
  });

  // BUG: mood=0 violates DB CHECK constraint (1-5) → 500 instead of 400
  it('TC-CI-4: mood=0 (below range) → 500 (BUG: should be 400, no app-level validation)', async () => {
    const res = await authPost(studentToken, '/api/student/check-ins', {
      mood: 0,
      stress: 3,
      sleep: 3,
      energy: 3,
      productivity: 3,
    });

    expect(res.status).toBe(500);
  });

  // NOTE: PostgreSQL CHECK constraints ignore NULL values (NULL is not between 1 AND 5 evaluates to NULL/unknown,
  // which doesn't fail CHECK). So missing mood → null → INSERT succeeds → 201 with null mood.
  // BUG: app should validate mood is required and between 1-5, but currently it doesn't.
  it('TC-CI-5: missing mood → 201 (BUG: NULL bypasses PG CHECK, app should validate)', async () => {
    const res = await authPost(studentToken, '/api/student/check-ins', {
      stress: 3,
      sleep: 3,
      energy: 3,
      productivity: 3,
    });

    expect(res.status).toBe(201);
    expect(res.body.mood).toBeNull(); // NULL passes PG CHECK constraint
  });

  it('TC-CI-6: psychologist token → 403', async () => {
    const res = await authPost(psychToken, '/api/student/check-ins', {
      mood: 3,
      stress: 3,
      sleep: 3,
      energy: 3,
      productivity: 3,
    });

    expect(res.status).toBe(403);
  });
});

describe('GET /api/student/check-ins', () => {
  it('TC-CI-7: default (no ?days param) → 200, returns array', async () => {
    await seedCheckIn(users.student.id, { mood: 3, daysAgo: 0 });
    await seedCheckIn(users.student.id, { mood: 4, daysAgo: 5 });

    const res = await authGet(studentToken, '/api/student/check-ins');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
  });

  it('TC-CI-8: ?days=7 → 200, only returns check-ins within 7 days', async () => {
    await seedCheckIn(users.student.id, { mood: 3, daysAgo: 3 });
    await seedCheckIn(users.student.id, { mood: 4, daysAgo: 20 }); // outside 7-day window

    const res = await authGet(studentToken, '/api/student/check-ins?days=7');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it('TC-CI-9: no check-ins → 200, empty array', async () => {
    const res = await authGet(studentToken, '/api/student/check-ins');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('TC-CI-10: psychologist token → 403', async () => {
    const res = await authGet(psychToken, '/api/student/check-ins');

    expect(res.status).toBe(403);
  });
});
