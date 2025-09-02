import { Request, Response } from 'express';
import { prisma } from '../../prismaClient';
import redis from '../../redis';

export const storeDriverRideDetails = async (req: Request, res: Response) => {
  try {
    const {
      rideId,
      rideCode,
      status,
      pickupLatitude,
      pickupLongitude,
      pickupAddress,
      dropLatitude,
      dropLongitude,
      dropAddress,
      startTime,
      endTime,
      estimatedFare,
      actualFare,
      estimatedDistance,
      actualDistance,
      estimatedDuration,
      actualDuration,
      baseFare,
      surgeMultiplier,
      waitingTime,
      cancellationFee,
      cancellationReason,
      cancelledBy,
      paymentStatus,
      paymentMethod,
      transactionId,
      driverId,
      riderId,
      vehicleId,
      serviceZoneId,
      route,
      waypoints,
      driverLocationUpdates
    } = req.body;

    // Basic validation (add more as needed)
    if (!status || typeof pickupLatitude !== 'number' || typeof pickupLongitude !== 'number' || !driverId || !riderId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // --- Ensure RiderInfo exists (shadow creation if needed) ---
    let riderInfo = await prisma.riderInfo.findUnique({ where: { id: riderId } });
    if (!riderInfo) {
      // You may want to use riderId as riderId (external ref), and fill other fields with placeholders
      riderInfo = await prisma.riderInfo.create({
        data: {
          id: riderId,
          riderId: riderId, // external reference
          firstName: 'Unknown',
          lastName: '',
          phoneNumber: '',
        }
      });
    }

    // --- Create the ride ---
    const ride = await prisma.ride.create({
      data: {
        id: rideId, // optional, let Prisma auto-generate if not provided
        rideCode,
        status,
        pickupLatitude,
        pickupLongitude,
        pickupAddress,
        dropLatitude,
        dropLongitude,
        dropAddress,
        startTime: startTime ? new Date(startTime) : undefined,
        endTime: endTime ? new Date(endTime) : undefined,
        estimatedFare,
        actualFare,
        estimatedDistance,
        actualDistance,
        estimatedDuration,
        actualDuration,
        baseFare,
        surgeMultiplier: surgeMultiplier || 1.0,
        waitingTime,
        cancellationFee,
        cancellationReason,
        cancelledBy,
        paymentStatus,
        paymentMethod,
        transactionId,
        driverId,
        riderId: riderInfo.id,
        vehicleId,
        serviceZoneId,
        route,
        waypoints,
        driverLocationUpdates
      }
    });

    return res.status(201).json({ success: true, ride });
  } catch (error) {
    console.error('Error storing driver ride details:', error);
    return res.status(500).json({ error: 'Failed to store ride details', details: error instanceof Error ? error.message : error });
  }
};

// Start ride with OTP (rideCode) validation
export const startRideWithCode = async (req: Request, res: Response) => {
  try {
    const { rideId, rideCode } = req.body;
    const driverId = req.driver?.id;
    if (!rideId || !rideCode) {
      return res.status(400).json({ error: 'rideId and rideCode are required' });
    }
    // Find the ride
    const ride = await prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    // Check driver is assigned to this ride
    if (ride.driverId !== driverId) {
      return res.status(403).json({ error: 'You are not assigned to this ride' });
    }
    // Validate rideCode (OTP)
    if (ride.rideCode !== rideCode) {
      return res.status(401).json({ error: 'Invalid ride code' });
    }
    // Update ride status to in_progress and set startTime
    const updatedRide = await prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'in_progress',
        startTime: new Date(),
      },
    });
    return res.status(200).json({ success: true, message: 'Ride started', ride: updatedRide });
  } catch (error) {
    console.error('Error starting ride with code:', error);
    return res.status(500).json({ error: 'Failed to start ride', details: error instanceof Error ? error.message : error });
  }
};

// End ride and persist final stats
export const endRide = async (req: Request, res: Response) => {
  try {
    const { rideId, actualFare, actualDistance, actualDuration } = req.body || {};
    const driverId = req.driver?.id;
    if (!rideId) {
      return res.status(400).json({ error: 'rideId is required' });
    }

    const ride = await prisma.ride.findUnique({ where: { id: rideId } });
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    if (driverId && ride.driverId !== driverId) {
      return res.status(403).json({ error: 'You are not assigned to this ride' });
    }

    const updatedRide = await prisma.ride.update({
      where: { id: rideId },
      data: {
        status: 'completed',
        endTime: new Date(),
        actualFare: typeof actualFare === 'number' ? actualFare : ride.actualFare,
        actualDistance: typeof actualDistance === 'number' ? actualDistance : ride.actualDistance,
        actualDuration: typeof actualDuration === 'number' ? actualDuration : ride.actualDuration,
      }
    });

    // Clear active ride mapping for the driver
    try {
      const effectiveDriverId = driverId || ride.driverId;
      if (effectiveDriverId) {
        await redis.del(`driver:active_ride:${effectiveDriverId}`);
      }
    } catch (e) {
      console.error('Failed to clear active ride mapping:', e);
    }

    // Publish ride status update so API Gateway can notify rider clients
    try {
      await redis.publish('ride_status_updates', JSON.stringify({
        type: 'rideEnded',
        status: 'completed',
        rideId,
        driverId: driverId || ride.driverId,
        riderId: ride.riderId,
        endTime: updatedRide.endTime,
        actualFare: updatedRide.actualFare,
        actualDistance: updatedRide.actualDistance,
        actualDuration: updatedRide.actualDuration,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('Failed to publish ride status update:', e);
    }

    return res.status(200).json({ success: true, message: 'Ride ended', ride: updatedRide });
  } catch (error) {
    console.error('Error ending ride:', error);
    return res.status(500).json({ error: 'Failed to end ride', details: error instanceof Error ? error.message : error });
  }
};
