const request = require('supertest');
const app = require('../../app');
const pool = require('../../db/pool');
const { clearDb } = require('../setup/db');
const {
  seedUsers,
  STUDENT_CREDS,
  STUDENT2_CREDS,
} = require('../fixtures');
const { loginViaApi, authGet, authPost } = require('../helpers/apiClient');

let studentToken, student2Token, users;

beforeEach(async () => {
  await clearDb();
  users = await seedUsers();
  const student = await loginViaApi(STUDENT_CREDS.email, STUDENT_CREDS.password);
  studentToken = student.token;
  const student2 = await loginViaApi(STUDENT2_CREDS.email, STUDENT2_CREDS.password);
  student2Token = student2.token;
});


describe('GET /api/student/chat', () => {
  it('TC-CH-1: no messages → 200, empty array', async () => {
    const res = await authGet(studentToken, '/api/student/chat');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('TC-CH-2: after sending ai-chat message → 200, at least 1 message (the user message)', async () => {
    // Send a message via ai-chat (API key is empty in test env, but user message is saved first)
    await authPost(studentToken, '/api/student/ai-chat', {
      content: 'Hello from student',
    });

    const res = await authGet(studentToken, '/api/student/chat');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const userMsg = res.body.find(m => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg.content).toBe('Hello from student');
  });

  it('TC-CH-3: data isolation — student1 cannot see student2 messages', async () => {
    // Insert messages directly for student2 via pool.query
    await pool.query(
      'INSERT INTO chat_messages (student_id, role, content) VALUES ($1, $2, $3)',
      [users.student2.id, 'user', 'Student2 private message']
    );

    // Student1 fetches their chat history — should see nothing
    const res = await authGet(studentToken, '/api/student/chat');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('TC-CH-4: student2 can see their own messages', async () => {
    // Insert message for student2
    await pool.query(
      'INSERT INTO chat_messages (student_id, role, content) VALUES ($1, $2, $3)',
      [users.student2.id, 'user', 'Student2 message']
    );

    const res = await authGet(student2Token, '/api/student/chat');

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].content).toBe('Student2 message');
  });

  it('TC-CH-5: messages are returned sorted by created_at ASC (oldest first)', async () => {
    // Insert messages directly to control order
    await pool.query(
      'INSERT INTO chat_messages (student_id, role, content) VALUES ($1, $2, $3)',
      [users.student.id, 'user', 'First message']
    );
    // Small delay via SQL to ensure different created_at timestamps
    await pool.query(
      `INSERT INTO chat_messages (student_id, role, content, created_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '1 second')`,
      [users.student.id, 'assistant', 'Second message']
    );

    const res = await authGet(studentToken, '/api/student/chat');

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
    expect(res.body[0].content).toBe('First message');
    expect(res.body[1].content).toBe('Second message');
  });

  it('TC-CH-6: multiple messages from student, all returned', async () => {
    // Send two messages via ai-chat
    await authPost(studentToken, '/api/student/ai-chat', { content: 'Message one' });
    await authPost(studentToken, '/api/student/ai-chat', { content: 'Message two' });

    const res = await authGet(studentToken, '/api/student/chat');

    expect(res.status).toBe(200);
    // At minimum 2 user messages should be in DB
    // (no assistant messages since API key is empty and early return is hit)
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    const contents = res.body.map(m => m.content);
    expect(contents).toContain('Message one');
    expect(contents).toContain('Message two');
  });
});
