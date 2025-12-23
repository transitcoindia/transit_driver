"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prismaClient_1 = require("../prismaClient");
const router = (0, express_1.Router)();
/**
 * Enhanced Health Check Endpoint
 * Checks:
 * - Server status
 * - Database connectivity
 * - Database query performance
 */
router.get('/health', async (req, res) => {
    const healthCheck = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        services: {
            database: {
                status: 'unknown',
                responseTime: null,
                error: null,
            },
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                unit: 'MB',
            },
        },
    };
    // Test database connectivity
    const dbStartTime = Date.now();
    try {
        await prismaClient_1.prisma.$queryRaw `SELECT 1`;
        const dbResponseTime = Date.now() - dbStartTime;
        healthCheck.services.database.status = 'connected';
        healthCheck.services.database.responseTime = dbResponseTime;
    }
    catch (error) {
        healthCheck.services.database.status = 'disconnected';
        healthCheck.services.database.error = error.message;
        healthCheck.status = 'degraded';
    }
    const statusCode = healthCheck.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthCheck);
});
/**
 * Readiness Check
 * Used by load balancers/containers to determine if service is ready
 */
router.get('/ready', async (req, res) => {
    try {
        // Quick database ping
        await prismaClient_1.prisma.$queryRaw `SELECT 1`;
        res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
    }
    catch (error) {
        res.status(503).json({
            status: 'not ready',
            error: 'Database connection failed',
            timestamp: new Date().toISOString()
        });
    }
});
/**
 * Liveness Check
 * Used by containers to determine if service is alive
 */
router.get('/live', (req, res) => {
    res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});
exports.default = router;
//# sourceMappingURL=healthRoutes.js.map