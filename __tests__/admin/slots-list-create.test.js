const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedAll,
  ADMIN_CREDS,
  STUDENT_CREDS,
  PSYCH_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet, authPost } = require('../helpers/apiClient');

let adminToken, studentToken, seeded;

// Tomorrow as 'YYYY-MM-DD' string
function tomorrowDateStr() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  adminToken   = (await loginViaApi(ADMIN_CREDS.email,   ADMIN_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
});


describe('GET /api/admin/slots', () => {
  it('TC-ASL-1: → 200, array with psychologist_name from JOIN', async () => {
    const res = await authGet(adminToken, '/api/admin/slots');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // seedAll creates a slot with daysFromNow=1 which is >= CURRENT_DATE
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const slot = res.body[0];
    expect(slot).toHaveProperty('psychologist_name');
    expect(slot).toHaveProperty('id');
    expect(slot).toHaveProperty('date');
    expect(slot).toHaveProperty('start_time');
    expect(slot).toHaveProperty('end_time');
  });

  it('TC-ASL-2: student token → 403', async () => {
    const res = await authGet(studentToken, '/api/admin/slots');

    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/slots', () => {
  it('TC-ASC-1: two slots → 201, array of 2 created slots', async () => {
    const dateStr = tomorrowDateStr();

    const res = await authPost(adminToken, '/api/admin/slots', {
      psychologist_id: seeded.psych.id,
      date: dateStr,
      slots: [
        { start_time: '09:00', end_time: '10:00' },
        { start_time: '10:00', end_time: '11:00' },
      ],
    });

    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0].start_time).toBe('09:00:00');
    expect(res.body[1].start_time).toBe('10:00:00');
  });

  it('TC-ASC-2: new slots have is_available=true in DB', async () => {
    const dateStr = tomorrowDateStr();

    const res = await authPost(adminToken, '/api/admin/slots', {
      psychologist_id: seeded.psych.id,
      date: dateStr,
      slots: [{ start_time: '12:00', end_time: '13:00' }],
    });

    expect(res.status).toBe(201);

    const dbResult = await pool.query(
      'SELECT is_available FROM time_slots WHERE id = $1',
      [res.body[0].id]
    );

    expect(dbResult.rows[0].is_available).toBe(true);
  });

  // BUG: no validation for empty slots array
  // → loop over empty array → returns 201 with empty results array
  it('TC-ASC-3: empty slots array → 201, [] (BUG: no validation, loops over empty array)', async () => {
    const dateStr = tomorrowDateStr();

    const res = await authPost(adminToken, '/api/admin/slots', {
      psychologist_id: seeded.psych.id,
      date: dateStr,
      slots: [],
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual([]);
  });

  it('TC-ASC-4: student token → 403', async () => {
    const dateStr = tomorrowDateStr();

    const res = await authPost(studentToken, '/api/admin/slots', {
      psychologist_id: seeded.psych.id,
      date: dateStr,
      slots: [{ start_time: '09:00', end_time: '10:00' }],
    });

    expect(res.status).toBe(403);
  });
});
