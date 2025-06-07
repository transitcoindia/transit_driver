import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const initializeSocketServer = (httpServer: HttpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || "*",
      methods: ["GET", "POST"]
    }
  });

  io.on('connection', (socket) => {
    console.log('New client connected');

    // Driver authentication
    socket.on('driver:authenticate', async (token: string) => {
      try {
        // Verify driver token and get driver info
        const driver = await prisma.driver.findUnique({
          where: { id: token }
        });

        if (driver) {
          socket.join(`driver:${driver.id}`);
          socket.emit('driver:authenticated', { success: true });
        } else {
          socket.emit('driver:authenticated', { success: false, error: 'Invalid token' });
        }
      } catch (error) {
        console.error('Driver authentication error:', error);
        socket.emit('driver:authenticated', { success: false, error: 'Authentication failed' });
      }
    });

    // Driver location updates
    socket.on('driver:location_update', async (data: { 
      driverId: string;
      latitude: number;
      longitude: number;
    }) => {
      try {
        // Update driver location in database
        await prisma.driverLocation.upsert({
          where: { driverId: data.driverId },
          update: {
            latitude: data.latitude,
            longitude: data.longitude,
            lastUpdatedAt: new Date()
          },
          create: {
            driverId: data.driverId,
            latitude: data.latitude,
            longitude: data.longitude
          }
        });

        // Broadcast to relevant riders
        io.to(`driver:${data.driverId}`).emit('driver:location', data);
      } catch (error) {
        console.error('Location update error:', error);
      }
    });

    // Handle ride requests
    socket.on('driver:ride_request', async (request: {
      requestId: string;
      driverId: string;
      response: 'accept' | 'reject';
    }) => {
      try {
        if (request.response === 'accept') {
          // Update ride request status
          await prisma.rideRequest.update({
            where: { id: request.requestId },
            data: {
              status: 'ACCEPTED',
              assignedDriverId: request.driverId,
              acceptedAt: new Date()
            }
          });

          // Notify rider
          io.to(`request:${request.requestId}`).emit('ride:accepted', {
            requestId: request.requestId,
            driverId: request.driverId
          });
        }
      } catch (error) {
        console.error('Ride request handling error:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('Client disconnected');
    });
  });

  return io;
}; 