const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedUsers,
  seedSlot,
  seedAppointment,
  PSYCH_CREDS,
  STUDENT_CREDS,
} = require('../fixtures');
const { loginViaApi, authPatch } = require('../helpers/apiClient');

let psychToken, studentToken, seeded;

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  psychToken   = (await loginViaApi(PSYCH_CREDS.email,   PSYCH_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
});


describe('PATCH /api/psychologist/appointments/:id/complete', () => {
  it('TC-AC-1: complete own scheduled appointment → 200, status=completed', async () => {
    const res = await authPatch(
      psychToken,
      `/api/psychologist/appointments/${seeded.appointment.id}/complete`,
      {}
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
  });

  it('TC-AC-2: DB record updated to status=completed', async () => {
    await authPatch(
      psychToken,
      `/api/psychologist/appointments/${seeded.appointment.id}/complete`,
      {}
    );

    const dbResult = await pool.query(
      'SELECT status FROM appointments WHERE id = $1',
      [seeded.appointment.id]
    );

    expect(dbResult.rows[0].status).toBe('completed');
  });

  it('TC-AC-3: complete already-completed appointment → 404 (WHERE status=scheduled not met)', async () => {
    // First completion
    await authPatch(
      psychToken,
      `/api/psychologist/appointments/${seeded.appointment.id}/complete`,
      {}
    );

    // Second attempt on same appointment
    const res = await authPatch(
      psychToken,
      `/api/psychologist/appointments/${seeded.appointment.id}/complete`,
      {}
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Запись не найдена или уже завершена');
  });

  it('TC-AC-4: another psych tries to complete this appointment → 404', async () => {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('test123', 10);
    await pool.query(`
      INSERT INTO users (email, password_hash, role, name, specialization)
      VALUES ('psych2@test.com', $1, 'psychologist', 'Psych Two', 'Stress')
    `, [hash]);
    const psych2Token = (await loginViaApi('psych2@test.com', 'test123')).token;

    const res = await authPatch(
      psych2Token,
      `/api/psychologist/appointments/${seeded.appointment.id}/complete`,
      {}
    );

    expect(res.status).toBe(404);
  });

  it('TC-AC-5: non-existent appointment → 404', async () => {
    const res = await authPatch(
      psychToken,
      '/api/psychologist/appointments/99999/complete',
      {}
    );

    expect(res.status).toBe(404);
  });

  it('TC-AC-6: student token → 403', async () => {
    const res = await authPatch(
      studentToken,
      `/api/psychologist/appointments/${seeded.appointment.id}/complete`,
      {}
    );

    expect(res.status).toBe(403);
  });

  it('TC-AC-7: completing a cancelled appointment → 404 (WHERE status=scheduled not met)', async () => {
    // Seed a cancelled appointment
    const slot = await seedSlot(seeded.psych.id, { daysFromNow: 3 });
    const cancelledAppt = await seedAppointment(seeded.student.id, seeded.psych.id, slot.id, 'cancelled');

    const res = await authPatch(
      psychToken,
      `/api/psychologist/appointments/${cancelledAppt.id}/complete`,
      {}
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Запись не найдена или уже завершена');
  });
});
