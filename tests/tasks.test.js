const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createApp } = require('../src/app');

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

function makeTask(overrides = {}) {
  return {
    id: 1,
    title: 'Test task',
    completed: false,
    createdAt: new Date(),
    userId: 1,
    ...overrides,
  };
}

function buildMockPrisma({ user = null, tasks = [], task = null } = {}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      create: jest.fn(),
    },
    task: {
      findMany: jest.fn().mockResolvedValue(tasks),
      findFirst: jest.fn().mockResolvedValue(task),
      create: jest.fn().mockResolvedValue(task),
      update: jest.fn().mockResolvedValue(task),
      delete: jest.fn().mockResolvedValue(task),
    },
  };
}

// Get a valid JWT by logging in against the mock
async function getToken(app, user) {
  const res = await request(app)
    .post('/auth/login')
    .send({ email: user.email, password: 'password123' });
  return res.body.token;
}

// --- GET /tasks ---------------------------------------------------------

describe('GET /tasks', () => {
  it('returns 401 without a token', async () => {
    const app = createApp(buildMockPrisma());
    const res = await request(app).get('/tasks');
    expect(res.status).toBe(401);
  });

  it('returns empty array when user has no tasks', async () => {
    const user = await makeUser();
    const prisma = buildMockPrisma({ user, tasks: [] });
    const app = createApp(prisma);
    const token = await getToken(app, user);

    const res = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns tasks for the authenticated user', async () => {
    const user = await makeUser();
    const tasks = [makeTask(), makeTask({ id: 2, title: 'Second task' })];
    const prisma = buildMockPrisma({ user, tasks });
    const app = createApp(prisma);
    const token = await getToken(app, user);

    const res = await request(app)
      .get('/tasks')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].title).toBe('Test task');
  });
});

// --- POST /tasks --------------------------------------------------------

describe('POST /tasks', () => {
  it('returns 400 when title is missing', async () => {
    const user = await makeUser();
    const prisma = buildMockPrisma({ user });
    const app = createApp(prisma);
    const token = await getToken(app, user);

    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  it('returns 400 when title is blank whitespace', async () => {
    const user = await makeUser();
    const prisma = buildMockPrisma({ user });
    const app = createApp(prisma);
    const token = await getToken(app, user);

    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '   ' });
    expect(res.status).toBe(400);
  });

  it('creates a task and returns 201', async () => {
    const user = await makeUser();
    const newTask = makeTask({ title: 'Buy milk' });
    const prisma = buildMockPrisma({ user, task: newTask });
    const app = createApp(prisma);
    const token = await getToken(app, user);

    const res = await request(app)
      .post('/tasks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Buy milk' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Buy milk');
  });
});

// --- PUT /tasks/:id -----------------------------------------------------

describe('PUT /tasks/:id', () => {
  it('returns 404 when task does not exist', async () => {
    const user = await makeUser();
    const prisma = buildMockPrisma({ user, task: null });
    const app = createApp(prisma);
    const token = await getToken(app, user);

    const res = await request(app)
      .put('/tasks/99')
      .set('Authorization', `Bearer ${token}`)
      .send({ completed: true });
    expect(res.status).toBe(404);
  });

  it('updates a task and returns 200', async () => {
    const user = await makeUser();
    const existing = makeTask();
    const updated = { ...existing, completed: true };
    const prisma = buildMockPrisma({ user, task: existing });
    prisma.task.update.mockResolvedValue(updated);
    const app = createApp(prisma);
    const token = await getToken(app, user);

    const res = await request(app)
      .put('/tasks/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ completed: true });
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });
});

// --- DELETE /tasks/:id --------------------------------------------------

describe('DELETE /tasks/:id', () => {
  it('returns 404 when task does not exist', async () => {
    const user = await makeUser();
    const prisma = buildMockPrisma({ user, task: null });
    const app = createApp(prisma);
    const token = await getToken(app, user);

    const res = await request(app)
      .delete('/tasks/99')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('deletes a task and returns 204', async () => {
    const user = await makeUser();
    const existing = makeTask();
    const prisma = buildMockPrisma({ user, task: existing });
    const app = createApp(prisma);
    const token = await getToken(app, user);

    const res = await request(app)
      .delete('/tasks/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });
});
