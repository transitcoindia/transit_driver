"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const prisma = global.prisma || new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: 'pretty',
});
exports.prisma = prisma;
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
//# sourceMappingURL=prismaClient.js.map