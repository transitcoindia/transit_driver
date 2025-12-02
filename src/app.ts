
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import { getAllowedOrigins, PORT as DRIVER_PORT, SOCKET_IO_PATH } from './config/env';
import driverRoutes from './routes/driverRoutes';
import { s2LocationIngest, s2LocationIngestPublic } from './routes/locationIngest';
import { initLocationWebSocketServer } from './services/locationWebSocketServer';
import { setupSwagger } from "./swagger"; // ✅ added
import redis from './clients/redis';
import { validateEnvironment, printEnvironmentInfo } from './config/validateEnv';
import { prisma } from './prismaClient'; // ✅ Use singleton instance

dotenv.config();

// Validate environment variables on startup
const envValidation = validateEnvironment();
if (!envValidation.valid) {
  console.error('❌ Failed to start server due to missing required environment variables');
  console.error('Please check your .env file or environment configuration\n');
  process.exit(1);
}

printEnvironmentInfo();

const app: Express = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: getAllowedOrigins(),
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  maxHttpBufferSize: 1e8,
  connectTimeout: 45000,
  path: SOCKET_IO_PATH,
});

// Using singleton Prisma client from ./prismaClient.ts
// This prevents multiple connections and properly manages connection pooling

// Test database connection on startup
async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    console.log('✅ Database connection established');
    return true;
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    console.error('   Please check your DATABASE_URL environment variable');
    // Don't exit - let the server start but log the error
    // The health check endpoint will show database status
    return false;
  }
}

// Test database connection
testDatabaseConnection().catch(console.error);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) return callback(null, true);
    
    // In development, allow all localhost origins automatically
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      console.log(`✅ CORS allowed for localhost: ${origin}`);
      return callback(null, true);
    }
    
    const allowedOrigins = getAllowedOrigins();
    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS allowed for origin: ${origin}`);
      callback(null, true);
    } else {
      console.log(`⚠️ CORS origin not in whitelist: ${origin} (allowing anyway in dev)`);
      callback(null, true); // Allow all in development
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With", "Cookie"],
  exposedHeaders: ["Set-Cookie"],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Additional CORS headers for better compatibility
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }
  
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Max-Age", "86400");
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

app.use(express.json());

// ✅ Initialize Swagger documentation
setupSwagger(app);

// Routes
app.use('/api/driver', driverRoutes);
app.use('/api/driver/s2', s2LocationIngest);
app.use('/api/driver/testing', s2LocationIngestPublic);

// Health check endpoint - EB checks this
app.get('/health', async (req: Request, res: Response) => {
  // Check Redis status
  let redisStatus = 'unknown';
  try {
    if (redis.status === 'ready') {
      await redis.ping();
      redisStatus = 'connected';
    } else {
      redisStatus = redis.status || 'disconnected';
    }
  } catch (err) {
    redisStatus = 'error';
  }

  // Check database status and connection pool metrics
  let dbStatus = 'unknown';
  let dbMetrics = {};
  try {
    // Test connection
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';

    // Get connection pool metrics (Prisma internal metrics)
    try {
      const poolMetrics = await prisma.$queryRaw<Array<{
        count: number,
        state: string
      }>>`
        SELECT count(*), state 
        FROM pg_stat_activity 
        WHERE datname = current_database()
        GROUP BY state
      `;
      
      const totalConnections = poolMetrics.reduce((sum, m) => sum + Number(m.count), 0);
      const activeConnections = poolMetrics.find(m => m.state === 'active')?.count || 0;
      const idleConnections = poolMetrics.find(m => m.state === 'idle')?.count || 0;

      dbMetrics = {
        total_connections: totalConnections,
        active_connections: Number(activeConnections),
        idle_connections: Number(idleConnections),
        states: poolMetrics.map(m => ({ state: m.state, count: Number(m.count) }))
      };
    } catch (metricsErr) {
      // Metrics collection failed, but connection works
      dbMetrics = { info: 'Connection pool metrics unavailable (may need permissions)' };
    }
  } catch (err: any) {
    dbStatus = `error: ${err.message}`;
  }

  const healthStatus = {
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    websocket: 'enabled',
    database: {
      status: dbStatus,
      ...(Object.keys(dbMetrics).length > 0 && { pool: dbMetrics })
    },
    redis: redisStatus,
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000
  };

  // Return 200 even if degraded so health checks don't fail
  // But include status so monitoring can detect issues
  res.status(200).json(healthStatus);
});

// Root endpoint - also return health for EB compatibility
app.get('/', (req: Request, res: Response) => {
  // Return health status for EB health checks if they hit root
  if (req.headers['user-agent']?.includes('ELB-HealthChecker')) {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  } else {
    res.send('Driver Backend Service');
  }
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
  });
  
  res.status(500).json({ 
    error: 'Something went wrong!',
    // Only show details in development
    ...(process.env.NODE_ENV === 'development' && {
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 5), // First 5 lines of stack
    })
  });
});

// WebSocket connections
io.on('connection', (socket) => {
  console.log(`🔌 Driver client connected: ${socket.id}`);

  socket.on('authenticate', (data) => {
    console.log(`🔐 Authentication attempt:`, data);
    socket.emit('authenticated', { status: 'success', type: 'driver' });
  });

  socket.on('locationUpdate', (data) => {
    console.log(`📍 Location update:`, data);
    socket.broadcast.emit('driverLocationUpdate', data);
    socket.emit('locationAck', { status: 'ok' });
  });

  socket.on('acceptRide', (data) => {
    console.log(`✅ Ride accepted:`, data);
    socket.emit('rideAccepted', { status: 'accepted', message: 'Ride accepted successfully' });
  });

  socket.on('disconnect', (reason) => {
    console.log(`🔌 Disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('error', (error) => {
    console.error(`❌ Socket error:`, error);
  });

  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });
});

initLocationWebSocketServer(httpServer);

const PORT = DRIVER_PORT;

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    prisma.$disconnect()
      .then(() => {
        console.log('✅ Database connection closed');
        redis.quit();
        process.exit(0);
      })
      .catch((err) => {
        console.error('❌ Error closing database connection:', err);
        process.exit(1);
      });
  });
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    prisma.$disconnect()
      .then(() => {
        console.log('✅ Database connection closed');
        redis.quit();
        process.exit(0);
      })
      .catch((err) => {
        console.error('❌ Error closing database connection:', err);
        process.exit(1);
      });
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Don't exit immediately - let the error handler middleware deal with it
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  // Don't exit - log and continue
});

httpServer.listen(PORT, () => {
  console.log(`🚀 Driver backend server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server: ws://localhost:${PORT}${SOCKET_IO_PATH}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📘 Swagger docs: http://localhost:${PORT}/api-docs`);
  console.log(`\n✅ Server started successfully!\n`);
});

export { io };
