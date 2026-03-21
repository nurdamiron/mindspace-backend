const { clearDb } = require('../setup/db');
const {
  seedAll,
  seedSlotUnavailable,
  seedAppointment,
  ADMIN_CREDS,
  STUDENT_CREDS,
} = require('../fixtures');
const { loginViaApi, authDelete } = require('../helpers/apiClient');

let adminToken, studentToken, seeded;

beforeEach(async () => {
  await clearDb();
  seeded       = await seedAll();
  adminToken   = (await loginViaApi(ADMIN_CREDS.email,   ADMIN_CREDS.password)).token;
  studentToken = (await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password)).token;
});


describe('DELETE /api/admin/slots/:id', () => {
  it('TC-ASD-1: delete available slot → 200 { message: "Слот удалён" }', async () => {
    // seeded.slot is is_available=true
    const res = await authDelete(adminToken, `/api/admin/slots/${seeded.slot.id}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Слот удалён');
  });

  it('TC-ASD-2: delete booked slot (is_available=false) → 400 { error: "Нельзя удалить занятый слот" }', async () => {
    // Seed an unavailable (booked) slot
    const bookedSlot = await seedSlotUnavailable(seeded.psych.id);

    const res = await authDelete(adminToken, `/api/admin/slots/${bookedSlot.id}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Нельзя удалить занятый слот');
  });

  it('TC-ASD-3: non-existent slot (9999) → 404 { error: "Слот не найден" }', async () => {
    const res = await authDelete(adminToken, '/api/admin/slots/9999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Слот не найден');
  });

  it('TC-ASD-4: delete already-deleted slot → 404', async () => {
    // Delete once
    await authDelete(adminToken, `/api/admin/slots/${seeded.slot.id}`);

    // Delete again
    const res = await authDelete(adminToken, `/api/admin/slots/${seeded.slot.id}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Слот не найден');
  });

  it('TC-ASD-5: student token → 403', async () => {
    const res = await authDelete(studentToken, `/api/admin/slots/${seeded.slot.id}`);

    expect(res.status).toBe(403);
  });
});
