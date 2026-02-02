import { Request, Response } from 'express';
import { emitNewRideRequestToDrivers, NewRideRequestPayload } from '../../socket/socketServer';

/**
 * Internal endpoint for transit_backend to broadcast a new ride request to matching drivers.
 * POST /api/driver/internal/broadcast-ride-request
 * Body: { driverIds: string[], ride: NewRideRequestPayload }
 * Optional header: X-Internal-Secret (must match INTERNAL_API_SECRET env) when set.
 */
export async function broadcastRideRequest(req: Request, res: Response): Promise<void> {
  try {
    const { driverIds, ride } = req.body as {
      driverIds?: string[];
      ride?: NewRideRequestPayload;
    };

    if (!Array.isArray(driverIds) || !ride || !ride.rideId || !ride.rideCode) {
      res.status(400).json({
        success: false,
        error: 'Missing driverIds (array) or ride (rideId, rideCode, pickupLatitude, pickupLongitude, ...)',
      });
      return;
    }

    const secret = process.env.INTERNAL_API_SECRET;
    if (secret && req.headers['x-internal-secret'] !== secret) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    emitNewRideRequestToDrivers(driverIds, ride);
    res.status(200).json({
      success: true,
      message: `Ride request broadcast to ${driverIds.length} driver(s)`,
      driverCount: driverIds.length,
    });
  } catch (e) {
    console.error('Broadcast ride request error:', e);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
