const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const {
  seedUsers,
  seedSlot,
  seedAppointment,
  STUDENT_CREDS,
  STUDENT2_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet } = require('../helpers/apiClient');

let studentToken, student2Token, users, slot;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  slot = await seedSlot(users.psych.id);
  const student = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = student.token;
  const student2 = await loginViaApi(STUDENT2_CREDS.email, STUDENT2_CREDS.password);
  student2Token = student2.token;
});


describe('GET /api/student/appointments', () => {
  it('TC-AL-1: with appointments → 200, array with psychologist info', async () => {
    await seedAppointment(users.student.id, users.psych.id, slot.id);

    const res = await authGet(studentToken, '/api/student/appointments');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it('TC-AL-2: no appointments → 200, empty array', async () => {
    const res = await authGet(studentToken, '/api/student/appointments');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('TC-AL-3: data isolation — student2 appointments not visible to student1', async () => {
    // Create a separate slot for student2
    const slot2 = await seedSlot(users.psych.id, { daysFromNow: 2 });
    // Seed an appointment for student2
    await seedAppointment(users.student2.id, users.psych.id, slot2.id);

    // Student1 should see no appointments
    const res = await authGet(studentToken, '/api/student/appointments');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('TC-AL-4: response structure includes required fields', async () => {
    await seedAppointment(users.student.id, users.psych.id, slot.id);

    const res = await authGet(studentToken, '/api/student/appointments');

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);

    const appt = res.body[0];
    expect(appt).toHaveProperty('date');
    expect(appt).toHaveProperty('start_time');
    expect(appt).toHaveProperty('psychologist_name');
    expect(appt.psychologist_name).toBe('Test Psych');
  });

  it('TC-AL-5: student2 can only see their own appointments', async () => {
    // Appointment for student1
    await seedAppointment(users.student.id, users.psych.id, slot.id);
    // Appointment for student2 on a different slot
    const slot2 = await seedSlot(users.psych.id, { daysFromNow: 2 });
    await seedAppointment(users.student2.id, users.psych.id, slot2.id);

    const res1 = await authGet(studentToken, '/api/student/appointments');
    const res2 = await authGet(student2Token, '/api/student/appointments');

    expect(res1.status).toBe(200);
    expect(res1.body.length).toBe(1);
    expect(res1.body[0].student_id).toBe(users.student.id);

    expect(res2.status).toBe(200);
    expect(res2.body.length).toBe(1);
    expect(res2.body[0].student_id).toBe(users.student2.id);
  });
});
