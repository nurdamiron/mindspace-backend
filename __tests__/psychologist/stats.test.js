const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedUsers,
  seedSessionNotes,
  PSYCH_CREDS,
  STUDENT_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet, authPatch } = require('../helpers/apiClient');

let psychToken, studentToken, seeded;

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,   PSYCH_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;

  // Complete the appointment so it shows in stats
  await authPatch(
    psychToken,
    `/api/psychologist/appointments/${seeded.appointment.id}/complete`,
    {}
  );

  // Add session notes
  await seedSessionNotes(seeded.appointment.id, seeded.psych.id);
});


describe('GET /api/psychologist/stats', () => {
  it('TC-ST-1: with sessions → 200, expected shape', async () => {
    const res = await authGet(psychToken, '/api/psychologist/stats');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessions');
    expect(res.body).toHaveProperty('uniqueStudents');
    expect(res.body).toHaveProperty('weeklyLoad');
    expect(res.body).toHaveProperty('tagStats');
    expect(Array.isArray(res.body.weeklyLoad)).toBe(true);
    expect(Array.isArray(res.body.tagStats)).toBe(true);
  });

  it('TC-ST-2: sessions object has total, completed, scheduled', async () => {
    const res = await authGet(psychToken, '/api/psychologist/stats');

    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveProperty('total');
    expect(res.body.sessions).toHaveProperty('completed');
    expect(res.body.sessions).toHaveProperty('scheduled');
  });

  it('TC-ST-3: no sessions → 200, total and uniqueStudents are "0"', async () => {
    // Clear DB and seed only users (no appointments)
    await clearDb();
    await seedUsers();
    const freshPsychToken = (await loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password)).token;

    const res = await authGet(freshPsychToken, '/api/psychologist/stats');

    expect(res.status).toBe(200);
    // PostgreSQL COUNT returns string '0' via node-postgres
    expect(res.body.sessions.total).toBe('0');
    expect(res.body.uniqueStudents).toBe('0');
  });

  it('TC-ST-4: student token → 403', async () => {
    const res = await authGet(studentToken, '/api/psychologist/stats');

    expect(res.status).toBe(403);
  });
});
