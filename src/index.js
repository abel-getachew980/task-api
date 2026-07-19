const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const app = express();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const DEFAULT_USER = {
  email: process.env.AUTH_EMAIL || 'admin@task.local',
  password: process.env.AUTH_PASSWORD || 'password123',
  name: process.env.AUTH_NAME || 'Task Admin',
};

app.use(express.json());
app.use(cors());

function createToken(user) {
  return jwt.sign(
    { email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, subject: String(user.id) },
  );
}

function authenticateToken(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.auth = {
      userId: Number(decoded.sub),
      email: decoded.email,
      name: decoded.name,
    };

    if (Number.isNaN(req.auth.userId)) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function ensureDefaultUser() {
  const existing = await prisma.user.findUnique({
    where: { email: DEFAULT_USER.email },
  });

  if (existing) {
    return existing;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_USER.password, 10);
  return prisma.user.create({
    data: {
      email: DEFAULT_USER.email,
      name: DEFAULT_USER.name,
      passwordHash,
    },
  });
}

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}

// --- Health check --------------------------------------------------------
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// --- Auth ----------------------------------------------------------------
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    return res.status(200).json({
      token: createToken(user),
      user: serializeUser(user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const trimmedName = typeof name === 'string' ? name.trim() : '';

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'Email is already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name: trimmedName || null,
        passwordHash,
      },
    });

    return res.status(201).json({
      token: createToken(user),
      user: serializeUser(user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

app.get('/auth/me', authenticateToken, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.status(200).json({ user });
});

app.use('/tasks', authenticateToken);

// --- GET /tasks : list all tasks -----------------------------------------
app.get('/tasks', async (req, res) => {
  try {
    const tasks = await prisma.task.findMany({
      where: { userId: req.auth.userId },
      orderBy: { id: 'asc' },
    });
    res.status(200).json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// --- GET /tasks/:id : get a single task -----------------------------------
app.get('/tasks/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'id must be a number' });

    const task = await prisma.task.findFirst({
      where: { id, userId: req.auth.userId },
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    res.status(200).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// --- POST /tasks : create a task ------------------------------------------
app.post('/tasks', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title is required and must be a non-empty string' });
    }

    const task = await prisma.task.create({
      data: { title: title.trim(), userId: req.auth.userId },
    });
    res.status(201).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// --- PUT /tasks/:id : update a task ---------------------------------------
app.put('/tasks/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'id must be a number' });

    const existing = await prisma.task.findFirst({
      where: { id, userId: req.auth.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const { title, completed } = req.body;
    const data = {};
    if (title !== undefined) data.title = title;
    if (completed !== undefined) data.completed = completed;

    const task = await prisma.task.update({ where: { id }, data });
    res.status(200).json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// --- DELETE /tasks/:id : delete a task ------------------------------------
app.delete('/tasks/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'id must be a number' });

    const existing = await prisma.task.findFirst({
      where: { id, userId: req.auth.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    await prisma.task.delete({ where: { id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

async function start() {
  await prisma.$connect();
  await ensureDefaultUser();

  app.listen(PORT, () => {
    console.log(`Task API listening on port ${PORT}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
