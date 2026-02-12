import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";

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

    let wallet = await prisma.driverWallet.findUnique({ where: { driverId } });
    if (!wallet) {
      wallet = await prisma.driverWallet.create({ data: { driverId } });
    }

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

    let wallet = await prisma.driverWallet.findUnique({ where: { driverId } });
    if (!wallet) {
      wallet = await prisma.driverWallet.create({ data: { driverId } });
    }

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
