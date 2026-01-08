import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";

/**
 * Rate a rider (by driver) after ride completion
 */
export const rateRider = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return res.status(401).json({
        success: false,
        message: "Driver not authenticated",
      });
    }
    const driverId = req.driver.id as string;

    const { rideId } = req.params;
    const { rating, comment } = req.body;

    // Validate inputs
    if (!rideId) {
      return res.status(400).json({ error: "Ride ID is required" });
    }

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: "Rating must be a number between 1 and 5",
      });
    }

    // Check if ride exists and belongs to the driver
    const ride = await prisma.ride.findFirst({
      where: {
        id: rideId,
        driverId: driverId,
        status: "completed", // Only allow rating completed rides
      },
      include: {
        rider: true,
      },
    });

    if (!ride) {
      return res.status(404).json({
        error: "Ride not found, not completed, or access denied",
      });
    }

    // Store driver rating in route/metadata field as JSON
    const existingMetadata = (ride.route as any) || {};
    if (existingMetadata.driverRating) {
      return res.status(400).json({
        error: "This ride has already been rated by the driver",
      });
    }

    // Update ride with driver rating (store in route/metadata field)
    const updatedRide = await prisma.ride.update({
      where: { id: rideId },
      data: {
        route: {
          ...existingMetadata,
          driverRating: rating,
          driverComment: comment || null,
          driverRatedAt: new Date().toISOString(),
        } as any,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Rider rated successfully",
      data: {
        rideId: updatedRide.id,
        rating: rating,
        comment: comment || null,
      },
    });
  } catch (error: any) {
    console.error("Error rating rider:", error);
    return next(new AppError("Failed to rate rider", 500));
  }
};


