import { Router, Request, Response } from 'express';
import { prisma } from '../prismaClient';

const router = Router();

/**
 * Enhanced Health Check Endpoint
 * Checks:
 * - Server status
 * - Database connectivity
 * - Database query performance
 */
router.get('/health', async (req: Request, res: Response) => {
  const healthCheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: {
        status: 'unknown',
        responseTime: null as number | null,
        error: null as string | null,
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
    await prisma.$queryRaw`SELECT 1`;
    const dbResponseTime = Date.now() - dbStartTime;
    healthCheck.services.database.status = 'connected';
    healthCheck.services.database.responseTime = dbResponseTime;
  } catch (error: any) {
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
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Quick database ping
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch (error: any) {
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
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

export default router;


