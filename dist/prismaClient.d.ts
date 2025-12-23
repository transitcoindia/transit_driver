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
declare global {
    var prisma: PrismaClient | undefined;
}
declare const prisma: PrismaClient<import(".prisma/client").Prisma.PrismaClientOptions, never, import("@prisma/client/runtime/library").DefaultArgs>;
export { prisma };
