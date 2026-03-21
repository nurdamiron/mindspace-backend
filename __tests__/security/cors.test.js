const request = require('supertest');
const app = require('../../app');

// No clearDb needed for CORS tests — they do not touch the database

describe('CORS: allowed origins', () => {
  it('CORS-1: request from allowed origin returns Access-Control-Allow-Origin header', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('CORS-2: request from unknown/disallowed origin does not receive CORS allow header', async () => {
    const res = await request(app)
      .get('/api/health')
      .set('Origin', 'http://evil.com');

    // The CORS middleware calls callback(new Error(...)) for unknown origins.
    // Express/cors converts this to a 500 error response.
    expect(res.status).toBe(500);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CORS-3: server-to-server request without Origin header is allowed (200)', async () => {
    // The CORS config has: if (!origin) callback(null, true) — so no-origin requests pass through
    const res = await request(app)
      .get('/api/health');
    // No Origin header set

    expect(res.status).toBe(200);
  });

  it('CORS-4: OPTIONS preflight from allowed origin → 204, includes CORS headers', async () => {
    const res = await request(app)
      .options('/api/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type, Authorization');

    // Express cors middleware handles OPTIONS preflight with a 204 No Content
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
