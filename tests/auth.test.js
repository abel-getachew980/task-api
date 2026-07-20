const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');

// --- Mock Prisma --------------------------------------------------------
// We build a fresh mock per test so state doesn't leak between tests.

function buildMockPrisma({ user = null, createUser = null } = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      create: jest.fn().mockResolvedValue(createUser),
    },
    task: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(null),
    },
  };
}

// --- Helpers ------------------------------------------------------------

async function makeUser(overrides = {}) {
  const passwordHash = await bcrypt.hash('password123', 10);
  return {
    id: 1,
    email: 'test@example.com',
    name: 'Test User',
    passwordHash,
    createdAt: new Date(),
    ...overrides,
  };
}

// --- Health check -------------------------------------------------------

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const app = createApp(buildMockPrisma());
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

// --- POST /auth/login ---------------------------------------------------

describe('POST /auth/login', () => {
  it('returns 400 when email or password is missing', async () => {
    const app = createApp(buildMockPrisma());
    const res = await request(app).post('/auth/login').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/);
  });

  it('returns 401 when user does not exist', async () => {
    const app = createApp(buildMockPrisma({ user: null }));
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'pass' });
    expect(res.status).toBe(401);
  });

  it('returns 401 when password is wrong', async () => {
    const user = await makeUser();
    const app = createApp(buildMockPrisma({ user }));
    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns 200 with token on valid credentials', async () => {
    const user = await makeUser();
    const app = createApp(buildMockPrisma({ user }));
    const res = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe(user.email);
  });
});

// --- POST /auth/register ------------------------------------------------

describe('POST /auth/register', () => {
  it('returns 400 when email or password is missing', async () => {
    const app = createApp(buildMockPrisma());
    const res = await request(app).post('/auth/register').send({ name: 'Test' });
    expect(res.status).toBe(400);
  });

  it('returns 409 when email is already in use', async () => {
    const user = await makeUser();
    const app = createApp(buildMockPrisma({ user }));
    const res = await request(app)
      .post('/auth/register')
      .send({ email: user.email, password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already in use/);
  });

  it('returns 201 with token when registration succeeds', async () => {
    const newUser = await makeUser({ id: 2, email: 'new@example.com' });
    // findUnique returns null (email not taken), create returns the new user
    const prisma = buildMockPrisma({ user: null, createUser: newUser });
    const app = createApp(prisma);
    const res = await request(app)
      .post('/auth/register')
      .send({ name: 'New User', email: 'new@example.com', password: 'password123' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.email).toBe('new@example.com');
  });
});

// --- GET /auth/me -------------------------------------------------------

describe('GET /auth/me', () => {
  it('returns 401 with no token', async () => {
    const app = createApp(buildMockPrisma());
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid token', async () => {
    const user = await makeUser();
    // Login first to get a real token
    const loginPrisma = buildMockPrisma({ user });
    const app = createApp(loginPrisma);

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email: user.email, password: 'password123' });
    const { token } = loginRes.body;

    // Now hit /auth/me — findUnique returns the user
    loginPrisma.user.findUnique.mockResolvedValue(user);

    const meRes = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBe(user.email);
  });
});
