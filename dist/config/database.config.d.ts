/**
 * Database Configuration for Scalability
 *
 * This file centralizes database connection pool configuration
 * for optimal performance and scalability.
 */
/**
 * Calculate optimal connection pool size based on:
 * - Number of CPU cores
 * - Expected concurrent requests
 * - Database capacity
 *
 * Formula: connection_limit = (number_of_cores * 2) + effective_spindle_count
 * For serverless/container: use conservative limits
 */
export declare const getDatabasePoolConfig: () => {
    url: string;
    connectionLimit: number;
    poolTimeout: number;
    originalUrl?: undefined;
} | {
    url: string;
    connectionLimit: number;
    poolTimeout: number;
    originalUrl: string;
};
/**
 * Prisma Client Configuration
 *
 * For optimal performance:
 * - Use connection pooling via DATABASE_URL
 * - Use DIRECT_URL for migrations and schema operations
 */
export declare const prismaConfig: {
    log: string[];
    errorFormat: string;
};
export declare const dbPoolConfig: {
    url: string;
    connectionLimit: number;
    poolTimeout: number;
    originalUrl?: undefined;
} | {
    url: string;
    connectionLimit: number;
    poolTimeout: number;
    originalUrl: string;
};
