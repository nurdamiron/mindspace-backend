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
const { loginViaApi, authPost } = require('../helpers/apiClient');

let studentToken, student2Token, users, slot, appointment;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  slot = await seedSlot(users.psych.id);
  // Note: feedback endpoint has NO status check - any status can receive feedback
  appointment = await seedAppointment(users.student.id, users.psych.id, slot.id, 'completed');
  const student = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = student.token;
  const student2 = await loginViaApi(STUDENT2_CREDS.email, STUDENT2_CREDS.password);
  student2Token = student2.token;
});


describe('POST /api/student/appointments/:id/feedback', () => {
  it('TC-FB-1: valid feedback → 200, returns updated appointment', async () => {
    const res = await authPost(studentToken, `/api/student/appointments/${appointment.id}/feedback`, {
      feedback_score: 5,
      feedback_text: 'Great session, very helpful!',
    });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
    expect(res.body.feedback_score).toBe(5);
    expect(res.body.feedback_text).toBe('Great session, very helpful!');
  });

  it('TC-FB-2: after feedback, DB reflects feedback_score = 5', async () => {
    await authPost(studentToken, `/api/student/appointments/${appointment.id}/feedback`, {
      feedback_score: 5,
      feedback_text: 'Great',
    });

    const dbResult = await pool.query(
      'SELECT feedback_score, feedback_text FROM appointments WHERE id = $1',
      [appointment.id]
    );
    expect(dbResult.rows[0].feedback_score).toBe(5);
    expect(dbResult.rows[0].feedback_text).toBe('Great');
  });

  it('TC-FB-3: non-existent appointment ID → 404', async () => {
    const res = await authPost(studentToken, '/api/student/appointments/999999/feedback', {
      feedback_score: 4,
      feedback_text: 'Good',
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Запись не найдена');
  });

  it('TC-FB-4: other student\'s appointment → 404 (WHERE student_id=$1 filter)', async () => {
    // student2 tries to submit feedback on student1's appointment
    const res = await authPost(student2Token, `/api/student/appointments/${appointment.id}/feedback`, {
      feedback_score: 3,
      feedback_text: 'Average',
    });

    expect(res.status).toBe(404);
  });

  // NOTE: There is no app-level validation on feedback_score range.
  // The DB schema for appointments also has NO CHECK constraint on feedback_score.
  // Therefore feedback_score = 6 (or any integer) is accepted and returns 200.
  it('TC-FB-5: feedback_score=6 (out of typical 1-5 range) → 200 (no validation in app or DB schema)', async () => {
    const res = await authPost(studentToken, `/api/student/appointments/${appointment.id}/feedback`, {
      feedback_score: 6,
      feedback_text: 'Beyond scale',
    });

    expect(res.status).toBe(200);
    expect(res.body.feedback_score).toBe(6);
  });

  it('TC-FB-6: feedback on a scheduled appointment (no status check) → 200', async () => {
    const slot2 = await seedSlot(users.psych.id, { daysFromNow: 2 });
    const scheduledAppt = await seedAppointment(
      users.student.id, users.psych.id, slot2.id, 'scheduled'
    );

    // Endpoint has NO status check - any appointment status can receive feedback
    const res = await authPost(studentToken, `/api/student/appointments/${scheduledAppt.id}/feedback`, {
      feedback_score: 4,
      feedback_text: 'Pre-session note',
    });

    expect(res.status).toBe(200);
  });
});
