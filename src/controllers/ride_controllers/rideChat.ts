import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";

/**
 * Get chat history for a ride
 * GET /api/driver/rides/:rideId/chat
 */
export const getRideChatHistory = async (
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
    const driverId = req.driver.id;
    const { rideId } = req.params;

    if (!rideId) {
      return res.status(400).json({
        success: false,
        message: "Ride ID is required",
      });
    }

    const ride = await prisma.ride.findFirst({
      where: { id: rideId, driverId },
      select: { id: true },
    });

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: "Ride not found or access denied",
      });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { rideId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        senderId: true,
        senderType: true,
        text: true,
        createdAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      data: { messages },
    });
  } catch (error: any) {
    console.error("Error fetching chat history:", error);
    return next(new AppError("Failed to fetch chat history", 500));
  }
};

/**
 * Send a chat message (driver)
 * POST /api/driver/rides/:rideId/chat
 * Body: { text: string }
 */
export const sendRideChatMessage = async (
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
    const driverId = req.driver.id;
    const { rideId } = req.params;
    const { text } = req.body;

    if (!rideId) {
      return res.status(400).json({
        success: false,
        message: "Ride ID is required",
      });
    }
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      return res.status(400).json({
        success: false,
        message: "Message text is required",
      });
    }

    const ride = await prisma.ride.findFirst({
      where: { id: rideId, driverId },
      select: { id: true, riderId: true },
    });

    if (!ride) {
      return res.status(404).json({
        success: false,
        message: "Ride not found or access denied",
      });
    }

    const message = await prisma.chatMessage.create({
      data: {
        rideId,
        senderId: driverId,
        senderType: "driver",
        text: trimmed,
      },
      select: {
        id: true,
        rideId: true,
        senderId: true,
        senderType: true,
        text: true,
        createdAt: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: { message },
      riderId: ride.riderId,
    });
  } catch (error: any) {
    console.error("Error sending chat message:", error);
    return next(new AppError("Failed to send message", 500));
  }
};
