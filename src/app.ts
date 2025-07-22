import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
// import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import  driverRoutes  from './routes/driverRoutes'
import { DriverWebSocketClient } from './services/websocketClient';
// import { initializeSocketServer } from './socket/socketServer';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Express = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_APP_URL || 'http://localhost:3000',
    methods: ["GET", "POST"],
    credentials: true
  }
});

// --- WebSocket Authentication Middleware ---
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error: No token provided'));
  if (!process.env.JWT_SECRET) {
    return next(new Error('Authentication error: JWT_SECRET is not defined'));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.data.driver = decoded; // Attach driver info to socket
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid token'));
  }
});

// --- WebSocket Event Handlers ---
io.on('connection', (socket) => {
  const driverId = socket.data.driver && socket.data.driver.id;
  console.log('Driver connected:', driverId, socket.id);

  // Handle location updates from driver
  socket.on('locationUpdate', (location) => {
    // TODO: Save to DB, broadcast to backend/rider, etc.
    // Example: io.emit('driverLocationUpdate', { driverId, ...location });
    console.log('Location update from driver', driverId, location);
  });

  // Handle ride offer response
  socket.on('rideOfferResponse', (data) => {
    // data: { rideId, accepted: true/false }
    // TODO: Update ride status, notify backend/rider
    console.log('Ride offer response from driver', driverId, data);
  });

  // Handle ride status updates
  socket.on('rideStatusUpdate', (data) => {
    // data: { rideId, status }
    // TODO: Update ride status in DB, notify backend/rider
    console.log('Ride status update from driver', driverId, data);
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log('Driver disconnected:', driverId, reason);
    // TODO: Mark driver offline, clean up, etc.
  });
});

// Initialize Prisma
const prisma = new PrismaClient();

// Initialize WebSocket client
const driverWebSocketClient = new DriverWebSocketClient(process.env.DRIVER_ID || 'default_driver_id');

driverWebSocketClient.onRideOffer((offer, respond) => {
  console.log('Received ride offer:', offer);
  // TODO: Add business logic/UI to accept/decline
  // Example: respond('accept', offer.offerId); // To accept
  // Example: respond('decline', offer.offerId); // To decline
  // For production, integrate with driver app UI or workflow
});

// Connect to WebSocket server
driverWebSocketClient.connect().catch(error => {
  console.error('Failed to connect to WebSocket server:', error);
});

// Middleware
app.use(cors());
app.use(express.json());
//app.use(morgan('dev'));

// Routes
app.use('/api/driver', driverRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.get('/', (req: Request, res: Response) => {
  res.send('Driver Backend Service');
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Driver backend server running on http://localhost:${PORT}`);
});
