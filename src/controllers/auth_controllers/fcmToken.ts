import { Request, Response } from "express";
import { prisma } from "../../prismaClient";

/**
 * Register FCM token for push notifications (driver)
 * POST /api/driver/fcm-token
 * Body: { fcmToken: string }
 */
export const registerFcmToken = async (req: Request, res: Response): Promise<any> => {
  try {
    const driver = (req as any).driver;
    if (!driver?.id) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== "string" || fcmToken.trim().length === 0) {
      return res.status(400).json({ error: "fcmToken is required" });
    }
    await prisma.driver.update({
      where: { id: driver.id },
      data: { fcmToken: fcmToken.trim() },
    });
    return res.status(200).json({ success: true, message: "FCM token registered" });
  } catch (e) {
    console.error("registerFcmToken error:", e);
    return res.status(500).json({ error: "Failed to register FCM token" });
  }
};
