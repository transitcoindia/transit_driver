import { PrismaClient } from '@prisma/client';

/**
 * Centralized Prisma Client with Connection Pooling
 * 
 * Prisma uses a connection pool internally. Configure via DATABASE_URL:
 * postgresql://user:password@host:port/db?connection_limit=20&pool_timeout=10
 * 
 * Recommended settings for production:
 * - connection_limit: 10-20 (for serverless/container environments)
 * - pool_timeout: 10-20 seconds
 * - For EC2: connection_limit=15-20 (depends on instance size)
 */

// Singleton pattern - prevents multiple Prisma instances
declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['query', 'error', 'warn'] 
    : ['error'],
  errorFormat: 'pretty',
});

// In development, store instance globally to prevent hot-reload issues
if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

// Log connection pool info on startup
console.log('📊 Prisma Client initialized with connection pooling');
console.log(`   DATABASE_URL configured: ${process.env.DATABASE_URL ? '✅' : '❌'}`);
if (process.env.DATABASE_URL) {
  const dbUrl = process.env.DATABASE_URL;
  const hasPoolConfig = dbUrl.includes('connection_limit');
  console.log(`   Connection pooling: ${hasPoolConfig ? '✅ Configured' : '⚠️ Using defaults'}`);
}

// Graceful shutdown
const shutdown = async () => {
  console.log('🛑 Closing Prisma connections...');
  await prisma.$disconnect();
  console.log('✅ Prisma disconnected');
};

process.on('beforeExit', shutdown);
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export { prisma };