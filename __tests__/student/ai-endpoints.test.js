const request = require('supertest');
const app = require('../../app');
const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedUsers,
  seedCheckIn,
  STUDENT_CREDS,
  PSYCH_CREDS,
  ADMIN_CREDS,
} = require('../fixtures');
const { loginViaApi, authPost } = require('../helpers/apiClient');

let studentToken, psychToken, adminToken, users;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  const student = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = student.token;
  const psych = await loginViaApi(PSYCH_CREDS.email, PSYCH_CREDS.password);
  psychToken = psych.token;
  const admin = await loginViaApi(ADMIN_CREDS.email, ADMIN_CREDS.password);
  adminToken = admin.token;
});


// Note: PERPLEXITY_API_KEY is empty/unset in .env.test for all tests below.

describe('POST /api/student/ai-chat (empty API key)', () => {
  it('TC-AI-1: with empty API key → 200 with fallback reply message', async () => {
    const res = await authPost(studentToken, '/api/student/ai-chat', {
      content: 'Hello, I need help',
    });

    expect(res.status).toBe(200);
    expect(res.body.reply).toBe('Извините, AI-помощник сейчас недоступен (не настроен ключ API).');
  });

  it('TC-AI-2: user message is saved to DB before API key check (1 message in chat_messages)', async () => {
    // The route saves the user message BEFORE checking for API key,
    // then returns early without saving the assistant reply.
    // So exactly 1 message (the user's) should be in the DB.
    await authPost(studentToken, '/api/student/ai-chat', {
      content: 'Test message',
    });

    const dbResult = await pool.query(
      'SELECT role, content FROM chat_messages WHERE student_id = $1',
      [users.student.id]
    );
    expect(dbResult.rows.length).toBe(1);
    expect(dbResult.rows[0].role).toBe('user');
    expect(dbResult.rows[0].content).toBe('Test message');
  });

  it('TC-AI-3: admin token → 403', async () => {
    const res = await authPost(adminToken, '/api/student/ai-chat', {
      content: 'Hello',
    });

    expect(res.status).toBe(403);
  });

  it('TC-AI-4: psychologist token → 403', async () => {
    const res = await authPost(psychToken, '/api/student/ai-chat', {
      content: 'Hello',
    });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/student/ai-insight (empty API key)', () => {
  it('TC-AI-5: with empty API key → 503 { error: "AI-сервис недоступен" }', async () => {
    // API key check happens FIRST before checking for check-ins.
    // So even without any check-ins → 503 when no API key.
    const res = await authPost(studentToken, '/api/student/ai-insight', {});

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI-сервис недоступен');
  });

  it('TC-AI-6: with check-ins but empty API key → still 503 (API key check is first in code)', async () => {
    // Seed check-ins for the student
    await seedCheckIn(users.student.id, { mood: 3, stress: 2 });

    // Despite having check-ins, the 503 is returned because the API key check runs first
    const res = await authPost(studentToken, '/api/student/ai-insight', {});

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI-сервис недоступен');
  });

  it('TC-AI-7: psychologist token → 403', async () => {
    const res = await authPost(psychToken, '/api/student/ai-insight', {});

    expect(res.status).toBe(403);
  });

  it('TC-AI-8: admin token → 403', async () => {
    const res = await authPost(adminToken, '/api/student/ai-insight', {});

    expect(res.status).toBe(403);
  });
});
