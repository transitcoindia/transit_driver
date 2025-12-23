"use strict";
/**
 * Database Configuration for Scalability
 *
 * This file centralizes database connection pool configuration
 * for optimal performance and scalability.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbPoolConfig = exports.prismaConfig = exports.getDatabasePoolConfig = void 0;
/**
 * Calculate optimal connection pool size based on:
 * - Number of CPU cores
 * - Expected concurrent requests
 * - Database capacity
 *
 * Formula: connection_limit = (number_of_cores * 2) + effective_spindle_count
 * For serverless/container: use conservative limits
 */
const getDatabasePoolConfig = () => {
    const env = process.env.NODE_ENV || 'development';
    // Default pool size - adjust based on your database capacity
    const defaultPoolSize = env === 'production' ? 20 : 10;
    // Get pool size from environment or use default
    const connectionLimit = parseInt(process.env.DATABASE_POOL_SIZE || process.env.DATABASE_CONNECTION_LIMIT || String(defaultPoolSize), 10);
    const poolTimeout = parseInt(process.env.DATABASE_POOL_TIMEOUT || '10', 10);
    // Parse DATABASE_URL and add connection pool parameters
    const databaseUrl = process.env.DATABASE_URL || '';
    // Check if connection_limit is already in URL
    if (databaseUrl.includes('connection_limit')) {
        // URL already has pool config, use as-is
        return {
            url: databaseUrl,
            connectionLimit,
            poolTimeout
        };
    }
    // Add connection pool parameters to URL
    const separator = databaseUrl.includes('?') ? '&' : '?';
    const pooledUrl = `${databaseUrl}${separator}connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}`;
    return {
        url: pooledUrl,
        connectionLimit,
        poolTimeout,
        // Also return original URL for Prisma Direct URL
        originalUrl: databaseUrl
    };
};
exports.getDatabasePoolConfig = getDatabasePoolConfig;
/**
 * Prisma Client Configuration
 *
 * For optimal performance:
 * - Use connection pooling via DATABASE_URL
 * - Use DIRECT_URL for migrations and schema operations
 */
exports.prismaConfig = {
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'pretty',
    // Connection pool is handled via DATABASE_URL query params
};
// Export pool configuration
exports.dbPoolConfig = (0, exports.getDatabasePoolConfig)();
console.log('📊 Database Pool Configuration:');
console.log(`   Connection Limit: ${exports.dbPoolConfig.connectionLimit}`);
console.log(`   Pool Timeout: ${exports.dbPoolConfig.poolTimeout}s`);
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
//# sourceMappingURL=database.config.js.map