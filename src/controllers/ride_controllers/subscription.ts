import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";
import { subscriptionActivateSchema } from "../../validator/driverValidation";
import { Prisma } from "@prisma/client";

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
 * Activate driver subscription
 * POST /api/driver/subscription/activate
 */
export const activateSubscription = async (
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

    // Validate request body
    const validatedData = subscriptionActivateSchema.parse(req.body);
    const { amount, paymentMode, transactionId, durationDays } = validatedData;

    // Check if driver exists
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      return next(new AppError("Driver not found", 404));
    }

    // Calculate subscription dates
    const startTime = new Date();
    const expire = new Date(startTime);
    expire.setDate(expire.getDate() + durationDays);

    // Use transaction to create both payment and subscription records
    const result = await prisma.$transaction(async (tx) => {
      // Create subscription payment record
      const payment = await tx.subscriptionPayment.create({
        data: {
          driverId: driverId,
          amount: amount,
          paymentMode: paymentMode,
          transactionId: transactionId || null,
          status: transactionId ? "SUCCESS" : "PENDING", // If transactionId provided, assume SUCCESS
        },
      });

      // Cancel any existing active subscriptions (only one active at a time)
      await tx.driverSubscription.updateMany({
        where: {
          driverId: driverId,
          status: "ACTIVE",
        },
        data: {
          status: "CANCELLED",
        },
      });

      // Create new subscription
      const subscription = await tx.driverSubscription.create({
        data: {
          driverId: driverId,
          startTime: startTime,
          expire: expire,
          amountPaid: amount,
          status: "ACTIVE",
          paymentId: payment.id,
          paymentMode: paymentMode,
          autoRenewed: false,
        },
      });

      return { payment, subscription };
    });

    return res.status(201).json({
      success: true,
      message: "Subscription activated successfully",
      data: {
        subscription: {
          id: result.subscription.id,
          driverId: result.subscription.driverId,
          startTime: result.subscription.startTime,
          expire: result.subscription.expire,
          amountPaid: result.subscription.amountPaid,
          status: result.subscription.status,
          paymentMode: result.subscription.paymentMode,
          autoRenewed: result.subscription.autoRenewed,
        },
        payment: {
          id: result.payment.id,
          amount: result.payment.amount,
          paymentMode: result.payment.paymentMode,
          transactionId: result.payment.transactionId,
          status: result.payment.status,
        },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return next(new AppError("Subscription creation failed: duplicate entry", 400));
      }
    }

    if (error instanceof AppError) {
      return next(error);
    }

    // Handle Zod validation errors
    if (error && typeof error === "object" && "issues" in error) {
      return next(
        new AppError(
          "Validation failed: " + JSON.stringify((error as any).issues),
          400
        )
      );
    }

    console.error("Error activating subscription:", error);
    return next(new AppError("Failed to activate subscription", 500));
  }
};

/**
 * Get current active subscription
 * GET /api/driver/subscription
 */
export const getCurrentSubscription = async (
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

    // Get active subscription
    const subscription = await prisma.driverSubscription.findFirst({
      where: {
        driverId: driverId,
        status: "ACTIVE",
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        driver: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!subscription) {
      return res.status(200).json({
        success: true,
        message: "No active subscription found",
        data: {
          subscription: null,
        },
      });
    }

    // Check if subscription has expired
    const now = new Date();
    if (subscription.expire < now && subscription.status === "ACTIVE") {
      // Update expired subscription
      await prisma.driverSubscription.update({
        where: { id: subscription.id },
        data: { status: "EXPIRED" },
      });

      return res.status(200).json({
        success: true,
        message: "Subscription has expired",
        data: {
          subscription: {
            ...subscription,
            status: "EXPIRED",
          },
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          driverId: subscription.driverId,
          startTime: subscription.startTime,
          expire: subscription.expire,
          amountPaid: subscription.amountPaid,
          status: subscription.status,
          paymentMode: subscription.paymentMode,
          autoRenewed: subscription.autoRenewed,
          remainingMinutes: subscription.remainingMinutes,
        },
      },
    });
  } catch (error) {
    console.error("Error getting subscription:", error);
    return next(new AppError("Failed to get subscription", 500));
  }
};

