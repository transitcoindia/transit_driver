import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";

/**
 * Update driver profile
 */
export const updateDriverProfile = async (
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

    const { name, phoneNumber, aadharNumber, panNumber, drivingExperience } = req.body;

    // Build update data object
    const updateData: any = {};
    
    if (name !== undefined) updateData.name = name;
    if (phoneNumber !== undefined) updateData.contactNumber = phoneNumber;
    if (aadharNumber !== undefined) updateData.aadharNumber = aadharNumber;
    if (panNumber !== undefined) updateData.panNumber = panNumber;
    if (drivingExperience !== undefined) {
      if (typeof drivingExperience !== "number" || drivingExperience < 0) {
        return res.status(400).json({
          success: false,
          error: "Driving experience must be a non-negative number",
        });
      }
      updateData.drivingExperience = drivingExperience;
    }

    // Update driver profile
    const updatedDriver = await prisma.driver.update({
      where: { id: driverId },
      data: updateData,
      select: {
        id: true,
        name: true,
        contactNumber: true,
        aadharNumber: true,
        panNumber: true,
        drivingExperience: true,
        isVerified: true,
        approvalStatus: true,
        averageRating: true,
        totalRatings: true,
        accountActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Driver profile updated successfully",
      data: {
        driver: updatedDriver,
      },
    });
  } catch (error: any) {
    console.error("Error updating driver profile:", error);
    
    if (error.code === "P2002") {
      return next(new AppError("Phone number, Aadhar, or PAN already exists", 400));
    }
    
    return next(new AppError("Failed to update driver profile", 500));
  }
};


