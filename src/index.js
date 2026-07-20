const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');
const { createApp, DEFAULT_USER } = require('./app');
const logger = require('./logger');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const PORT = process.env.PORT || 3000;

async function ensureDefaultUser() {
  const existing = await prisma.user.findUnique({
    where: { email: DEFAULT_USER.email },
  });

  if (existing) {
    logger.debug('Default user already exists', { email: DEFAULT_USER.email });
    return existing;
  }

  const passwordHash = await bcrypt.hash(DEFAULT_USER.password, 10);
  const user = await prisma.user.create({
    data: {
      email: DEFAULT_USER.email,
      name: DEFAULT_USER.name,
      passwordHash,
    },
  });
  logger.info('Default user created', { email: user.email });
  return user;
}

async function start() {
  await prisma.$connect();
  logger.info('Database connected');

  await ensureDefaultUser();

  const app = createApp(prisma);

  app.listen(PORT, () => {
    logger.info(`Task API listening on port ${PORT}`);
  });
}

start().catch((error) => {
  logger.error('Failed to start server', { error: error.message });
  process.exit(1);
});
