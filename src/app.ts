import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
// import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import  driverRoutes  from './routes/driverRoutes'
import { initLocationWebSocketServer } from './services/locationWebSocketServer';
// import { DriverWebSocketClient } from './services/websocketClient';
// import { initializeSocketServer } from './socket/socketServer';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Express = express();
const httpServer = createServer(app);

// Initialize Socket.IO server for production-ready WebSocket support
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: [
      process.env.API_GATEWAY_URL || 'http://localhost:3005',
      process.env.RIDER_BACKEND_URL || 'http://localhost:8000',
      process.env.FRONTEND_APP_URL || 'http://localhost:3000',
      'https://www.shankhtech.com',
      'https://pramaan.ondc.org',
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  },
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  transports: ['websocket', 'polling'], // Enable both WebSocket and polling
  allowEIO3: true, // Allow Engine.IO v3 clients
  maxHttpBufferSize: 1e8, // 100 MB
  connectTimeout: 45000, // 45 seconds
});
  
// Initialize Prisma
const prisma = new PrismaClient();

// Initialize WebSocket client
// const driverWebSocketClient = new DriverWebSocketClient(process.env.DRIVER_ID || 'default_driver_id');

// Connect to WebSocket server
// driverWebSocketClient.connect().catch(error => {
//   console.error('Failed to connect to WebSocket server:', error);
// });

// Middleware
app.use(cors({
  origin: [
    process.env.API_GATEWAY_URL || 'http://localhost:3005',
    process.env.RIDER_BACKEND_URL || 'http://localhost:8000',
    process.env.FRONTEND_APP_URL || 'http://localhost:3000',
    'https://www.shankhtech.com',
    'https://pramaan.ondc.org',
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
}));
app.use(express.json());
//app.use(morgan('dev'));

// Routes
app.use('/api/driver', driverRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    websocket: 'enabled',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.get('/', (req: Request, res: Response) => {
  res.send('Driver Backend Service');
});

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`🔌 Driver client connected: ${socket.id}`);
  
  // Handle driver authentication
  socket.on('authenticate', (data) => {
    try {
      console.log(`🔐 Driver authentication attempt from ${socket.id}:`, data);
      socket.emit('authenticated', { status: 'success', type: 'driver' });
    } catch (error) {
      console.error('Driver authentication error:', error);
      socket.emit('error', { message: 'Authentication failed' });
    }
  });

  // Handle location updates
  socket.on('locationUpdate', (data) => {
    console.log(`📍 Location update from ${socket.id}:`, data);
    // Broadcast location update to all connected clients
    socket.broadcast.emit('driverLocationUpdate', data);
    socket.emit('locationAck', { status: 'ok' });
  });

  // Handle ride acceptance
  socket.on('acceptRide', (data) => {
    console.log(`✅ Ride acceptance from ${socket.id}:`, data);
    socket.emit('rideAccepted', { status: 'accepted', message: 'Ride accepted successfully' });
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Driver client disconnected: ${socket.id}, reason: ${reason}`);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error(`❌ Driver socket error for ${socket.id}:`, error);
  });

  // Heartbeat/ping to keep connection alive
  socket.on('ping', () => {
    socket.emit('pong', { timestamp: Date.now() });
  });
});

// Start WebSocket server on the same HTTP server
initLocationWebSocketServer(httpServer);

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Driver backend server running on port http://localhost:${PORT}`);
  console.log(`🔌 WebSocket server is ready on ws://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ HTTP server closed');
    process.exit(0);
  });
});

export { io };
