
import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import { getAllowedOrigins, PORT as DRIVER_PORT, SOCKET_IO_PATH } from './config/env';
import driverRoutes from './routes/driverRoutes';
import { s2LocationIngest, s2LocationIngestPublic } from './routes/locationIngest';
import { initLocationWebSocketServer } from './services/locationWebSocketServer';
import { setupSwagger } from "./swagger"; // ✅ added
import redis from './clients/redis';

dotenv.config();

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

const prisma = new PrismaClient();

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

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket: 'enabled',
    redis: redisStatus,
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000
  });
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

// Request logging middleware (before routes)
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  // Log request
  console.log(`📥 ${req.method} ${req.url}`, {
    ip: req.ip || req.headers['x-forwarded-for'],
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`📤 ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('❌ Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    headers: req.headers,
  });
  
  // Ensure response is sent even if there's an error
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Something went wrong!',
      // Only show details in development
      ...(process.env.NODE_ENV === 'development' && {
        message: err.message,
        stack: err.stack?.split('\n').slice(0, 5), // First 5 lines of stack
      })
    });
  }
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

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason: unknown, promise: Promise<any>) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process - log and continue
});

process.on('uncaughtException', (error: Error) => {
  console.error('❌ Uncaught Exception:', error);
  // Log but don't exit - allow the process to continue
  // In production, you might want to exit gracefully here
});

const PORT = DRIVER_PORT;
httpServer.listen(PORT, () => {
  console.log(`🚀 Driver backend server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server: ws://localhost:${PORT}${SOCKET_IO_PATH}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📘 Swagger docs: http://localhost:${PORT}/api-docs`);
});

export { io };
