const request = require('supertest');
const app = require('../../app');
const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedUsers,
  seedSlot,
  seedAppointment,
  STUDENT_CREDS,
  STUDENT2_CREDS,
} = require('../fixtures');
const { loginViaApi, authPatch } = require('../helpers/apiClient');

let studentToken, student2Token, users, slot, appointment;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  slot = await seedSlot(users.psych.id);
  appointment = await seedAppointment(users.student.id, users.psych.id, slot.id, 'scheduled');
  const student = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = student.token;
  const student2 = await loginViaApi(STUDENT2_CREDS.email, STUDENT2_CREDS.password);
  student2Token = student2.token;
});


describe('PATCH /api/student/appointments/:id/cancel', () => {
  it('TC-CAN-1: own scheduled appointment → 200 with cancellation message', async () => {
    const res = await authPatch(studentToken, `/api/student/appointments/${appointment.id}/cancel`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Запись отменена');
  });

  it('TC-CAN-2: after cancel, appointment status = cancelled in DB', async () => {
    await authPatch(studentToken, `/api/student/appointments/${appointment.id}/cancel`);

    const dbResult = await pool.query(
      'SELECT status FROM appointments WHERE id = $1',
      [appointment.id]
    );
    expect(dbResult.rows[0].status).toBe('cancelled');
  });

  it('TC-CAN-3: after cancel, slot is_available = true in DB (slot restored)', async () => {
    // First mark the slot unavailable (as would happen after booking)
    await pool.query('UPDATE time_slots SET is_available = false WHERE id = $1', [slot.id]);

    await authPatch(studentToken, `/api/student/appointments/${appointment.id}/cancel`);

    const dbResult = await pool.query(
      'SELECT is_available FROM time_slots WHERE id = $1',
      [slot.id]
    );
    expect(dbResult.rows[0].is_available).toBe(true);
  });

  it('TC-CAN-4: other student\'s appointment → 404 (WHERE student_id filter, not 403)', async () => {
    // student2 tries to cancel student1's appointment
    const res = await authPatch(student2Token, `/api/student/appointments/${appointment.id}/cancel`);

    expect(res.status).toBe(404);
  });

  it('TC-CAN-5: non-existent appointment ID → 404', async () => {
    const res = await authPatch(studentToken, '/api/student/appointments/999999/cancel');

    expect(res.status).toBe(404);
  });

  it('TC-CAN-6: already cancelled appointment → 400 with Russian error', async () => {
    const cancelledAppt = await seedAppointment(
      users.student.id, users.psych.id, slot.id, 'cancelled'
    );

    const res = await authPatch(studentToken, `/api/student/appointments/${cancelledAppt.id}/cancel`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Можно отменить только запланированные записи');
  });

  it('TC-CAN-7: completed appointment → 400 (only scheduled can be cancelled)', async () => {
    const slot2 = await seedSlot(users.psych.id, { daysFromNow: 2 });
    const completedAppt = await seedAppointment(
      users.student.id, users.psych.id, slot2.id, 'completed'
    );

    const res = await authPatch(studentToken, `/api/student/appointments/${completedAppt.id}/cancel`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Можно отменить только запланированные записи');
  });
});
