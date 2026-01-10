import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";
import {
  sendDriverApprovalEmail,
  sendDriverRejectionEmail,
  sendDriverSuspensionEmail,
} from "../../utils/emailService";
import { generateToken, verifyToken } from "../../utils/jwtService";

/**
 * Get all drivers (admin only)
 * GET /api/driver/admin/list
 */
export const getAllDrivers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const user = req.user;
    if (!user || !user.isAdmin) {
      return next(new AppError("Admin access required", 403));
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const skip = (page - 1) * limit;
    const approvalStatus = req.query.approvalStatus as string | undefined;

    const where: any = {};
    if (approvalStatus) {
      where.approvalStatus = approvalStatus;
    }

    const [drivers, totalCount] = await Promise.all([
      prisma.driver.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          documents: {
            select: {
              id: true,
              documentType: true,
              isVerified: true,
              expiryDate: true,
            },
          },
          vehicle: {
            select: {
              id: true,
              licensePlate: true,
              vehicleType: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              phoneNumber: true,
            },
          },
        },
      }),
      prisma.driver.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      success: true,
      data: {
        drivers,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          limit,
        },
      },
    });
  } catch (error: any) {
    console.error("Error fetching drivers:", error);
    return next(new AppError("Failed to fetch drivers", 500));
  }
};

/**
 * Approve driver
 * PUT /api/driver/admin/approve/:driverId
 * GET /api/driver/admin/approve?token=xxx (from email link)
 */
export const approveDriver = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    let driverId: string;

    // Handle both direct API calls and email link clicks
    if (req.params.driverId) {
      // Direct API call with driverId parameter - requires admin auth
      const user = req.user;
      if (!user || !user.isAdmin) {
        return next(new AppError("Admin access required", 403));
      }
      driverId = req.params.driverId;
    } else if (req.query.token) {
      // Email link with token (no admin auth required, token is secure)
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);

        // Verify this is an approve action token
        if (decoded.action !== "approve") {
          return next(new AppError("Invalid token action", 400));
        }

        driverId = decoded.driverId;
      } catch (error) {
        return next(new AppError("Invalid or expired token", 400));
      }
    } else {
      return next(new AppError("No driver ID or token provided", 400));
    }

    // Find the driver
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      return next(new AppError("Driver not found", 404));
    }

    // Update driver status
    const updatedDriver = await prisma.driver.update({
      where: { id: driverId },
      data: {
        isVerified: true,
        approvalStatus: "APPROVED",
        accountActive: true,
      },
    });

    // Generate onboarding token (for driver app)
    const onboardingToken = generateToken(driver.id);

    // Send approval email to driver
    const driverEmail = driver.user?.email || driver.email;
    if (driverEmail) {
      await sendDriverApprovalEmail(driverEmail, onboardingToken);
    }

    // If this is from an email link, redirect to a confirmation page
    if (req.query.token) {
      return res.redirect(
        `${
          process.env.FRONTEND_APP_URL || "https://transitco.in"
        }/admin/driver-approved?name=${encodeURIComponent(driver.name)}`
      );
    }

    // Otherwise return JSON response
    return res.status(200).json({
      success: true,
      message: "Driver approved successfully",
      data: {
        driver: {
          id: updatedDriver.id,
          name: updatedDriver.name,
          isVerified: updatedDriver.isVerified,
          approvalStatus: updatedDriver.approvalStatus,
        },
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    console.error("Error approving driver:", error);
    return next(new AppError("Error approving driver", 500));
  }
};

/**
 * Reject driver
 * PUT /api/driver/admin/reject/:driverId
 * GET/POST /api/driver/admin/reject?token=xxx (from email link)
 */
export const rejectDriver = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    let driverId: string;
    let reason: string = req.body.reason || req.body.rejectionReason;

    // Handle both direct API calls and email link clicks
    if (req.params.driverId) {
      // Direct API call with driverId parameter - requires admin auth
      const user = req.user;
      if (!user || !user.isAdmin) {
        return next(new AppError("Admin access required", 403));
      }
      driverId = req.params.driverId;
    } else if (req.query.token) {
      // Email link with token
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);

        // Verify this is a reject action token
        if (decoded.action !== "reject") {
          return next(new AppError("Invalid token action", 400));
        }

        driverId = decoded.driverId;

        // If rejection is from email link and no reason provided, redirect to rejection form
        if (!reason) {
          return res.redirect(
            `${process.env.FRONTEND_APP_URL || "https://transitco.in"}/admin/driver-reject-form?token=${req.query.token}`
          );
        }
      } catch (error) {
        return next(new AppError("Invalid or expired token", 400));
      }
    } else {
      return next(new AppError("No driver ID or token provided", 400));
    }

    // Reason is required
    if (!reason) {
      return next(new AppError("Rejection reason is required", 400));
    }

    // Find the driver
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      return next(new AppError("Driver not found", 404));
    }

    // Update driver status
    const updatedDriver = await prisma.driver.update({
      where: { id: driverId },
      data: {
        isVerified: false,
        approvalStatus: "REJECTED",
        accountActive: false,
        rejectionReason: reason,
      },
    });

    // Send rejection email
    const driverEmail = driver.user?.email || driver.email;
    if (driverEmail) {
      await sendDriverRejectionEmail(driverEmail, reason);
    }

    // If this is from an email link, redirect to a confirmation page
    if (req.query.token) {
      return res.redirect(
        `${
          process.env.FRONTEND_APP_URL || "https://transitco.in"
        }/admin/driver-rejected?name=${encodeURIComponent(driver.name)}`
      );
    }

    // Otherwise return JSON response
    return res.status(200).json({
      success: true,
      message: "Driver rejected successfully",
      data: {
        driver: {
          id: updatedDriver.id,
          name: updatedDriver.name,
          rejectionReason: updatedDriver.rejectionReason,
          approvalStatus: updatedDriver.approvalStatus,
        },
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    console.error("Error rejecting driver:", error);
    return next(new AppError("Error rejecting driver", 500));
  }
};

/**
 * Update driver approval status (generic endpoint)
 * PATCH /api/driver/admin/:driverId/approval
 */
export const updateDriverApproval = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const user = req.user;
    if (!user || !user.isAdmin) {
      return next(new AppError("Admin access required", 403));
    }

    const { driverId } = req.params;
    const { approvalStatus, rejectionReason, suspensionReason } = req.body;

    if (!driverId || !approvalStatus) {
      return next(
        new AppError("Driver ID and approval status are required", 400)
      );
    }

    const validStatuses = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];
    if (!validStatuses.includes(approvalStatus)) {
      return next(
        new AppError(
          `Invalid approval status. Must be one of: ${validStatuses.join(", ")}`,
          400
        )
      );
    }

    // Find driver
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      return next(new AppError("Driver not found", 404));
    }

    // Update driver approval status
    const updateData: any = {
      approvalStatus,
    };

    if (approvalStatus === "APPROVED") {
      updateData.isVerified = true;
      updateData.accountActive = true;
      updateData.rejectionReason = null;
      
      // Send approval email
      const driverEmail = driver.user?.email || driver.email;
      if (driverEmail) {
        const onboardingToken = generateToken(driver.id);
        await sendDriverApprovalEmail(driverEmail, onboardingToken);
      }
    } else if (approvalStatus === "REJECTED") {
      updateData.isVerified = false;
      updateData.accountActive = false;
      if (rejectionReason) {
        updateData.rejectionReason = rejectionReason;
        
        // Send rejection email
        const driverEmail = driver.user?.email || driver.email;
        if (driverEmail) {
          await sendDriverRejectionEmail(driverEmail, rejectionReason);
        }
      }
    } else if (approvalStatus === "SUSPENDED") {
      updateData.accountActive = false;
      const suspensionReason = req.body.suspensionReason || req.body.reason;
      if (suspensionReason) {
        updateData.suspensionReason = suspensionReason;
        
        // Send suspension email
        const driverEmail = driver.user?.email || driver.email;
        if (driverEmail) {
          await sendDriverSuspensionEmail(driverEmail, suspensionReason);
        }
      }
    }

    const updatedDriver = await prisma.driver.update({
      where: { id: driverId },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: `Driver ${approvalStatus.toLowerCase()} successfully`,
      data: {
        driver: {
          id: updatedDriver.id,
          name: updatedDriver.name,
          approvalStatus: updatedDriver.approvalStatus,
          isVerified: updatedDriver.isVerified,
          accountActive: updatedDriver.accountActive,
          rejectionReason: updatedDriver.rejectionReason,
          suspensionReason: (updatedDriver as any).suspensionReason,
        },
      },
    });
  } catch (error: any) {
    console.error("Error updating driver approval:", error);
    return next(new AppError("Failed to update driver approval", 500));
  }
};

/**
 * Suspend driver (admin only)
 * PUT /api/driver/admin/suspend/:driverId
 * GET /api/driver/admin/suspend?token=xxx (from email link - optional)
 */
export const suspendDriver = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    let driverId: string;
    let reason: string = req.body.reason || req.body.suspensionReason;

    // Handle both direct API calls and email link clicks
    if (req.params.driverId) {
      // Direct API call with driverId parameter - requires admin auth
      const user = req.user;
      if (!user || !user.isAdmin) {
        return next(new AppError("Admin access required", 403));
      }
      driverId = req.params.driverId;
    } else if (req.query.token) {
      // Email link with token (optional, but if present, verify it)
      try {
        const jwt = require("jsonwebtoken");
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);

        // Verify this is a suspend action token
        if (decoded.action !== "suspend") {
          return next(new AppError("Invalid token action", 400));
        }

        driverId = decoded.driverId;

        // If suspension is from email link and no reason provided, redirect to suspension form
        if (!reason) {
          return res.redirect(
            `${process.env.FRONTEND_APP_URL || "https://transitco.in"}/admin/driver-suspend-form?token=${req.query.token}`
          );
        }
      } catch (error) {
        return next(new AppError("Invalid or expired token", 400));
      }
    } else {
      return next(new AppError("No driver ID or token provided", 400));
    }

    // Reason is required for suspension
    if (!reason) {
      return next(new AppError("Suspension reason is required", 400));
    }

    // Find the driver
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true },
    });

    if (!driver) {
      return next(new AppError("Driver not found", 404));
    }

    // Update driver status
    const updatedDriver = await prisma.driver.update({
      where: { id: driverId },
      data: {
        approvalStatus: "SUSPENDED",
        accountActive: false,
        suspensionReason: reason,
      },
    });

    // Send suspension email
    const driverEmail = driver.user?.email || driver.email;
    if (driverEmail) {
      await sendDriverSuspensionEmail(driverEmail, reason);
    }

    // If this is from an email link, redirect to a confirmation page
    if (req.query.token) {
      return res.redirect(
        `${
          process.env.FRONTEND_APP_URL || "https://transitco.in"
        }/admin/driver-suspended?name=${encodeURIComponent(driver.name)}`
      );
    }

    // Otherwise return JSON response
    return res.status(200).json({
      success: true,
      message: "Driver suspended successfully",
      data: {
        driver: {
          id: updatedDriver.id,
          name: updatedDriver.name,
          suspensionReason: (updatedDriver as any).suspensionReason,
          approvalStatus: updatedDriver.approvalStatus,
          accountActive: updatedDriver.accountActive,
        },
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    console.error("Error suspending driver:", error);
    return next(new AppError("Error suspending driver", 500));
  }
};
