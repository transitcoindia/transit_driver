import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';
/** Get Socket.IO server instance for emitting from HTTP routes (e.g. broadcast ride request). */
export declare function getSocketIO(): Server | null;
export declare const initializeSocketServer: (httpServer: HttpServer) => Server<import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, import("socket.io").DefaultEventsMap, any>;
/** Payload for new ride request (emitted to matching drivers). */
export interface NewRideRequestPayload {
    rideId: string;
    rideCode: string;
    pickupLatitude: number;
    pickupLongitude: number;
    pickupAddress?: string;
    dropLatitude?: number;
    dropLongitude?: number;
    dropAddress?: string;
    estimatedFare?: number;
    estimatedDistance?: number;
    estimatedDuration?: number;
    requestedVehicleType?: string;
}
/**
 * Emit new ride request to specific drivers (called from HTTP broadcast route).
 */
export declare function emitNewRideRequestToDrivers(driverIds: string[], payload: NewRideRequestPayload): void;
