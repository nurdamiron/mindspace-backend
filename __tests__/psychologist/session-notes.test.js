const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedUsers,
  seedSlot,
  seedAppointment,
  PSYCH_CREDS,
  STUDENT_CREDS,
} = require('../fixtures');
const { loginViaApi, authPost } = require('../helpers/apiClient');

let psychToken, studentToken, seeded;

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,   PSYCH_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
});


describe('POST /api/psychologist/sessions/:appointmentId/notes', () => {
  it('TC-SN-1: happy path → 201, note created', async () => {
    const res = await authPost(
      psychToken,
      `/api/psychologist/sessions/${seeded.appointment.id}/notes`,
      {
        condition_before: 7,
        condition_after: 8,
        recommend_followup: true,
        tags: 'anxiety',
        notes: 'Good session',
      }
    );

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(res.body.condition_before).toBe(7);
    expect(res.body.condition_after).toBe(8);
    expect(res.body.recommend_followup).toBe(true);
    expect(res.body.tags).toBe('anxiety');
  });

  it('TC-SN-2: DB record is actually created after POST', async () => {
    await authPost(
      psychToken,
      `/api/psychologist/sessions/${seeded.appointment.id}/notes`,
      {
        condition_before: 5,
        condition_after: 7,
        recommend_followup: false,
        tags: 'stress',
        notes: 'Verify DB',
      }
    );

    const dbResult = await pool.query(
      'SELECT * FROM session_notes WHERE appointment_id = $1',
      [seeded.appointment.id]
    );

    expect(dbResult.rows.length).toBe(1);
    expect(dbResult.rows[0].condition_before).toBe(5);
    expect(dbResult.rows[0].condition_after).toBe(7);
  });

  // BUG: condition_before=11 exceeds DB CHECK constraint (1-10) but app has no validation
  // → DB raises constraint violation → 500 instead of 400
  it('TC-SN-3: condition_before=11 → 500 (BUG: no app-level range validation, DB CHECK fires)', async () => {
    const res = await authPost(
      psychToken,
      `/api/psychologist/sessions/${seeded.appointment.id}/notes`,
      {
        condition_before: 11,
        condition_after: 8,
      }
    );

    expect(res.status).toBe(500);
  });

  // BUG: condition_after=0 violates DB CHECK constraint (1-10) → 500 instead of 400
  it('TC-SN-4: condition_after=0 → 500 (BUG: no app-level range validation, DB CHECK fires)', async () => {
    const res = await authPost(
      psychToken,
      `/api/psychologist/sessions/${seeded.appointment.id}/notes`,
      {
        condition_before: 5,
        condition_after: 0,
      }
    );

    expect(res.status).toBe(500);
  });

  it('TC-SN-5: appointment belongs to another psychologist → 404', async () => {
    // Create a second psychologist with a real password hash and their own appointment
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('test123', 10);
    const psych2Result = await pool.query(`
      INSERT INTO users (email, password_hash, role, name, specialization)
      VALUES ('psych2@test.com', $1, 'psychologist', 'Psych Two', 'Stress')
      RETURNING id
    `, [hash]);
    const psych2Id = psych2Result.rows[0].id;
    const psych2Token = (await loginViaApi('psych2@test.com', 'test123')).token;

    // psych2 tries to add notes to psych1's appointment
    const res = await authPost(
      psych2Token,
      `/api/psychologist/sessions/${seeded.appointment.id}/notes`,
      {
        condition_before: 5,
        condition_after: 7,
      }
    );

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('TC-SN-6: non-existent appointmentId → 404', async () => {
    const res = await authPost(
      psychToken,
      '/api/psychologist/sessions/99999/notes',
      {
        condition_before: 5,
        condition_after: 7,
      }
    );

    expect(res.status).toBe(404);
  });

  // BUG: no uniqueness constraint on session_notes per appointment
  // → second POST to same appointment creates a second record and returns 201
  it('TC-SN-7: duplicate notes on same appointment → 201 (BUG: should prevent duplicates, no uniqueness constraint)', async () => {
    await authPost(
      psychToken,
      `/api/psychologist/sessions/${seeded.appointment.id}/notes`,
      { condition_before: 5, condition_after: 7, notes: 'First' }
    );

    const res = await authPost(
      psychToken,
      `/api/psychologist/sessions/${seeded.appointment.id}/notes`,
      { condition_before: 6, condition_after: 8, notes: 'Second' }
    );

    expect(res.status).toBe(201);

    // Confirm two rows exist
    const dbResult = await pool.query(
      'SELECT id FROM session_notes WHERE appointment_id = $1',
      [seeded.appointment.id]
    );
    expect(dbResult.rows.length).toBe(2);
  });

  it('TC-SN-8: student token → 403', async () => {
    const res = await authPost(
      studentToken,
      `/api/psychologist/sessions/${seeded.appointment.id}/notes`,
      { condition_before: 5, condition_after: 7 }
    );

    expect(res.status).toBe(403);
  });
});
