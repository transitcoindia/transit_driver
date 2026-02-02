import express, { Express, Request, Response, NextFunction } from 'express';
import cors, { CorsOptions } from 'cors';
// import morgan from 'morgan';
import { createServer } from 'http';
import dotenv from 'dotenv';
import  driverRoutes  from './routes/driverRoutes'
import { initializeSocketServer } from './socket/socketServer';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Express = express();
const httpServer = createServer(app);

// Initialize Socket.IO (drivers connect when online to receive ride requests)
initializeSocketServer(httpServer);

// CORS Configuration
// Allow all origins for now - can be restricted in production via CORS_ORIGIN env var
const corsOptions: CorsOptions = {
  origin: process.env.CORS_ORIGIN || true, // Allow all origins if not specified
  credentials: false, // Set to false when using Bearer tokens (not cookies)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
};

// Middleware - Apply CORS before other middleware
app.use(cors(corsOptions));
app.use(express.json());
//app.use(morgan('dev'));

// Routes
app.use('/api/driver', driverRoutes);

// Health check routes
import healthRoutes from './routes/healthRoutes';
app.use('/', healthRoutes);

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World');
});

// Error handling middleware (must be last)
import errorHandler from './middleware/errorHandler';
app.use(errorHandler as express.ErrorRequestHandler);

// Start server
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
