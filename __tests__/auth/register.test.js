const request = require('supertest');
const app = require('../../app');
const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const { seedUsers, STUDENT_CREDS } = require('../fixtures');
const { assertNoPasswordHash } = require('../helpers/apiClient');

beforeEach(async () => {
  await clearDb();
  await seedUsers();
});


describe('POST /api/auth/register', () => {
  // TC-1: Valid registration returns 201 with token and user, role defaults to student
  it('TC-1: valid registration → 201, { token, user }, user.role=student', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New User', email: 'newuser@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.role).toBe('student');
    expect(res.body.user.email).toBe('newuser@test.com');
    expect(res.body.user.name).toBe('New User');
  });

  // TC-2: password_hash must NOT appear in the response
  it('TC-2: password_hash is NOT in the response', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'New User', email: 'newuser@test.com', password: 'password123' });

    expect(res.status).toBe(201);
    assertNoPasswordHash(res.body);
  });

  // TC-3: duplicate email → 400 (NOT 409) with Russian error message
  it('TC-3: duplicate email → 400, Этот email уже зарегистрирован', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Duplicate', email: STUDENT_CREDS.email, password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Этот email уже зарегистрирован');
  });

  // TC-4: missing name → 400
  it('TC-4: missing name → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'noname@test.com', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Имя, email и пароль обязательны');
  });

  // TC-5: missing email → 400
  it('TC-5: missing email → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'No Email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Имя, email и пароль обязательны');
  });

  // TC-6: missing password → 400
  it('TC-6: missing password → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'No Pass', email: 'nopass@test.com' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Имя, email и пароль обязательны');
  });

  // TC-7: password shorter than 6 chars → 400
  it('TC-7: password < 6 chars → 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Short Pass', email: 'short@test.com', password: '12345' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Пароль должен быть не менее 6 символов');
  });

  // TC-8: user is actually persisted in DB with role=student and hashed password
  it('TC-8: user is created in DB with role=student and hashed password', async () => {
    const email = 'dbcheck@test.com';
    const plainPassword = 'securepass';

    const res = await request(app)
      .post('/api/auth/register')
      .send({ name: 'DB Check', email, password: plainPassword });

    expect(res.status).toBe(201);

    const dbResult = await pool.query(
      'SELECT id, email, role, password_hash FROM users WHERE email = $1',
      [email]
    );
    expect(dbResult.rows).toHaveLength(1);

    const dbUser = dbResult.rows[0];
    expect(dbUser.email).toBe(email);
    expect(dbUser.role).toBe('student');
    // password_hash must be a bcrypt hash, not the plain text
    expect(dbUser.password_hash).not.toBe(plainPassword);
    expect(dbUser.password_hash).toMatch(/^\$2[ab]\$/);
  });
});
