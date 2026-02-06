import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";
import { uploadToSupabase } from "../../utils/supabaseUpload";
import fs from "fs";

/**
 * Update driver profile (basic fields)
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

    const {
      name,
      phoneNumber,
      aadharNumber,
      panNumber,
      drivingExperience,
    } = req.body;

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
      return next(
        new AppError("Phone number, Aadhar, or PAN already exists", 400)
      );
    }

    return next(new AppError("Failed to update driver profile", 500));
  }
};

/**
 * Upload / update driver profile image
 * POST /api/driver/profile/image
 * Body: multipart/form-data with field "profileImage"
 */
export const uploadDriverProfileImage = async (
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

    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No profile image uploaded",
      });
    }

    if (!file.path || !fs.existsSync(file.path)) {
      return next(
        new AppError(
          `Uploaded file not found on disk: ${file.originalname}`,
          500
        )
      );
    }

    // Upload to Supabase (driver-profile-images folder)
    const imageUrl = await uploadToSupabase(file, "driver-profile-images");

    // Ensure DriverDetails exists and update profileImage
    const driverDetails = await prisma.driverDetails.upsert({
      where: { driverId },
      create: {
        driverId,
        // TEMP license number placeholder; real value will be set during document verification
        licenseNumber: `TEMP-${driverId}`,
        profileImage: imageUrl,
      },
      update: {
        profileImage: imageUrl,
      },
      select: {
        profileImage: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Profile image updated successfully",
      data: {
        profileImage: driverDetails.profileImage,
      },
    });
  } catch (error: any) {
    console.error("Error uploading driver profile image:", error);
    return next(
      new AppError(
        "Failed to upload profile image: " +
          (error instanceof Error ? error.message : "Unknown error"),
        500
      )
    );
  }
};

/**
 * Upload daily verification selfie (for admin review).
 * Does NOT update profile photo. Replaces previous day's selfie in DB.
 * POST /api/driver/profile/verification-selfie
 * Body: multipart/form-data with field "verificationSelfie"
 */
export const uploadVerificationSelfie = async (
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

    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No verification selfie uploaded",
      });
    }

    if (!file.path || !fs.existsSync(file.path)) {
      return next(
        new AppError(
          `Uploaded file not found on disk: ${file.originalname}`,
          500
        )
      );
    }

    const imageUrl = await uploadToSupabase(file, "driver-verification-selfies");

    const driverDetails = await prisma.driverDetails.upsert({
      where: { driverId },
      create: {
        driverId,
        licenseNumber: `TEMP-${driverId}`,
        verificationSelfieUrl: imageUrl,
      },
      update: {
        verificationSelfieUrl: imageUrl,
      },
      select: {
        verificationSelfieUrl: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Verification selfie saved successfully",
      data: {
        verificationSelfieUrl: driverDetails.verificationSelfieUrl,
      },
    });
  } catch (error: any) {
    console.error("Error uploading verification selfie:", error);
    return next(
      new AppError(
        "Failed to upload verification selfie: " +
          (error instanceof Error ? error.message : "Unknown error"),
        500
      )
    );
  }
};

