import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
// import morgan from 'morgan';
import { PrismaClient } from '@prisma/client';
import { createServer } from 'http';
import dotenv from 'dotenv';
import  driverRoutes  from './routes/driverRoutes'
// import { initializeSocketServer } from './socket/socketServer';

// Load environment variables
dotenv.config();

// Initialize Express app
const app: Express = express();
const httpServer = createServer(app);
  
// Initialize Prisma
const prisma = new PrismaClient();

// Initialize Socket.IO
// initializeSocketServer(httpServer);

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
  res.send('Hello World');
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});
