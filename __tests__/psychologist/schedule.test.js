const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedUsers,
  seedSlot,
  seedAppointment,
  PSYCH_CREDS,
  STUDENT_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet } = require('../helpers/apiClient');

let psychToken, studentToken, users;

beforeEach(async () => {
  await clearDb();
  ({ ...users } = await seedAll());
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,   PSYCH_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
});


describe('GET /api/psychologist/schedule', () => {
  it('TC-SCH-1: ?period=today → 200, array (may be empty since default slot is tomorrow)', async () => {
    const res = await authGet(psychToken, '/api/psychologist/schedule?period=today');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('TC-SCH-2: ?period=week → 200, array', async () => {
    const res = await authGet(psychToken, '/api/psychologist/schedule?period=week');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('TC-SCH-3: ?period=all → 200, array containing the seeded appointment (slot daysFromNow=1)', async () => {
    // seedAll() creates a slot with daysFromNow=1 (tomorrow), 'all' uses date >= CURRENT_DATE
    const res = await authGet(psychToken, '/api/psychologist/schedule?period=all');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('TC-SCH-4: no period param → 200, defaults to today (array)', async () => {
    const res = await authGet(psychToken, '/api/psychologist/schedule');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('TC-SCH-5: no appointments at all → period=all → 200, empty array', async () => {
    // Clear DB and seed only users (no appointments)
    await clearDb();
    const freshUsers = await seedUsers();
    const freshPsychToken = (await loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password)).token;

    const res = await authGet(freshPsychToken, '/api/psychologist/schedule?period=all');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('TC-SCH-6: student token → 403', async () => {
    const res = await authGet(studentToken, '/api/psychologist/schedule?period=all');

    expect(res.status).toBe(403);
  });

  it('TC-SCH-7: week filter uses BETWEEN CURRENT_DATE AND CURRENT_DATE+7 (not past dates)', async () => {
    // Slot seeded with daysFromNow=1 falls within week window
    const res = await authGet(psychToken, '/api/psychologist/schedule?period=week');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // The appointment created by seedAll() (daysFromNow=1) should be visible in week
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});
