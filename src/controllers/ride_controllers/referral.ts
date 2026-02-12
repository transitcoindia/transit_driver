import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";
import { generateReferralCode } from "../../utils/generateReferralCode";

/**
 * Get driver's referral code and stats
 * GET /api/driver/referral
 */
export const getReferralInfo = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    if (!req.driver?.id) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const driverId = req.driver.id;

    let driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { referralCode: true },
    });

    if (!driver) {
      return next(new AppError("Driver not found", 404));
    }

    // Backfill referral code for existing drivers
    if (!driver.referralCode) {
      const code = await generateReferralCode(prisma);
      await prisma.driver.update({
        where: { id: driverId },
        data: { referralCode: code },
      });
      driver = { ...driver, referralCode: code };
    }

    // Count referred drivers who have completed at least one subscription (we've credited them)
    const referredCount = await prisma.referralCredit.count({
      where: { referrerDriverId: driverId },
    });

    return res.status(200).json({
      success: true,
      data: {
        referralCode: driver.referralCode || null,
        referredCount,
        referrerBonus: 50, // ₹50 per successful referral
        refereeBonus: 20,   // ₹20 for new driver on first subscription
      },
    });
  } catch (error) {
    console.error("Error getting referral info:", error);
    return next(new AppError("Failed to get referral info", 500));
  }
};
