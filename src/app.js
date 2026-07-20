const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const logger = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const DEFAULT_USER = {
  email: process.env.AUTH_EMAIL || 'admin@task.local',
  password: process.env.AUTH_PASSWORD || 'password123',
  name: process.env.AUTH_NAME || 'Task Admin',
};

/**
 * Build and return the Express app.
 * Accepts a prisma client instance so tests can inject a mock.
 */
function createApp(prisma) {
  const app = express();

  // --- Middleware ----------------------------------------------------------
  app.use(express.json());
  app.use(cors());

  // HTTP request logging (skip in test env to keep output clean)
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  // --- Helpers ------------------------------------------------------------
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
      logger.warn('Token verification failed', { error: err.message });
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  function serializeUser(user) {
    return { id: user.id, email: user.email, name: user.name };
  }

  // --- Health check -------------------------------------------------------
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // --- Auth ---------------------------------------------------------------
  app.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      logger.info('Login attempt', { email: normalizedEmail });

      const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      if (!user) {
        logger.warn('Login failed - user not found', { email: normalizedEmail });
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const passwordMatches = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatches) {
        logger.warn('Login failed - wrong password', { email: normalizedEmail });
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      logger.info('Login successful', { userId: user.id, email: normalizedEmail });
      return res.status(200).json({ token: createToken(user), user: serializeUser(user) });
    } catch (err) {
      logger.error('Login error', { error: err.message });
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
      logger.info('Register attempt', { email: normalizedEmail });

      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        return res.status(409).json({ error: 'Email is already in use' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { email: normalizedEmail, name: trimmedName || null, passwordHash },
      });

      logger.info('User registered', { userId: user.id, email: normalizedEmail });
      return res.status(201).json({ token: createToken(user), user: serializeUser(user) });
    } catch (err) {
      logger.error('Register error', { error: err.message });
      return res.status(500).json({ error: 'Failed to register user' });
    }
  });

  app.get('/auth/me', authenticateToken, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.auth.userId },
        select: { id: true, email: true, name: true, createdAt: true },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.status(200).json({ user });
    } catch (err) {
      logger.error('Auth/me error', { error: err.message });
      return res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  // --- Tasks (all routes require auth) ------------------------------------
  app.use('/tasks', authenticateToken);

  app.get('/tasks', async (req, res) => {
    try {
      const tasks = await prisma.task.findMany({
        where: { userId: req.auth.userId },
        orderBy: { id: 'asc' },
      });
      logger.debug('Fetched tasks', { userId: req.auth.userId, count: tasks.length });
      res.status(200).json(tasks);
    } catch (err) {
      logger.error('Fetch tasks error', { error: err.message });
      res.status(500).json({ error: 'Failed to fetch tasks' });
    }
  });

  app.get('/tasks/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'id must be a number' });

      const task = await prisma.task.findFirst({ where: { id, userId: req.auth.userId } });
      if (!task) return res.status(404).json({ error: 'Task not found' });

      res.status(200).json(task);
    } catch (err) {
      logger.error('Fetch task error', { error: err.message });
      res.status(500).json({ error: 'Failed to fetch task' });
    }
  });

  app.post('/tasks', async (req, res) => {
    try {
      const { title } = req.body;
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'title is required and must be a non-empty string' });
      }

      const task = await prisma.task.create({
        data: { title: title.trim(), userId: req.auth.userId },
      });
      logger.info('Task created', { taskId: task.id, userId: req.auth.userId });
      res.status(201).json(task);
    } catch (err) {
      logger.error('Create task error', { error: err.message });
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  app.put('/tasks/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'id must be a number' });

      const existing = await prisma.task.findFirst({ where: { id, userId: req.auth.userId } });
      if (!existing) return res.status(404).json({ error: 'Task not found' });

      const { title, completed } = req.body;
      const data = {};
      if (title !== undefined) data.title = title;
      if (completed !== undefined) data.completed = completed;

      const task = await prisma.task.update({ where: { id }, data });
      logger.info('Task updated', { taskId: id, userId: req.auth.userId });
      res.status(200).json(task);
    } catch (err) {
      logger.error('Update task error', { error: err.message });
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  app.delete('/tasks/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) return res.status(400).json({ error: 'id must be a number' });

      const existing = await prisma.task.findFirst({ where: { id, userId: req.auth.userId } });
      if (!existing) return res.status(404).json({ error: 'Task not found' });

      await prisma.task.delete({ where: { id } });
      logger.info('Task deleted', { taskId: id, userId: req.auth.userId });
      res.status(204).send();
    } catch (err) {
      logger.error('Delete task error', { error: err.message });
      res.status(500).json({ error: 'Failed to delete task' });
    }
  });

  return app;
}

module.exports = { createApp, DEFAULT_USER };
