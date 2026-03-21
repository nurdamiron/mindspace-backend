const request = require('supertest');
const app = require('../../app');
const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedUsers,
  seedSlot,
  seedSlotUnavailable,
  STUDENT_CREDS,
  PSYCH_CREDS,
  ADMIN_CREDS,
} = require('../fixtures');
const { loginViaApi, authPost } = require('../helpers/apiClient');

let studentToken, psychToken, adminToken, users, slot;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  slot = await seedSlot(users.psych.id);
  const student = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = student.token;
  const psych = await loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password);
  psychToken = psych.token;
  const admin = await loginViaApi(ADMIN_CREDS.email, ADMIN_CREDS.password);
  adminToken = admin.token;
});


describe('POST /api/student/appointments', () => {
  it('TC-AC-1: valid slot → 201, appointment created with status=scheduled', async () => {
    const res = await authPost(studentToken, '/api/student/appointments', {
      psychologist_id: users.psych.id,
      slot_id: slot.id,
      reason: 'Stress management',
      format: 'online',
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.status).toBe('scheduled');
    expect(res.body.student_id).toBe(users.student.id);
    expect(res.body.slot_id).toBe(slot.id);
  });

  it('TC-AC-2: after booking, slot is_available=false in DB', async () => {
    await authPost(studentToken, '/api/student/appointments', {
      psychologist_id: users.psych.id,
      slot_id: slot.id,
    });

    const dbResult = await pool.query(
      'SELECT is_available FROM time_slots WHERE id = $1',
      [slot.id]
    );
    expect(dbResult.rows[0].is_available).toBe(false);
  });

  it('TC-AC-3: duplicate booking (second call with same slot_id) → 400 with Russian error', async () => {
    // First booking succeeds
    await authPost(studentToken, '/api/student/appointments', {
      psychologist_id: users.psych.id,
      slot_id: slot.id,
    });

    // Second booking with same slot should fail
    const res = await authPost(studentToken, '/api/student/appointments', {
      psychologist_id: users.psych.id,
      slot_id: slot.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Слот уже занят или не существует');
  });

  it('TC-AC-4: non-existent slot_id → 400', async () => {
    const res = await authPost(studentToken, '/api/student/appointments', {
      psychologist_id: users.psych.id,
      slot_id: 999999,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Слот уже занят или не существует');
  });

  it('TC-AC-5: slot that is already unavailable → 400', async () => {
    const unavailableSlot = await seedSlotUnavailable(users.psych.id);

    const res = await authPost(studentToken, '/api/student/appointments', {
      psychologist_id: users.psych.id,
      slot_id: unavailableSlot.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Слот уже занят или не существует');
  });

  it('TC-AC-6: missing slot_id (null) → 400 (slot not found)', async () => {
    const res = await authPost(studentToken, '/api/student/appointments', {
      psychologist_id: users.psych.id,
      slot_id: null,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Слот уже занят или не существует');
  });

  it('TC-AC-7: admin token → 403', async () => {
    const res = await authPost(adminToken, '/api/student/appointments', {
      psychologist_id: users.psych.id,
      slot_id: slot.id,
    });

    expect(res.status).toBe(403);
  });

  it('TC-AC-8: psychologist token → 403', async () => {
    const res = await authPost(psychToken, '/api/student/appointments', {
      psychologist_id: users.psych.id,
      slot_id: slot.id,
    });

    expect(res.status).toBe(403);
  });
});
