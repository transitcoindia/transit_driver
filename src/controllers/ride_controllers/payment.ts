import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";

/**
 * Get driver payment history
 */
export const getDriverPaymentHistory = async (
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

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Get payments for completed rides
    const [payments, totalCount] = await Promise.all([
      prisma.payment.findMany({
        where: {
          driverId: driverId,
          status: { in: ["completed", "refunded"] },
        },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          ride: {
            select: {
              id: true,
              rideCode: true,
              status: true,
              pickupAddress: true,
              dropAddress: true,
              actualFare: true,
              rider: {
                select: {
                  id: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
      }),
      prisma.payment.count({
        where: {
          driverId: driverId,
          status: { in: ["completed", "refunded"] },
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      success: true,
      data: {
        payments,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
        },
      },
    });
  } catch (error: any) {
    console.error("Error fetching driver payment history:", error);
    return next(new AppError("Failed to fetch payment history", 500));
  }
};

/**
 * Get driver payment summary (total earnings, pending, etc.)
 */
export const getDriverPaymentSummary = async (
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
        weekStart.setDate(now.getDate() - now.getDay());
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
    };

    if (startDate) {
      where.createdAt = { gte: startDate };
    }

    // Get payment stats
    const [completedPayments, refundedPayments, pendingPayments] = await Promise.all([
      prisma.payment.findMany({
        where: {
          ...where,
          status: "completed",
        },
        select: {
          amount: true,
        },
      }),
      prisma.payment.findMany({
        where: {
          ...where,
          status: "refunded",
        },
        select: {
          amount: true, // Payment model doesn't have refundAmount, use amount for refunded payments
        },
      }),
      prisma.payment.findMany({
        where: {
          ...where,
          status: "pending",
        },
        select: {
          amount: true,
        },
      }),
    ]);

    const totalEarnings = completedPayments.reduce((sum, p) => sum + p.amount, 0);
    const totalRefunded = refundedPayments.reduce((sum, p) => sum + p.amount, 0); // Use amount for refunded payments
    const totalPending = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
    const netEarnings = totalEarnings - totalRefunded;

    return res.status(200).json({
      success: true,
      data: {
        period,
        totalEarnings,
        totalRefunded,
        netEarnings,
        totalPending,
        totalTransactions: completedPayments.length + refundedPayments.length,
      },
    });
  } catch (error: any) {
    console.error("Error fetching driver payment summary:", error);
    return next(new AppError("Failed to fetch payment summary", 500));
  }
};

