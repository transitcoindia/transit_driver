"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSocketServer = void 0;
const socket_io_1 = require("socket.io");
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const initializeSocketServer = (httpServer) => {
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: process.env.CORS_ORIGIN || "*",
            methods: ["GET", "POST"]
        }
    });
    io.on('connection', (socket) => {
        console.log('New client connected');
        // Driver authentication
        socket.on('driver:authenticate', async (token) => {
            try {
                // Verify driver token and get driver info
                const driver = await prisma.driver.findUnique({
                    where: { id: token }
                });
                if (driver) {
                    socket.join(`driver:${driver.id}`);
                    socket.emit('driver:authenticated', { success: true });
                }
                else {
                    socket.emit('driver:authenticated', { success: false, error: 'Invalid token' });
                }
            }
            catch (error) {
                console.error('Driver authentication error:', error);
                socket.emit('driver:authenticated', { success: false, error: 'Authentication failed' });
            }
        });
        // Driver location updates
        socket.on('driver:location_update', async (data) => {
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
            }
            catch (error) {
                console.error('Location update error:', error);
            }
        });
        // Handle ride requests
        socket.on('driver:ride_request', async (request) => {
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
            }
            catch (error) {
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
exports.initializeSocketServer = initializeSocketServer;
//# sourceMappingURL=socketServer.js.map