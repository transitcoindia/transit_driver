import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";
import redis from "../../redis";
import {
  computeDriverCancellationOutcome,
  VALID_CANCELLATION_REASONS,
} from "../../services/driverCancellationPolicyService";

/** Haversine distance in km between two lat/lng points. */
function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

    // Resolve vehicleId: fetch driver's active vehicle
    const driverVehicle = await prisma.vehicle.findUnique({
      where: { driverId },
      select: { id: true },
    });
    const vehicleId = driverVehicle?.id ?? undefined;

    // Update ride: mark accepted, attach driverId, vehicleId, generate OTP
    const updatedRide = await prisma.ride.update({
      where: { id: rideId },
      data: {
        status: "accepted",
        rideOtp: rideOtp,
        driverId: driverId,
        vehicleId: vehicleId ?? undefined,
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
 * Record in-app call attempt to rider (required for no-show cancellation rule).
 * POST /api/driver/rides/:rideId/rider-call-attempted
 */
export const riderCallAttempted = async (
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
      select: { id: true, driverId: true, riderCallAttemptedAt: true },
    });

    if (!ride) {
      return next(new AppError("Ride not found", 404));
    }
    if (ride.driverId !== driverId) {
      return next(new AppError("You are not assigned to this ride", 403));
    }
    if (ride.riderCallAttemptedAt) {
      return res.status(200).json({
        success: true,
        message: "Call attempt already recorded",
        data: { riderCallAttemptedAt: ride.riderCallAttemptedAt },
      });
    }

    const now = new Date();
    await prisma.ride.update({
      where: { id: rideId },
      data: { riderCallAttemptedAt: now, updatedAt: now },
    });

    return res.status(200).json({
      success: true,
      message: "Call attempt recorded",
      data: { riderCallAttemptedAt: now },
    });
  } catch (error: any) {
    console.error("Error recording rider call attempt:", error);
    return next(new AppError("Failed to record call attempt", 500));
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

const COMPLETION_RADIUS_KM = 3;

/**
 * Complete ride (canonical completion for drivers).
 * POST /api/driver/rides/:rideId/complete
 *
 * Rules:
 * - Ride status must be in_progress and requester must be the assigned driver.
 * - Driver must be within 3 km of the drop location (completionLatitude, completionLongitude required).
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
    const {
      actualFare,
      actualDistance,
      actualDuration,
      paymentMethod,
      transactionId,
      completionLatitude,
      completionLongitude,
    } = req.body;

    if (!rideId) {
      return next(new AppError("Ride ID is required", 400));
    }
    if (
      typeof completionLatitude !== "number" ||
      typeof completionLongitude !== "number"
    ) {
      return next(
        new AppError(
          "completionLatitude and completionLongitude are required (driver location when completing)",
          400
        )
      );
    }

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

    if (ride.driverId !== driverId) {
      return next(
        new AppError("You are not assigned to this ride", 403)
      );
    }

    if (ride.status !== "in_progress") {
      return next(
        new AppError(
          `Cannot complete ride with status: ${ride.status}. Ride must be in progress.`,
          400
        )
      );
    }

    // 3 km rule: driver must be within 3 km of drop location to complete
    let dropLat: number | null = ride.dropLatitude;
    let dropLng: number | null = ride.dropLongitude;
    if (dropLat == null || dropLng == null) {
      const wp = ride.waypoints as Array<{ latitude: number; longitude: number }> | null;
      if (wp && wp.length > 0) {
        const last = wp[wp.length - 1];
        dropLat = last.latitude;
        dropLng = last.longitude;
      }
    }
    if (dropLat != null && dropLng != null) {
      const distToDropKm = haversineKm(
        completionLatitude,
        completionLongitude,
        dropLat,
        dropLng
      );
      if (distToDropKm > COMPLETION_RADIUS_KM) {
        return next(
          new AppError(
            `Ride can only be completed within ${COMPLETION_RADIUS_KM} km of the drop location. You are ${distToDropKm.toFixed(1)} km away.`,
            400
          )
        );
      }
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
    const method = paymentMethod || "cash";
    updateData.paymentMethod = method;
    if (transactionId) {
      updateData.transactionId = transactionId;
    }
    updateData.paymentStatus = method === "cash" ? "pending" : "paid";

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
 * Mark payment received (driver confirms cash received)
 * POST /api/driver/rides/:rideId/payment-received
 */
export const markPaymentReceived = async (
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
      select: {
        id: true,
        driverId: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
      },
    });

    if (!ride) {
      return next(new AppError("Ride not found", 404));
    }

    if (ride.driverId !== driverId) {
      return next(new AppError("You are not assigned to this ride", 403));
    }

    if (ride.status !== "completed") {
      return next(
        new AppError("Can only mark payment received for completed rides", 400)
      );
    }

    if (ride.paymentStatus === "paid") {
      return res.status(200).json({
        success: true,
        message: "Payment already marked as received",
        data: { ride: { id: ride.id, paymentStatus: "paid" } },
      });
    }

    const updatedRide = await prisma.ride.update({
      where: { id: rideId },
      data: {
        paymentStatus: "paid",
        updatedAt: new Date(),
      },
      select: {
        id: true,
        rideCode: true,
        status: true,
        paymentMethod: true,
        paymentStatus: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Payment marked as received",
      data: { ride: updatedRide },
    });
  } catch (error: any) {
    console.error("Error marking payment received:", error);
    return next(new AppError("Failed to mark payment received", 500));
  }
};

const getDriverLocationKey = (driverId: string) => `driver:location:${driverId}`;
const getDriverActiveRideKey = (driverId: string) => `driver:active_ride:${driverId}`;

/**
 * Cancel ride (by driver)
 * POST /api/driver/rides/:rideId/cancel
 * Body: { cancellationReason?, cancellationReasonType?, riderCallAttempted?, latitude?, longitude? }
 * Applies driver cancellation policy: 45s free, distance-based charges, no-show, valid reasons.
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
    const {
      cancellationReason,
      cancellationReasonType,
      riderCallAttempted,
      latitude,
      longitude,
    } = req.body || {};

    if (!rideId) {
      return next(new AppError("Ride ID is required", 400));
    }

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

    if (ride.driverId !== driverId) {
      return next(new AppError("You are not assigned to this ride", 403));
    }

    if (ride.status === "completed" || ride.status === "cancelled") {
      return next(
        new AppError(`Cannot cancel ride with status: ${ride.status}`, 400)
      );
    }

    // Resolve driver current location (body > Redis > accept location)
    let driverLat: number;
    let driverLng: number;
    if (typeof latitude === "number" && typeof longitude === "number") {
      driverLat = latitude;
      driverLng = longitude;
    } else {
      try {
        const locKey = getDriverLocationKey(driverId);
        const raw = await redis.get(locKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { latitude?: number; longitude?: number };
          if (typeof parsed.latitude === "number" && typeof parsed.longitude === "number") {
            driverLat = parsed.latitude;
            driverLng = parsed.longitude;
          } else {
            driverLat = ride.driverLatAtAccept ?? ride.pickupLatitude;
            driverLng = ride.driverLngAtAccept ?? ride.pickupLongitude;
          }
        } else {
          const loc = await prisma.driverLocation.findUnique({
            where: { driverId },
            select: { latitude: true, longitude: true },
          });
          driverLat = loc?.latitude ?? ride.driverLatAtAccept ?? ride.pickupLatitude;
          driverLng = loc?.longitude ?? ride.driverLngAtAccept ?? ride.pickupLongitude;
        }
      } catch {
        driverLat = ride.driverLatAtAccept ?? ride.pickupLatitude;
        driverLng = ride.driverLngAtAccept ?? ride.pickupLongitude;
      }
    }

    // Valid-reason limit: >3 in last 7 days → remove penalty waiver
    let effectiveReasonType: string | null = cancellationReasonType ?? null;
    if (effectiveReasonType && VALID_CANCELLATION_REASONS.includes(effectiveReasonType as any)) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentValid = await prisma.driverValidReasonCancel.count({
        where: {
          driverId,
          cancelledAt: { gte: sevenDaysAgo },
        },
      });
      if (recentValid >= 3) {
        effectiveReasonType = null; // Treat as regular cancel
      }
    }

    const outcome = computeDriverCancellationOutcome({
      rideId,
      driverId,
      driverLat,
      driverLng,
      cancellationReason,
      cancellationReasonType: effectiveReasonType,
      riderCallAttempted,
      driverAcceptedAt: ride.driverAcceptedAt,
      driverLatAtAccept: ride.driverLatAtAccept,
      driverLngAtAccept: ride.driverLngAtAccept,
      pickupLatitude: ride.pickupLatitude,
      pickupLongitude: ride.pickupLongitude,
      driverArrivedAtPickupAt: ride.driverArrivedAtPickupAt,
      riderCallAttemptedAt: ride.riderCallAttemptedAt,
      requestedVehicleType: ride.requestedVehicleType,
      vehicleType: ride.vehicle?.vehicleType ?? null,
    });

    const cancelledAt = new Date();
    const riderCharged = outcome.riderChargedAmount;
    const driverComp = outcome.driverCompensationAmount;

    const cancelledRide = await prisma.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = {
        status: "cancelled",
        cancelledBy: "driver",
        cancelledAt,
        endTime: cancelledAt,
        updatedAt: cancelledAt,
        rideOtp: null,
        cancellationReason: cancellationReason || outcome.message || "Cancelled by driver",
        cancellationFee: riderCharged,
        driverStrikeType: outcome.driverStrikeType,
        driverCompensationAmount: driverComp,
        driverCancellationReasonType: outcome.driverCancellationReasonType,
      };
      if (riderCallAttempted && !ride.riderCallAttemptedAt) {
        (updateData as any).riderCallAttemptedAt = cancelledAt;
      }

      const updatedRide = await tx.ride.update({
        where: { id: rideId },
        data: updateData,
      });

      if (ride.vehicleId) {
        await tx.vehicle.update({
          where: { id: ride.vehicleId },
          data: { isAvailable: true },
        });
      }

      await tx.driverLocation.updateMany({
        where: { driverId },
        data: { isInTrip: false },
      });

      // Rider wallet: debit (allow negative)
      if (riderCharged > 0) {
        let riderWallet = await tx.wallet.findUnique({ where: { riderId: ride.riderId } });
        if (!riderWallet) {
          riderWallet = await tx.wallet.create({
            data: { riderId: ride.riderId },
          });
        }
        const balBefore = riderWallet.balance;
        const balAfter = balBefore - riderCharged;

        await tx.wallet.update({
          where: { id: riderWallet.id },
          data: { balance: balAfter, updatedAt: cancelledAt },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: riderWallet.id,
            type: "debit",
            amount: riderCharged,
            balanceBefore: balBefore,
            balanceAfter: balAfter,
            description: `Cancellation fee for ride ${ride.rideCode}`,
            referenceType: "cancellation_fee",
            referenceId: rideId,
          },
        });
      }

      // Driver wallet: credit
      if (driverComp > 0) {
        let dw = await tx.driverWallet.findUnique({ where: { driverId } });
        if (!dw) {
          dw = await tx.driverWallet.create({ data: { driverId } });
        }
        const balBefore = dw.balance;
        const balAfter = balBefore + driverComp;

        await tx.driverWallet.update({
          where: { id: dw.id },
          data: { balance: balAfter, updatedAt: cancelledAt },
        });
        await tx.driverWalletTransaction.create({
          data: {
            driverWalletId: dw.id,
            type: "credit",
            amount: driverComp,
            balanceBefore: balBefore,
            balanceAfter: balAfter,
            description: `Cancellation compensation for ride ${ride.rideCode}`,
            referenceType: "cancellation_compensation",
            referenceId: rideId,
          },
        });
      }

      if (outcome.driverStrikeType) {
        await tx.driverCancellationStrike.create({
          data: {
            driverId,
            rideId,
            strikeType: outcome.driverStrikeType,
            cancelledAt,
          },
        });
      }

      if (outcome.driverCancellationReasonType) {
        await tx.driverValidReasonCancel.create({
          data: {
            driverId,
            rideId,
            reasonType: outcome.driverCancellationReasonType,
            cancelledAt,
          },
        });
      }

      return updatedRide;
    });

    try {
      await redis.del(getDriverActiveRideKey(driverId));
    } catch (e) {
      console.warn("Failed to clear driver active ride from Redis:", e);
    }

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
          driverCompensationAmount: cancelledRide.driverCompensationAmount,
          driverStrikeType: cancelledRide.driverStrikeType,
          cancelledBy: cancelledRide.cancelledBy,
          cancelledAt: cancelledRide.cancelledAt,
          endTime: cancelledRide.endTime,
        },
        outcome: {
          category: outcome.category,
          riderChargedAmount: riderCharged,
          driverCompensationAmount: driverComp,
        },
      },
    });
  } catch (error: any) {
    console.error("Error cancelling ride:", error);
    return next(new AppError("Failed to cancel ride", 500));
  }
};

/**
 * Store accepted ride from gateway (called after driver accepts via gateway).
 * If ride exists (shared DB): update with driverId, status, rideOtp.
 * If ride does not exist (separate DB): create Ride and upsert User for rider so arrived-at-pickup works.
 * POST /api/driver/rides_accepted
 * Body: gateway payload (rideId, rideCode, driverId, riderId, rideOtp, pickup*, drop*, estimatedFare, ...)
 */
export const storeRideAcceptedFromGateway = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const driverId = req.driver?.id;
    if (!driverId) {
      return next(new AppError("Driver not authenticated", 401));
    }

    const body = req.body as Record<string, any>;
    const {
      rideId,
      rideCode,
      riderId: externalRiderId,
      rideOtp,
      status,
      pickupLatitude,
      pickupLongitude,
      pickupAddress,
      dropLatitude,
      dropLongitude,
      dropAddress,
      estimatedFare,
      estimatedDistance,
      estimatedDuration,
      baseFare,
      surgeMultiplier,
    } = body;    if (!rideId || !externalRiderId) {
      return next(new AppError("rideId and riderId are required", 400));
    }
    if (body.driverId && body.driverId !== driverId) {
      return next(new AppError("driverId does not match authenticated driver", 403));
    }    const existingRide = await prisma.ride.findUnique({
      where: { id: rideId },
      select: { id: true, driverId: true, status: true },
    });

    // Resolve vehicleId: use payload if provided, else fetch driver's active vehicle
    let vehicleId = body.vehicleId as string | undefined;
    if (!vehicleId && driverId) {
      const driverVehicle = await prisma.vehicle.findUnique({
        where: { driverId },
        select: { id: true },
      });
      vehicleId = driverVehicle?.id ?? undefined;
    }

    if (existingRide) {
      if (existingRide.driverId && existingRide.driverId !== driverId) {
        return res.status(200).json({
          success: true,
          message: "Ride already assigned to another driver",
        });
      }
      await prisma.ride.update({
        where: { id: rideId },
        data: {
          status: status || "accepted",
          driverId,
          vehicleId: vehicleId ?? undefined,
          rideOtp: rideOtp ?? undefined,
          estimatedFare: estimatedFare ?? undefined,
          estimatedDistance: estimatedDistance ?? undefined,
          estimatedDuration: estimatedDuration ?? undefined,
          baseFare: baseFare ?? undefined,
          surgeMultiplier: surgeMultiplier ?? undefined,
          updatedAt: new Date(),
        },
      });
      return res.status(200).json({
        success: true,
        message: "Ride accepted and stored",
        data: { rideId },
      });
    }    const riderId = externalRiderId as string;
    await prisma.user.upsert({
      where: { id: riderId },
      create: {
        id: riderId,
        email: `rider-${riderId}@transit.internal`,
        name: "Rider",
        password: "nologin",
      },
      update: {},
    });

    const rideCodeVal = rideCode || Math.floor(1000 + Math.random() * 9000).toString();
    const pickLat = Number(pickupLatitude) || 0;
    const pickLng = Number(pickupLongitude) || 0;
    const dropLat = dropLatitude != null ? Number(dropLatitude) : pickLat;
    const dropLng = dropLongitude != null ? Number(dropLongitude) : pickLng;

    await prisma.ride.create({
      data: {
        id: rideId,
        rideCode: rideCodeVal,
        status: status || "accepted",
        pickupLatitude: pickLat,
        pickupLongitude: pickLng,
        pickupAddress: pickupAddress ?? undefined,
        dropLatitude: dropLat,
        dropLongitude: dropLng,
        dropAddress: dropAddress ?? undefined,
        riderId,
        driverId,
        vehicleId: vehicleId ?? undefined,
        rideOtp: rideOtp ?? undefined,
        estimatedFare: estimatedFare != null ? Number(estimatedFare) : undefined,
        estimatedDistance: estimatedDistance != null ? Number(estimatedDistance) : undefined,
        estimatedDuration: estimatedDuration != null ? Number(estimatedDuration) : undefined,
        baseFare: baseFare != null ? Number(baseFare) : undefined,
        surgeMultiplier: surgeMultiplier != null ? Number(surgeMultiplier) : 1,
        updatedAt: new Date(),
      },
    });    return res.status(200).json({
      success: true,
      message: "Ride accepted and stored",
      data: { rideId },
    });
  } catch (error: any) {
    console.error("Error storing ride accepted from gateway:", error);
    return next(new AppError("Failed to store accepted ride", 500));
  }
};