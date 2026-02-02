import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";

/** Rate per minute: 6 AM–10 PM = ₹1, 10 PM–6 AM = ₹1.5 */
function getWaitingRateForMinute(date: Date): number {
  const h = date.getHours();
  return h >= 22 || h < 6 ? 1.5 : 1;
}

/** Compute waiting time (minutes) and waiting charges (rupees). First 3 min free; then per-minute rate by clock (6–22 ₹1, 22–6 ₹1.5). */
function computeWaitingCharges(arrivedAt: Date, startTime: Date): { waitingMinutes: number; waitingCharges: number } {
  const waitingMs = startTime.getTime() - arrivedAt.getTime();
  const waitingMinutes = Math.ceil(waitingMs / 60000);
  if (waitingMinutes <= 3) return { waitingMinutes, waitingCharges: 0 };
  const chargeableMinutes = waitingMinutes - 3;
  let sum = 0;
  for (let i = 0; i < chargeableMinutes; i++) {
    const minuteTime = new Date(arrivedAt.getTime() + (3 + i) * 60000);
    sum += getWaitingRateForMinute(minuteTime);
  }
  return { waitingMinutes, waitingCharges: sum };
}

// Extend Express Request type to include driver
declare global {
  namespace Express {
    interface Request {
      driver?: {
        id: string;
        email: string | null;
        name: string;
        phoneNumber: string | null;
        phoneNumberVerified: boolean;
      };
    }
  }
}

/**
 * Accept ride request
 * POST /api/driver/rides/:rideId/accept
 */
export const acceptRide = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return next(new AppError("Driver not authenticated", 401));
    }

    const driverId = req.driver.id as string;
    const { rideId } = req.params;

    if (!rideId) {
      return next(new AppError("Ride ID is required", 400));
    }

    // Find the ride (shared DB with rider backend)
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: true,
        vehicle: true,
      },
    });

    if (!ride) {
      return next(new AppError("Ride not found", 404));
    }

    // If a driver is already assigned and it's not this driver, block
    if (ride.driverId && ride.driverId !== driverId) {
      return next(
        new AppError("You are not assigned to this ride", 403)
      );
    }

    // Check if ride can be accepted (only pending rides)
    if (ride.status !== "pending") {
      return next(
        new AppError(
          `Cannot accept ride with status: ${ride.status}. Only pending rides can be accepted.`,
          400
        )
      );
    }

    // Generate ride OTP (4-digit code for security - no expiration)
    const rideOtp = Math.floor(1000 + Math.random() * 9000).toString(); // 4-digit OTP

    // Update ride: mark accepted, attach driverId if missing, generate OTP
    const updatedRide = await prisma.ride.update({
      where: { id: rideId },
      data: {
        status: "accepted",
        rideOtp: rideOtp,
        driverId: driverId,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        rideCode: true,
        status: true,
        pickupAddress: true,
        dropAddress: true,
        estimatedFare: true,
        estimatedDistance: true,
        estimatedDuration: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Ride accepted successfully. OTP is available in the rider's app.",
      data: {
        ride: updatedRide,
        // Note: OTP is stored in database and will be visible to rider when they check ride details
        // Rider can view it via GET /api/rider/:rideId endpoint
      },
    });
  } catch (error: any) {
    console.error("Error accepting ride:", error);
    return next(new AppError("Failed to accept ride", 500));
  }
};

/**
 * Driver arrived at pickup (button or auto when within 100m).
 * POST /api/driver/rides/:rideId/arrived-at-pickup
 */
export const arrivedAtPickup = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return next(new AppError("Driver not authenticated", 401));
    }
    const driverId = req.driver.id as string;
    const { rideId } = req.params;

    if (!rideId) {
      return next(new AppError("Ride ID is required", 400));
    }

    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      select: { id: true, driverId: true, status: true, driverArrivedAtPickupAt: true },
    });

    if (!ride) {
      return next(new AppError("Ride not found", 404));
    }
    if (ride.driverId !== driverId) {
      return next(new AppError("You are not assigned to this ride", 403));
    }
    if (ride.status !== "accepted" && ride.status !== "pending") {
      return next(new AppError(`Cannot mark arrived for ride with status: ${ride.status}`, 400));
    }
    if (ride.driverArrivedAtPickupAt) {
      return res.status(200).json({
        success: true,
        message: "Already marked as arrived at pickup",
        data: { arrivedAt: ride.driverArrivedAtPickupAt },
      });
    }

    const now = new Date();
    await prisma.ride.update({
      where: { id: rideId },
      data: { driverArrivedAtPickupAt: now, updatedAt: now },
    });

    return res.status(200).json({
      success: true,
      message: "Arrived at pickup recorded",
      data: { arrivedAt: now },
    });
  } catch (error: any) {
    console.error("Error recording arrived at pickup:", error);
    return next(new AppError("Failed to record arrived at pickup", 500));
  }
};

/**
 * Start ride (requires OTP verification)
 * POST /api/driver/rides/:rideId/start
 * Body: { otp: string } - OTP provided by rider
 */
export const startRide = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return next(new AppError("Driver not authenticated", 401));
    }

    const driverId = req.driver.id as string;
    const { rideId } = req.params;
    const { otp } = req.body;

    if (!rideId) {
      return next(new AppError("Ride ID is required", 400));
    }

    if (!otp) {
      return next(new AppError("OTP is required to start the ride", 400));
    }

    // Find the ride
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: true,
        vehicle: true,
        rider: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
          },
        },
      },
    });

    if (!ride) {
      return next(new AppError("Ride not found", 404));
    }

    // Verify driver is assigned to this ride
    if (ride.driverId !== driverId) {
      return next(
        new AppError("You are not assigned to this ride", 403)
      );
    }

    // Check if ride can be started
    if (ride.status !== "accepted" && ride.status !== "pending") {
      return next(
        new AppError(
          `Cannot start ride with status: ${ride.status}. Ride must be accepted first.`,
          400
        )
      );
    }

    // Verify OTP
    if (!ride.rideOtp) {
      return next(
        new AppError("Ride OTP has not been generated. Please accept the ride first.", 400)
      );
    }

    // Verify OTP matches
    if (ride.rideOtp !== otp) {
      return next(
        new AppError("Invalid OTP. Please check the OTP provided by the rider.", 400)
      );
    }

    // OTP is valid - start the ride; compute waiting time and charges (first 3 min free, then ₹1/min 6–22, ₹1.5/min 22–6)
    const startTime = new Date();
    let waitingTimeMinutes: number | null = null;
    let waitingChargesRupees: number | null = null;
    if (ride.driverArrivedAtPickupAt) {
      const { waitingMinutes, waitingCharges } = computeWaitingCharges(ride.driverArrivedAtPickupAt, startTime);
      waitingTimeMinutes = waitingMinutes;
      waitingChargesRupees = waitingCharges;
    }

    const updatedRide = await prisma.ride.update({
      where: { id: rideId },
      data: {
        status: "in_progress",
        startTime: startTime,
        rideOtp: null, // Clear OTP after successful verification
        updatedAt: startTime,
        waitingTime: waitingTimeMinutes ?? undefined,
        waitingCharges: waitingChargesRupees ?? undefined,
      },
      select: {
        id: true,
        rideCode: true,
        status: true,
        startTime: true,
        pickupAddress: true,
        dropAddress: true,
        estimatedFare: true,
        waitingTime: true,
        waitingCharges: true,
      },
    });

    // Update vehicle availability if vehicle is assigned
    if (ride.vehicleId) {
      await prisma.vehicle.update({
        where: { id: ride.vehicleId },
        data: {
          isAvailable: false,
        },
      });
    }

    // Mark driver as in trip so DriverLocation.isInTrip stays in sync
    await prisma.driverLocation.updateMany({
      where: { driverId },
      data: { isInTrip: true },
    });

    return res.status(200).json({
      success: true,
      message: "Ride started successfully",
      data: {
        ride: updatedRide,
      },
    });
  } catch (error: any) {
    console.error("Error starting ride:", error);
    return next(new AppError("Failed to start ride", 500));
  }
};

/**
 * Complete ride
 * POST /api/driver/rides/:rideId/complete
 */
export const completeRide = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return next(new AppError("Driver not authenticated", 401));
    }

    const driverId = req.driver.id as string;
    const { rideId } = req.params;
    const { actualFare, actualDistance, actualDuration, paymentMethod, transactionId } = req.body;

    if (!rideId) {
      return next(new AppError("Ride ID is required", 400));
    }

    // Find the ride
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: true,
        vehicle: true,
      },
    });

    if (!ride) {
      return next(new AppError("Ride not found", 404));
    }

    // Verify driver is assigned to this ride
    if (ride.driverId !== driverId) {
      return next(
        new AppError("You are not assigned to this ride", 403)
      );
    }

    // Check if ride can be completed
    if (ride.status !== "in_progress") {
      return next(
        new AppError(
          `Cannot complete ride with status: ${ride.status}. Ride must be in progress.`,
          400
        )
      );
    }

    // Calculate actual duration if start time exists
    let calculatedDuration: number | undefined;
    if (ride.startTime) {
      const endTime = new Date();
      calculatedDuration = Math.round(
        (endTime.getTime() - ride.startTime.getTime()) / (1000 * 60)
      ); // Duration in minutes
    }

    // Update ride status to completed
    const endTime = new Date();
    const updateData: any = {
      status: "completed",
      endTime: endTime,
      updatedAt: endTime,
      actualDuration: actualDuration || calculatedDuration,
    };

    if (actualFare !== undefined) {
      updateData.actualFare = actualFare;
    }
    if (actualDistance !== undefined) {
      updateData.actualDistance = actualDistance;
    }
    if (paymentMethod) {
      updateData.paymentMethod = paymentMethod;
    }
    if (transactionId) {
      updateData.transactionId = transactionId;
    }
    if (paymentMethod) {
      updateData.paymentStatus = paymentMethod === "cash" ? "pending" : "paid";
    }

    const updatedRide = await prisma.ride.update({
      where: { id: rideId },
      data: updateData,
      select: {
        id: true,
        rideCode: true,
        status: true,
        startTime: true,
        endTime: true,
        estimatedFare: true,
        actualFare: true,
        estimatedDistance: true,
        actualDistance: true,
        estimatedDuration: true,
        actualDuration: true,
        paymentMethod: true,
        paymentStatus: true,
      },
    });

    // Update vehicle availability
    if (ride.vehicleId) {
      await prisma.vehicle.update({
        where: { id: ride.vehicleId },
        data: {
          isAvailable: true,
        },
      });
    }

    // Mark driver as not in trip so DriverLocation.isInTrip stays in sync
    await prisma.driverLocation.updateMany({
      where: { driverId },
      data: { isInTrip: false },
    });

    return res.status(200).json({
      success: true,
      message: "Ride completed successfully",
      data: {
        ride: updatedRide,
      },
    });
  } catch (error: any) {
    console.error("Error completing ride:", error);
    return next(new AppError("Failed to complete ride", 500));
  }
};

/**
 * Cancel ride (by driver)
 * POST /api/driver/rides/:rideId/cancel
 */
export const cancelRide = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return next(new AppError("Driver not authenticated", 401));
    }

    const driverId = req.driver.id as string;
    const { rideId } = req.params;
    const { cancellationReason, cancellationFee } = req.body;

    if (!rideId) {
      return next(new AppError("Ride ID is required", 400));
    }

    // Find the ride
    const ride = await prisma.ride.findUnique({
      where: { id: rideId },
      include: {
        driver: true,
        vehicle: true,
      },
    });

    if (!ride) {
      return next(new AppError("Ride not found", 404));
    }

    // Verify driver is assigned to this ride
    if (ride.driverId !== driverId) {
      return next(
        new AppError("You are not assigned to this ride", 403)
      );
    }

    // Check if ride can be cancelled
    if (ride.status === "completed" || ride.status === "cancelled") {
      return next(
        new AppError(
          `Cannot cancel ride with status: ${ride.status}`,
          400
        )
      );
    }

    // Use transaction to atomically cancel ride and update related data
    const cancelledAt = new Date();
    const cancelledRide = await prisma.$transaction(async (tx) => {
      // Update ride status to cancelled
      const updateData: any = {
        status: "cancelled",
        cancelledBy: "driver",
        cancelledAt: cancelledAt,
        endTime: cancelledAt, // Set end time when cancelled
        updatedAt: cancelledAt,
        rideOtp: null, // Clear OTP when ride is cancelled
        cancellationReason: cancellationReason || "Cancelled by driver",
        cancellationFee: cancellationFee !== undefined ? cancellationFee : 0,
      };

      const updatedRide = await tx.ride.update({
        where: { id: rideId },
        data: updateData,
      });

      // Update vehicle availability
      if (ride.vehicleId) {
        await tx.vehicle.update({
          where: { id: ride.vehicleId },
          data: {
            isAvailable: true,
          },
        });
      }

      // Mark driver as not in trip so DriverLocation.isInTrip stays in sync
      await tx.driverLocation.updateMany({
        where: { driverId },
        data: { isInTrip: false },
      });

      return updatedRide;
    });

    return res.status(200).json({
      success: true,
      message: "Ride cancelled successfully",
      data: {
        ride: {
          id: cancelledRide.id,
          rideCode: cancelledRide.rideCode,
          status: cancelledRide.status,
          cancellationReason: cancelledRide.cancellationReason,
          cancellationFee: cancelledRide.cancellationFee,
          cancelledBy: cancelledRide.cancelledBy,
          cancelledAt: cancelledRide.cancelledAt,
          endTime: cancelledRide.endTime,
        },
      },
    });
  } catch (error: any) {
    console.error("Error cancelling ride:", error);
    return next(new AppError("Failed to cancel ride", 500));
  }
};

