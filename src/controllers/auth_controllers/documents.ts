import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";
import { uploadToS3 } from "../../utils/s3Upload";
import fs from "fs";

/**
 * Get driver document status
 */
export const getDocumentStatus = async (
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

    // Get driver with documents
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: {
        documents: {
          orderBy: { uploadDate: "desc" },
        },
      },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver not found",
      });
    }

    // Required document types
    const requiredDocTypes = [
      "DRIVING_LICENSE",
      "VEHICLE_REGISTRATION",
      "INSURANCE",
    ];

    // Check which documents are uploaded and verified
    const docStatus: any = {};
    const missingDocs: string[] = [];

    requiredDocTypes.forEach((docType) => {
      const doc = driver.documents.find((d) => d.documentType === docType);
      if (doc) {
        docStatus[docType] = {
          id: doc.id,
          documentType: doc.documentType,
          documentNumber: doc.documentNumber,
          documentUrl: doc.documentUrl,
          expiryDate: doc.expiryDate,
          isVerified: doc.isVerified,
          verificationNotes: doc.verificationNotes,
          uploadDate: doc.uploadDate,
          verifiedDate: doc.verifiedDate,
        };
      } else {
        docStatus[docType] = null;
        missingDocs.push(docType);
      }
    });

    // Check if all documents are verified
    const allVerified = requiredDocTypes.every(
      (docType) =>
        docStatus[docType]?.isVerified === true &&
        (!docStatus[docType]?.expiryDate ||
          new Date(docStatus[docType].expiryDate) > new Date())
    );

    return res.status(200).json({
      success: true,
      data: {
        driverId: driver.id,
        approvalStatus: driver.approvalStatus,
        isVerified: driver.isVerified,
        documents: docStatus,
        missingDocuments: missingDocs,
        allDocumentsUploaded: missingDocs.length === 0,
        allDocumentsVerified: allVerified,
        governmentIds: {
          aadharNumber: driver.aadharNumber,
          panNumber: driver.panNumber,
        },
      },
    });
  } catch (error: any) {
    console.error("Error fetching document status:", error);
    return next(new AppError("Failed to fetch document status", 500));
  }
};

/**
 * Get vehicle images for driver
 * GET /api/driver/documents/vehicleImages
 */
export const getVehicleImages = async (
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

    // Get driver's vehicle
    const vehicle = await prisma.vehicle.findUnique({
      where: { driverId: driverId },
      select: {
        id: true,
        licensePlate: true,
        make: true,
        model: true,
        year: true,
        vehicleImages: true,
      },
    });

    if (!vehicle) {
      return res.status(404).json({
        success: false,
        message: "Vehicle not found for this driver",
      });
    }

    // Parse vehicle images JSON
    let images = {
      cover: [] as string[],
      interior: [] as string[],
      exterior: [] as string[],
    };

    if (vehicle.vehicleImages) {
      try {
        const parsedImages = vehicle.vehicleImages as any;
        images = {
          cover: parsedImages.cover || [],
          interior: parsedImages.interior || [],
          exterior: parsedImages.exterior || [],
        };
      } catch (error) {
        console.error("Error parsing vehicle images:", error);
        // Return empty arrays if parsing fails
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        vehicleId: vehicle.id,
        licensePlate: vehicle.licensePlate,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        images: images,
      },
    });
  } catch (error: any) {
    console.error("Error fetching vehicle images:", error);
    return next(new AppError("Failed to fetch vehicle images", 500));
  }
};

/**
 * Upload driver documents
 * POST /api/driver/documents/upload
 */
export const uploadDocuments = async (
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

    // Check if files were uploaded through Multer
    if (!req.files) {
      return next(new AppError("No documents uploaded", 400));
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    // Validate that documents field exists and has files
    if (!files["documents"] || files["documents"].length === 0) {
      return next(
        new AppError(
          "No documents uploaded. Please upload all required documents.",
          400
        )
      );
    }

    const documentFiles = files["documents"];

    // Check if files exist before processing
    for (const file of documentFiles) {
      if (!fs.existsSync(file.path)) {
        console.log("File not found on disk:", file.path);
        return next(
          new AppError(
            `File not found: ${file.originalname}. Upload directory may not exist.`,
            500
          )
        );
      }
    }

    // Parse document data
    let documentData;
    try {
      documentData = JSON.parse(req.body.documentData || "[]");
    } catch (error) {
      console.error("Failed to parse documentData JSON", error);
      return next(new AppError("Invalid document data format", 400));
    }

    if (
      !Array.isArray(documentData) ||
      documentData.length !== documentFiles.length
    ) {
      return next(
        new AppError(
          "Document data must match the number of uploaded files",
          400
        )
      );
    }

    // Check for required document types
    const requiredDocTypes = [
      "DRIVING_LICENSE",
      "VEHICLE_REGISTRATION",
      "INSURANCE",
    ];
    const uploadedDocTypes = documentData.map((doc) => doc.documentType);

    // Verify all required document types are included
    const missingDocTypes = requiredDocTypes.filter(
      (type) => !uploadedDocTypes.includes(type)
    );
    if (missingDocTypes.length > 0) {
      return next(
        new AppError(
          `Missing required document types: ${missingDocTypes.join(
            ", "
          )}. All three document types are required.`,
          400
        )
      );
    }

    const results = {
      success: Array<{
        file: string;
        documentId: string;
        documentType: string;
        documentUrl?: string;
      }>(),
      errors: Array<{
        file: string;
        error: string;
      }>(),
    };

    // Process each document
    for (let i = 0; i < documentFiles.length; i++) {
      const file = documentFiles[i];
      const data = documentData[i];

      try {
        // Basic validation
        if (!data.documentType) {
          results.errors.push({
            file: file.originalname,
            error: "Document type is required",
          });
          continue;
        }

        // Validate document data based on type
        let documentNumber = data.documentNumber;
        let isValid = true;
        let validationError = "";

        if (data.documentType === "DRIVING_LICENSE") {
          if (!data.driverLicenseNumber && !data.documentNumber) {
            isValid = false;
            validationError = "Driver license number is required";
          }
          documentNumber = data.driverLicenseNumber || data.documentNumber;
        } else if (data.documentType === "VEHICLE_REGISTRATION") {
          if (!data.rcNumber && !data.documentNumber) {
            isValid = false;
            validationError = "RC number is required";
          }
          documentNumber = data.rcNumber || data.documentNumber;
        }

        // Validate expiry date if provided (should be future date)
        if (data.expiryDate) {
          const date = new Date(data.expiryDate);
          if (isNaN(date.getTime())) {
            isValid = false;
            validationError = "Invalid expiry date format";
          }
        }

        if (!isValid) {
          results.errors.push({
            file: file.originalname,
            error: validationError,
          });
          continue;
        }

        // Upload to S3
        const s3FileUrl = await uploadToS3(file, "driver-documents");
        console.log("S3 upload successful", {
          fileName: file.originalname,
          s3FileUrl,
        });

        // Create document record
        const document = await prisma.driverDocument.create({
          data: {
            driverId: driverId,
            documentType: data.documentType,
            documentNumber: documentNumber,
            documentUrl: s3FileUrl,
            expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
            uploadDate: new Date(),
            isVerified: false, // Documents need admin verification
          },
        });

        results.success.push({
          file: file.originalname,
          documentId: document.id,
          documentType: document.documentType,
          documentUrl: s3FileUrl,
        });
      } catch (error) {
        console.error("Error processing file", {
          fileName: file.originalname,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        // Clean up the local file if it exists
        if (file.path && fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (unlinkError) {
            console.error("Error deleting file:", unlinkError);
          }
        }

        results.errors.push({
          file: file.originalname,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Update Government IDs if provided
    if (req.body.aadharNumber || req.body.panNumber) {
      await prisma.driver.update({
        where: { id: driverId },
        data: {
          aadharNumber: req.body.aadharNumber || undefined,
          panNumber: req.body.panNumber || undefined,
        },
      });
    }

    // Check if all required documents are uploaded
    const allDocuments = await prisma.driverDocument.findMany({
      where: { driverId },
    });

    const uploadedDocTypesAfter = allDocuments.map((doc) => doc.documentType);
    const allRequiredUploaded = requiredDocTypes.every((type) =>
      uploadedDocTypesAfter.includes(type)
    );

    // Update driver status if all documents are uploaded
    if (allRequiredUploaded) {
      await prisma.driver.update({
        where: { id: driverId },
        data: {
          approvalStatus: "UNDER_REVIEW",
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Documents processed",
      data: {
        results,
        allRequiredDocumentsUploaded: allRequiredUploaded,
        status: allRequiredUploaded ? "UNDER_REVIEW" : "PENDING",
      },
    });
  } catch (error: any) {
    console.error("Error uploading documents:", error);
    
    // Clean up any uploaded files on error
    if (req.files) {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      if (files["documents"]) {
        files["documents"].forEach((file) => {
          if (file.path && fs.existsSync(file.path)) {
            try {
              fs.unlinkSync(file.path);
            } catch (unlinkError) {
              console.error("Error deleting file:", unlinkError);
            }
          }
        });
      }
    }

    if (error instanceof AppError) {
      return next(error);
    }
    return next(
      new AppError(
        `Error uploading documents: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        500
      )
    );
  }
};


