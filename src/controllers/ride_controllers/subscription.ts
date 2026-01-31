import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";
import { subscriptionActivateSchema } from "../../validator/driverValidation";
import { Prisma } from "@prisma/client";

type VehiclePlanType = "BIKE" | "AUTO" | "CAR";

interface SubscriptionPlan {
  id: string;
  vehicleType: VehiclePlanType;
  label: string;
  price: number;
  durationDays: number;
  includedMinutes: number | null; // null = unlimited minutes (date-based only)
}

// Subscription plan catalogue based on your matrix (12h per day; no 8h plans)
const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  // Bike plans
  { id: "bike_daily_4h", vehicleType: "BIKE", label: "Bike Daily 4h", price: 20, durationDays: 1, includedMinutes: 4 * 60 },
  { id: "bike_daily_12h", vehicleType: "BIKE", label: "Bike Daily 12h", price: 60, durationDays: 1, includedMinutes: 12 * 60 },
  { id: "bike_weekly_5d", vehicleType: "BIKE", label: "Bike Weekly 5x12h", price: 180, durationDays: 5, includedMinutes: 5 * 12 * 60 },
  { id: "bike_weekly_7d", vehicleType: "BIKE", label: "Bike Weekly 7x12h", price: 250, durationDays: 7, includedMinutes: 7 * 12 * 60 },
  { id: "bike_monthly_12h", vehicleType: "BIKE", label: "Bike Monthly 30x12h", price: 899, durationDays: 30, includedMinutes: 30 * 12 * 60 },
  { id: "bike_monthly_unlimited", vehicleType: "BIKE", label: "Bike Monthly Unlimited", price: 1199, durationDays: 30, includedMinutes: null },

  // Auto plans
  { id: "auto_daily_4h", vehicleType: "AUTO", label: "Auto Daily 4h", price: 25, durationDays: 1, includedMinutes: 4 * 60 },
  { id: "auto_daily_12h", vehicleType: "AUTO", label: "Auto Daily 12h", price: 70, durationDays: 1, includedMinutes: 12 * 60 },
  { id: "auto_weekly_5d", vehicleType: "AUTO", label: "Auto Weekly 5x12h", price: 220, durationDays: 5, includedMinutes: 5 * 12 * 60 },
  { id: "auto_weekly_7d", vehicleType: "AUTO", label: "Auto Weekly 7x12h", price: 300, durationDays: 7, includedMinutes: 7 * 12 * 60 },
  { id: "auto_monthly_12h", vehicleType: "AUTO", label: "Auto Monthly 30x12h", price: 999, durationDays: 30, includedMinutes: 30 * 12 * 60 },
  { id: "auto_monthly_unlimited", vehicleType: "AUTO", label: "Auto Monthly Unlimited", price: 1399, durationDays: 30, includedMinutes: null },

  // Car plans
  { id: "car_daily_4h", vehicleType: "CAR", label: "Car Daily 4h", price: 30, durationDays: 1, includedMinutes: 4 * 60 },
  { id: "car_daily_12h", vehicleType: "CAR", label: "Car Daily 12h", price: 90, durationDays: 1, includedMinutes: 12 * 60 },
  { id: "car_weekly_5d", vehicleType: "CAR", label: "Car Weekly 5x12h", price: 280, durationDays: 5, includedMinutes: 5 * 12 * 60 },
  { id: "car_weekly_7d", vehicleType: "CAR", label: "Car Weekly 7x12h", price: 350, durationDays: 7, includedMinutes: 7 * 12 * 60 },
  { id: "car_monthly_12h", vehicleType: "CAR", label: "Car Monthly 30x12h", price: 1299, durationDays: 30, includedMinutes: 30 * 12 * 60 },
  { id: "car_monthly_unlimited", vehicleType: "CAR", label: "Car Monthly Unlimited", price: 1699, durationDays: 30, includedMinutes: null },
];

/**
 * Get subscription plans catalogue
 * GET /api/driver/subscription/plans
 * Query: vehicleType (optional) - BIKE | AUTO | CAR to filter plans
 */
export const getSubscriptionPlans = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const vehicleType = req.query.vehicleType as string | undefined;
    let plans = SUBSCRIPTION_PLANS;
    if (vehicleType) {
      const normalized = vehicleType.toUpperCase() as VehiclePlanType;
      if (["BIKE", "AUTO", "CAR"].includes(normalized)) {
        plans = SUBSCRIPTION_PLANS.filter((p) => p.vehicleType === normalized);
      }
    }
    return res.status(200).json({
      success: true,
      data: {
        plans: plans.map((p) => ({
          id: p.id,
          vehicleType: p.vehicleType,
          label: p.label,
          price: p.price,
          durationDays: p.durationDays,
          includedMinutes: p.includedMinutes,
        })),
      },
    });
  } catch (error) {
    console.error("Error getting subscription plans:", error);
    return next(new AppError("Failed to get subscription plans", 500));
  }
};

// Helper to map Vehicle.model/vehicleType to plan vehicle type
function normalizeVehicleType(raw: string | null | undefined): VehiclePlanType | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (v.includes("bike") || v.includes("scooter") || v.includes("cycle")) return "BIKE";
  if (v.includes("auto") || v.includes("rickshaw") || v.includes("tuk")) return "AUTO";
  // Default to CAR for typical car terms
  if (v.includes("car") || v.includes("sedan") || v.includes("suv") || v.includes("hatch")) return "CAR";
  return null;
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

    // Driver must be verified (approved) by admin before buying a subscription
    const driverRecord = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { approvalStatus: true },
    });
    if (!driverRecord || driverRecord.approvalStatus !== "APPROVED") {
      return res.status(403).json({
        success: false,
        error: "You must be verified by admin before you can buy a subscription.",
      });
    }

    // Validate request body
    const validatedData = subscriptionActivateSchema.parse(req.body);
    const { planId, amount, paymentMode, transactionId, durationDays, includedMinutes } = validatedData;

    // Check if driver exists
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
    });

    if (!driver) {
      return next(new AppError("Driver not found", 404));
    }

    // If a catalogue plan is provided, derive amount/duration/minutes from it
    let effectiveAmount = amount ?? 0;
    let effectiveDurationDays = durationDays;
    let effectiveIncludedMinutes = includedMinutes;
    let appliedPlan: SubscriptionPlan | null = null;

    if (planId) {
      const plan = SUBSCRIPTION_PLANS.find((p) => p.id === planId);
      if (!plan) {
        return next(new AppError("Invalid subscription plan", 400));
      }

      // Ensure driver has a vehicle and its type matches the plan's vehicleType
      const vehicle = await prisma.vehicle.findUnique({
        where: { driverId },
        select: { vehicleType: true, model: true },
      });

      if (!vehicle) {
        return next(
          new AppError(
            "Vehicle information not found. Please complete vehicle details before buying a plan.",
            400
          )
        );
      }

      const driverVehicleType = normalizeVehicleType(
        vehicle.vehicleType || vehicle.model || null
      );

      if (!driverVehicleType || driverVehicleType !== plan.vehicleType) {
        return next(
          new AppError(
            `This plan is only available for ${plan.vehicleType.toLowerCase()} drivers`,
            400
          )
        );
      }

      effectiveAmount = plan.price;
      effectiveDurationDays = plan.durationDays;
      effectiveIncludedMinutes = plan.includedMinutes ?? undefined;
      appliedPlan = plan;
    }

    // Calculate subscription dates
    const startTime = new Date();
    const expire = new Date(startTime);
    expire.setDate(expire.getDate() + effectiveDurationDays);

    // Use transaction to create both payment and subscription records
    const result = await prisma.$transaction(async (tx) => {
      // Create subscription payment record
      const payment = await tx.subscriptionPayment.create({
        data: {
          driverId: driverId,
          amount: effectiveAmount,
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

      // Per-day allowance: fixed window (midnight–midnight), continuous from first online that day.
      // Daily plan: dailyAllowanceMinutes = includedMinutes. Multi-day: includedMinutes / durationDays. Unlimited: null.
      const dailyAllowanceMinutes =
        effectiveIncludedMinutes != null && effectiveDurationDays != null
          ? effectiveDurationDays === 1
            ? effectiveIncludedMinutes
            : Math.floor(effectiveIncludedMinutes / effectiveDurationDays)
          : null;

      // Create new subscription
      const subscription = await tx.driverSubscription.create({
        data: {
          driverId: driverId,
          startTime: startTime,
          expire: expire,
          amountPaid: effectiveAmount,
          status: "ACTIVE",
          paymentId: payment.id,
          paymentMode: paymentMode,
          autoRenewed: false,
          remainingMinutes: effectiveIncludedMinutes ?? null,
          dailyAllowanceMinutes,
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
          planId: appliedPlan?.id ?? null,
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
          dailyAllowanceMinutes: subscription.dailyAllowanceMinutes,
        },
      },
    });
  } catch (error) {
    console.error("Error getting subscription:", error);
    return next(new AppError("Failed to get subscription", 500));
  }
};

