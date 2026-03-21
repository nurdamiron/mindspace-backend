const request = require('supertest');
const app = require('../../app');
const { clearDb } = require('../setup/db');
const { seedUsers, STUDENT_CREDS, PASSWORD } = require('../fixtures');
const { loginViaApi, authPatch } = require('../helpers/apiClient');

beforeEach(async () => {
  await clearDb();
  await seedUsers();
});


describe('PATCH /api/auth/password', () => {
  // TC-1: Correct current_password + valid new_password → 200, success message
  it('TC-1: correct current password + valid new password → 200, message', async () => {
    const { token } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);

    const res = await authPatch(token, '/api/auth/password', {
      current_password: PASSWORD,
      new_password: 'newpassword123',
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Пароль изменён');
  });

  // TC-2: After password change, logging in with the OLD password fails
  it('TC-2: after change, old password login → 401', async () => {
    const { token } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);

    await authPatch(token, '/api/auth/password', {
      current_password: PASSWORD,
      new_password: 'newpassword123',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: STUDENT_CREDS.email, password: PASSWORD });

    expect(loginRes.status).toBe(401);
    expect(loginRes.body.error).toBe('Неверный email или пароль');
  });

  // TC-3: After password change, logging in with the NEW password succeeds
  it('TC-3: after change, new password login → 200', async () => {
    const { token } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
    const newPass = 'newpassword123';

    await authPatch(token, '/api/auth/password', {
      current_password: PASSWORD,
      new_password: newPass,
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: STUDENT_CREDS.email, password: newPass });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body).toHaveProperty('token');
  });

  // TC-4: Wrong current_password → 400
  it('TC-4: wrong current_password → 400', async () => {
    const { token } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);

    const res = await authPatch(token, '/api/auth/password', {
      current_password: 'wrongcurrentpass',
      new_password: 'newpassword123',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Текущий пароль неверен');
  });

  // TC-5: new_password shorter than 6 chars → 400
  it('TC-5: new_password < 6 chars → 400', async () => {
    const { token } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);

    const res = await authPatch(token, '/api/auth/password', {
      current_password: PASSWORD,
      new_password: '12345',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Новый пароль должен быть не менее 6 символов');
  });

  // TC-6: Missing current_password → 400
  it('TC-6: missing current_password → 400', async () => {
    const { token } = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);

    const res = await authPatch(token, '/api/auth/password', {
      new_password: 'newpassword123',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Укажите текущий и новый пароль');
  });

  // TC-7: No auth token → 401
  it('TC-7: no auth token → 401', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .send({ current_password: PASSWORD, new_password: 'newpassword123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Требуется авторизация');
  });
});
