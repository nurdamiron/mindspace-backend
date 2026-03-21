const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedAll,
  ADMIN_CREDS,
  STUDENT_CREDS,
  PSYCH_CREDS,
} = require('../fixtures');
const { loginViaApi, authDelete } = require('../helpers/apiClient');

let adminToken, studentToken, seeded;

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  adminToken   = (await loginViaApi(ADMIN_CREDS.email,   ADMIN_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
});


describe('DELETE /api/admin/psychologists/:id', () => {
  it('TC-APD-1: delete existing psychologist → 200 { message: "Психолог удалён" }', async () => {
    const res = await authDelete(adminToken, `/api/admin/psychologists/${seeded.psych.id}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Психолог удалён');
  });

  it('TC-APD-2: psychologist no longer in users table after delete', async () => {
    await authDelete(adminToken, `/api/admin/psychologists/${seeded.psych.id}`);

    const dbResult = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [seeded.psych.id]
    );

    expect(dbResult.rows.length).toBe(0);
  });

  it('TC-APD-3: non-existent ID (9999) → 404 { error: "Психолог не найден" }', async () => {
    const res = await authDelete(adminToken, '/api/admin/psychologists/9999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Психолог не найден');
  });

  it('TC-APD-4: delete student ID (wrong role) → 404 (WHERE role=psychologist does not match)', async () => {
    const res = await authDelete(adminToken, `/api/admin/psychologists/${seeded.student.id}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Психолог не найден');
  });

  it('TC-APD-5: student token → 403', async () => {
    const res = await authDelete(studentToken, `/api/admin/psychologists/${seeded.psych.id}`);

    expect(res.status).toBe(403);
  });
});
