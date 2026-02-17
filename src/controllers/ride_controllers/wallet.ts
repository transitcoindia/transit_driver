import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";
import Razorpay from "razorpay";
import crypto from "node:crypto";

// Initialize Razorpay
const razorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  : null;

/**
 * Get driver wallet balance
 * GET /api/driver/wallet
 */
export const getWalletBalance = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const driverId = req.driver.id;

    const wallet = await prisma.driverWallet.findUnique({ where: { driverId } }) ??
      await prisma.driverWallet.create({ data: { driverId } });

    return res.status(200).json({
      success: true,
      data: {
        balance: wallet.balance,
        currency: wallet.currency,
      },
    });
  } catch (error) {
    console.error("Error getting wallet balance:", error);
    return next(new AppError("Failed to get wallet balance", 500));
  }
};

/**
 * Get driver wallet transactions
 * GET /api/driver/wallet/transactions
 * Query: limit (default 50), offset (default 0)
 */
export const getWalletTransactions = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const driverId = req.driver.id;
    const limit = Math.min(Number.parseInt(req.query.limit as string) || 50, 100);
    const offset = Number.parseInt(req.query.offset as string) || 0;

    const wallet = await prisma.driverWallet.findUnique({ where: { driverId } }) ??
      await prisma.driverWallet.create({ data: { driverId } });

    const [transactions, total] = await Promise.all([
      prisma.driverWalletTransaction.findMany({
        where: { driverWalletId: wallet.id },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.driverWalletTransaction.count({
        where: { driverWalletId: wallet.id },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        transactions: transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: t.amount,
          balanceBefore: t.balanceBefore,
          balanceAfter: t.balanceAfter,
          description: t.description,
          referenceType: t.referenceType,
          createdAt: t.createdAt,
        })),
        total,
      },
    });
  } catch (error) {
    console.error("Error getting wallet transactions:", error);
    return next(new AppError("Failed to get wallet transactions", 500));
  }
};

/**
 * Create wallet top-up order
 * POST /api/driver/wallet/top-up/create-order
 */
export const createTopUpOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const driverId = req.driver.id;

    const { amount } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        error: "Amount must be at least 1 INR",
      });
    }

    if (!razorpay) {
      return res.status(503).json({
        success: false,
        error: "Payment gateway not configured",
      });
    }

    // Ensure wallet exists
    const wallet = await prisma.driverWallet.findUnique({ where: { driverId } }) ??
      await prisma.driverWallet.create({ data: { driverId } });

    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: "INR",
      receipt: `wallet_topup_driver_${driverId}_${Date.now()}`,
      notes: {
        driverId: driverId,
        type: "wallet_topup",
      },
    };

    const order = await razorpay.orders.create(options);

    return res.status(200).json({
      success: true,
      message: "Top-up order created successfully",
      data: {
        orderId: order.id,
        amount: (order.amount as number) / 100,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error: any) {
    console.error("Error creating top-up order:", error);
    return next(new AppError("Failed to create top-up order", 500));
  }
};

/**
 * Verify and process wallet top-up
 * POST /api/driver/wallet/top-up/verify
 */
export const verifyTopUp = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const driverId = req.driver.id;

    const {
      amount,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!amount || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Missing required verification fields",
      });
    }

    if (!razorpay) {
      return res.status(503).json({
        success: false,
        error: "Payment gateway not configured",
      });
    }

    // Verify signature
    const generated_signature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generated_signature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: "Payment verification failed",
      });
    }

    // Process top-up
    const result = await prisma.$transaction(async (tx) => {
      // Get or create wallet
      const wallet = await tx.driverWallet.findUnique({ where: { driverId } }) ??
        await tx.driverWallet.create({ data: { driverId } });

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + amount;

      // Update wallet balance
      const updatedWallet = await tx.driverWallet.update({
        where: { id: wallet.id },
        data: {
          balance: balanceAfter,
        },
      });

      // Record transaction
      await tx.driverWalletTransaction.create({
        data: {
          driverWalletId: wallet.id,
          type: "credit",
          amount: amount,
          balanceBefore: balanceBefore,
          balanceAfter: balanceAfter,
          description: `Wallet top-up via Razorpay`,
          referenceType: "topup",
          referenceId: razorpay_payment_id,
        },
      });

      return updatedWallet;
    });

    return res.status(200).json({
      success: true,
      message: "Wallet topped up successfully",
      data: {
        balance: result.balance,
        currency: result.currency,
        transactionId: razorpay_payment_id,
      },
    });
  } catch (error: any) {
    console.error("Error verifying top-up:", error);
    return next(new AppError("Failed to verify top-up", 500));
  }
};
