const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedUsers,
  seedSlot,
  seedAppointment,
  seedCheckIn,
  STUDENT_CREDS,
  PSYCH_CREDS,
  STUDENT2_CREDS,
  ADMIN_CREDS,
  PASSWORD_HASH,
} = require('../fixtures');
const { loginViaApi, authGet, authPatch } = require('../helpers/apiClient');

let studentToken, student2Token, psychToken, adminToken;
let users, slot, appointment;

beforeEach(async () => {
  await clearDb();

  // seedUsers() creates student, psych, admin, student2
  users = await seedUsers();

  // Seed slot and appointment for student1 + psych
  slot = await seedSlot(users.psych.id);
  appointment = await seedAppointment(users.student.id, users.psych.id, slot.id);

  // Seed check-in only for student1
  await seedCheckIn(users.student.id);

  // Log in all relevant actors
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
  student2Token = (await loginViaApi(STUDENT2_CREDS.email, STUDENT2_CREDS.password)).token;
  psychToken = (await loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password)).token;
  adminToken = (await loginViaApi(ADMIN_CREDS.email, ADMIN_CREDS.password)).token;
});


describe('Security: data isolation between students', () => {
  it('ISO-1: student2 GET /student/check-ins → 200 with empty array (cannot see student1 check-ins)', async () => {
    const res = await authGet(student2Token, '/api/student/check-ins');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('ISO-2: student2 GET /student/appointments → 200 with empty array (cannot see student1 appointments)', async () => {
    const res = await authGet(student2Token, '/api/student/appointments');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('ISO-3: student2 PATCH /student/appointments/:student1AppointmentId/cancel → 404 (not student2 appointment)', async () => {
    const res = await authPatch(
      student2Token,
      `/api/student/appointments/${appointment.id}/cancel`,
      {}
    );

    expect(res.status).toBe(404);
  });
});

describe('Security: psychologist access control to student data', () => {
  it('ISO-4: psych GET /psychologist/students/:student1Id → 200 (has appointment with student1)', async () => {
    const res = await authGet(psychToken, `/api/psychologist/students/${users.student.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('student');
    expect(res.body.student.id).toBe(users.student.id);
  });

  it('ISO-5: second psychologist GET /psychologist/students/:student1Id → 403 (no appointment)', async () => {
    // Insert a second psychologist directly and log in
    await pool.query(
      `INSERT INTO users (email, password_hash, role, name)
       VALUES ('psych2@test.com', $1, 'psychologist', 'Psych 2')`,
      [PASSWORD_HASH]
    );
    const psych2Login = await loginViaApi('psych2@test.com', 'test123');
    const psych2Token = psych2Login.token;

    const res = await authGet(psych2Token, `/api/psychologist/students/${users.student.id}`);

    expect(res.status).toBe(403);
  });
});

describe('Security: admin sees all students', () => {
  it('ISO-6: admin GET /admin/students → 200, response includes both student1 and student2', async () => {
    const res = await authGet(adminToken, '/api/admin/students');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('students');
    const studentIds = res.body.students.map(s => s.id);
    expect(studentIds).toContain(users.student.id);
    expect(studentIds).toContain(users.student2.id);
  });
});
