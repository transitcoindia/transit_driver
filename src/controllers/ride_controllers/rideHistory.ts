import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";

/**
 * Get ride history for the authenticated driver
 * Supports pagination and filtering by status
 */
export const getDriverRideHistory = async (
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

    // Query parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string | undefined; // Optional filter by status
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      driverId: driverId,
    };

    if (status) {
      where.status = status;
    }

    // Fetch rides with related data
    const [rides, totalCount] = await Promise.all([
      prisma.ride.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          rider: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              image: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              licensePlate: true,
              color: true,
              vehicleType: true,
            },
          },
          serviceZone: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      prisma.ride.count({ where }),
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return res.status(200).json({
      success: true,
      data: {
        rides,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
          hasNextPage,
          hasPrevPage,
        },
      },
    });
  } catch (error: any) {
    console.error("Error fetching driver ride history:", error);
    return next(new AppError("Failed to fetch ride history", 500));
  }
};

/**
 * Get a single ride detail by ID (only if the authenticated driver is assigned to the ride)
 */
export const getDriverRideDetails = async (
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

    if (!rideId) {
      return res.status(400).json({
        success: false,
        error: "Ride ID is required",
      });
    }

    // Fetch ride with related data
    const ride = await prisma.ride.findFirst({
      where: {
        id: rideId,
        driverId: driverId, // Ensure the driver is assigned to this ride
      },
      include: {
        rider: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            image: true,
          },
        },
        vehicle: {
          select: {
            id: true,
            make: true,
            model: true,
            licensePlate: true,
            color: true,
            vehicleType: true,
          },
        },
        serviceZone: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!ride) {
      return res.status(404).json({
        success: false,
        error: "Ride not found or access denied",
      });
    }

    return res.status(200).json({
      success: true,
      data: ride,
    });
  } catch (error: any) {
    console.error("Error fetching driver ride details:", error);
    return next(new AppError("Failed to fetch ride details", 500));
  }
};

