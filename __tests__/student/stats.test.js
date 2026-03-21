const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const {
  seedUsers,
  seedSlot,
  seedAppointment,
  seedCheckIn,
  STUDENT_CREDS,
  PSYCH_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet } = require('../helpers/apiClient');

let studentToken, psychToken, users;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  const student = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = student.token;
  const psych = await loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password);
  psychToken = psych.token;
});


describe('GET /api/student/stats', () => {
  it('TC-ST-1: with check-ins and appointments → 200, full stats structure', async () => {
    await seedCheckIn(users.student.id, { mood: 4, stress: 2 });
    const slot = await seedSlot(users.psych.id);
    await seedAppointment(users.student.id, users.psych.id, slot.id, 'completed');

    const res = await authGet(studentToken, '/api/student/stats');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('checkIns');
    expect(res.body).toHaveProperty('appointments');
    expect(res.body).toHaveProperty('weeklyAverages');

    expect(Array.isArray(res.body.checkIns)).toBe(true);
    expect(res.body.checkIns.length).toBeGreaterThan(0);
  });

  it('TC-ST-2: no data → 200, checkIns=[], appointments.total=0, weeklyAverages has nulls', async () => {
    const res = await authGet(studentToken, '/api/student/stats');

    expect(res.status).toBe(200);
    expect(res.body.checkIns).toEqual([]);
    // PostgreSQL COUNT returns '0' as a string
    expect(res.body.appointments.total).toBe('0');
    // weeklyAverages fields are null when there are no check-ins
    expect(res.body.weeklyAverages.avg_mood).toBeNull();
    expect(res.body.weeklyAverages.avg_stress).toBeNull();
  });

  it('TC-ST-3: appointments object has total, completed, scheduled fields', async () => {
    const slot1 = await seedSlot(users.psych.id, { daysFromNow: 1 });
    const slot2 = await seedSlot(users.psych.id, { daysFromNow: 2 });
    await seedAppointment(users.student.id, users.psych.id, slot1.id, 'completed');
    await seedAppointment(users.student.id, users.psych.id, slot2.id, 'scheduled');

    const res = await authGet(studentToken, '/api/student/stats');

    expect(res.status).toBe(200);
    expect(res.body.appointments).toHaveProperty('total');
    expect(res.body.appointments).toHaveProperty('completed');
    expect(res.body.appointments).toHaveProperty('scheduled');
    expect(res.body.appointments.total).toBe('2');
    expect(res.body.appointments.completed).toBe('1');
    expect(res.body.appointments.scheduled).toBe('1');
  });

  it('TC-ST-4: checkIns array contains expected fields', async () => {
    await seedCheckIn(users.student.id, { mood: 3, stress: 2, daysAgo: 0 });

    const res = await authGet(studentToken, '/api/student/stats');

    expect(res.status).toBe(200);
    expect(res.body.checkIns.length).toBe(1);

    const checkIn = res.body.checkIns[0];
    expect(checkIn).toHaveProperty('date');
    expect(checkIn).toHaveProperty('mood');
    expect(checkIn).toHaveProperty('stress');
    expect(checkIn).toHaveProperty('sleep');
    expect(checkIn).toHaveProperty('energy');
    expect(checkIn).toHaveProperty('productivity');
  });

  it('TC-ST-5: weeklyAverages has expected keys with data', async () => {
    await seedCheckIn(users.student.id, { mood: 4, stress: 2, daysAgo: 0 });

    const res = await authGet(studentToken, '/api/student/stats');

    expect(res.status).toBe(200);
    expect(res.body.weeklyAverages).toHaveProperty('avg_mood');
    expect(res.body.weeklyAverages).toHaveProperty('avg_stress');
    expect(res.body.weeklyAverages).toHaveProperty('avg_sleep');
    expect(res.body.weeklyAverages).toHaveProperty('avg_energy');
    expect(res.body.weeklyAverages).toHaveProperty('avg_productivity');
    expect(Number(res.body.weeklyAverages.avg_mood)).toBe(4);
  });

  it('TC-ST-6: psychologist token → 403', async () => {
    const res = await authGet(psychToken, '/api/student/stats');

    expect(res.status).toBe(403);
  });
});
