const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedAll,
  STUDENT_CREDS,
  PSYCH_CREDS,
  ADMIN_CREDS,
} = require('../fixtures');
const { loginViaApi, authPost, authPatch, authDelete } = require('../helpers/apiClient');

let studentToken, psychToken, adminToken;
let seedData;

beforeEach(async () => {
  await clearDb();
  seedData = await seedAll();

  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
  psychToken = (await loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password)).token;
  adminToken = (await loginViaApi(ADMIN_CREDS.email, ADMIN_CREDS.password)).token;
});


describe('Idempotency: appointment booking', () => {
  it('IDEM-1: booking same slot twice → first 201, second 400', async () => {
    // seedAll already created an appointment and marked the slot unavailable.
    // Create a fresh available slot for this test.
    const newSlot = await pool.query(
      `INSERT INTO time_slots (psychologist_id, date, start_time, end_time, is_available)
       VALUES ($1, CURRENT_DATE + 2, '14:00', '15:00', true)
       RETURNING id`,
      [seedData.psych.id]
    );
    const freshSlotId = newSlot.rows[0].id;

    const first = await authPost(studentToken, '/api/student/appointments', {
      psychologist_id: seedData.psych.id,
      slot_id: freshSlotId,
      reason: 'First booking',
      format: 'online',
    });
    expect(first.status).toBe(201);

    const second = await authPost(studentToken, '/api/student/appointments', {
      psychologist_id: seedData.psych.id,
      slot_id: freshSlotId,
      reason: 'Second booking',
      format: 'online',
    });
    expect(second.status).toBe(400);
  });
});

describe('Idempotency: appointment cancellation', () => {
  it('IDEM-2: cancel appointment twice → first 200, second 400 (already cancelled)', async () => {
    const first = await authPatch(
      studentToken,
      `/api/student/appointments/${seedData.appointment.id}/cancel`,
      {}
    );
    expect(first.status).toBe(200);

    const second = await authPatch(
      studentToken,
      `/api/student/appointments/${seedData.appointment.id}/cancel`,
      {}
    );
    expect(second.status).toBe(400);
  });
});

describe('Idempotency: slot deletion', () => {
  it('IDEM-3: delete slot twice → first 200, second 404', async () => {
    // Create a fresh available slot (not tied to any appointment) to delete
    const newSlot = await pool.query(
      `INSERT INTO time_slots (psychologist_id, date, start_time, end_time, is_available)
       VALUES ($1, CURRENT_DATE + 3, '16:00', '17:00', true)
       RETURNING id`,
      [seedData.psych.id]
    );
    const freshSlotId = newSlot.rows[0].id;

    const first = await authDelete(adminToken, `/api/admin/slots/${freshSlotId}`);
    expect(first.status).toBe(200);

    const second = await authDelete(adminToken, `/api/admin/slots/${freshSlotId}`);
    expect(second.status).toBe(404);
  });
});

describe('Idempotency: appointment feedback', () => {
  it('IDEM-4: submit feedback twice → both return 200 (feedback can be overwritten, no duplicate protection)', async () => {
    // Note: feedback can be overwritten, no duplicate protection
    const first = await authPost(
      studentToken,
      `/api/student/appointments/${seedData.appointment.id}/feedback`,
      { feedback_score: 5, feedback_text: 'Great session' }
    );
    expect(first.status).toBe(200);

    const second = await authPost(
      studentToken,
      `/api/student/appointments/${seedData.appointment.id}/feedback`,
      { feedback_score: 3, feedback_text: 'Updated feedback' }
    );
    expect(second.status).toBe(200);
  });
});

describe('Idempotency: session notes', () => {
  it('IDEM-5: post session notes twice → both return 201 (Bug: duplicate notes possible, no uniqueness constraint)', async () => {
    // Bug: duplicate notes possible — no unique constraint on (appointment_id, psychologist_id)
    const first = await authPost(
      psychToken,
      `/api/psychologist/sessions/${seedData.appointment.id}/notes`,
      {
        condition_before: 3,
        condition_after: 7,
        recommend_followup: false,
        tags: 'anxiety',
        notes: 'First note',
      }
    );
    expect(first.status).toBe(201);

    const second = await authPost(
      psychToken,
      `/api/psychologist/sessions/${seedData.appointment.id}/notes`,
      {
        condition_before: 4,
        condition_after: 8,
        recommend_followup: true,
        tags: 'stress',
        notes: 'Second note',
      }
    );
    expect(second.status).toBe(201);
  });
});
