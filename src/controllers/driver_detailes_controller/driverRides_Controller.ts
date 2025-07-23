import { Request, Response } from 'express';
import { prisma } from '../../prismaClient';

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
