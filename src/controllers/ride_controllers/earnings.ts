import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";

/**
 * Get driver earnings summary (total, today, this week, this month)
 */
export const getDriverEarnings = async (
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

    const period = (req.query.period as string) || "all"; // all, today, week, month

    // Date filters
    const now = new Date();
    let startDate: Date | undefined;

    switch (period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case "week":
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
        weekStart.setHours(0, 0, 0, 0);
        startDate = weekStart;
        break;
      case "month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = undefined;
    }

    // Build where clause
    const where: any = {
      driverId: driverId,
      status: "completed",
      actualFare: { not: null },
    };

    if (startDate) {
      where.endTime = { gte: startDate };
    }

    // Get completed rides with earnings
    const completedRides = await prisma.ride.findMany({
      where,
      select: {
        id: true,
        actualFare: true,
        cancellationFee: true,
        endTime: true,
        createdAt: true,
      },
      orderBy: {
        endTime: "desc",
      },
    });

    // Calculate earnings
    const totalEarnings = completedRides.reduce((sum, ride) => {
      return sum + (ride.actualFare || 0);
    }, 0);

    const totalCancellationFees = completedRides.reduce((sum, ride) => {
      return sum + (ride.cancellationFee || 0);
    }, 0);

    const totalRides = completedRides.length;

    // Get driver details for total earnings
    const driverDetails = await prisma.driverDetails.findUnique({
      where: { driverId },
      select: {
        totalEarnings: true,
        totalRides: true,
      },
    });

    // Calculate average earnings per ride
    const averageEarningsPerRide =
      totalRides > 0 ? totalEarnings / totalRides : 0;

    return res.status(200).json({
      success: true,
      data: {
        period,
        summary: {
          totalEarnings,
          totalRides,
          averageEarningsPerRide: Math.round(averageEarningsPerRide * 100) / 100,
          cancellationFees: totalCancellationFees,
          netEarnings: totalEarnings + totalCancellationFees,
        },
        lifetime: {
          totalEarnings: driverDetails?.totalEarnings || 0,
          totalRides: driverDetails?.totalRides || 0,
        },
        recentRides: completedRides.slice(0, 10), // Last 10 rides
      },
    });
  } catch (error: any) {
    console.error("Error fetching driver earnings:", error);
    return next(new AppError("Failed to fetch earnings", 500));
  }
};

/**
 * Get detailed earnings breakdown by date range
 */
export const getDriverEarningsBreakdown = async (
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

    const startDate = req.query.startDate
      ? new Date(req.query.startDate as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago
    const endDate = req.query.endDate
      ? new Date(req.query.endDate as string)
      : new Date();

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;

    // Fetch completed rides in date range
    const [rides, totalCount] = await Promise.all([
      prisma.ride.findMany({
        where: {
          driverId: driverId,
          status: "completed",
          actualFare: { not: null },
          endTime: {
            gte: startDate,
            lte: endDate,
          },
        },
        skip,
        take: limit,
        orderBy: {
          endTime: "desc",
        },
        include: {
          rider: {
            select: {
              id: true,
              name: true,
            },
          },
          vehicle: {
            select: {
              make: true,
              model: true,
              licensePlate: true,
            },
          },
        },
      }),
      prisma.ride.count({
        where: {
          driverId: driverId,
          status: "completed",
          actualFare: { not: null },
          endTime: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
    ]);

    // Calculate total earnings for the period
    const totalEarnings = rides.reduce((sum, ride) => {
      return sum + (ride.actualFare || 0);
    }, 0);

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      success: true,
      data: {
        period: {
          startDate,
          endDate,
        },
        summary: {
          totalEarnings,
          totalRides: totalCount,
        },
        rides,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
        },
      },
    });
  } catch (error: any) {
    console.error("Error fetching driver earnings breakdown:", error);
    return next(new AppError("Failed to fetch earnings breakdown", 500));
  }
};

