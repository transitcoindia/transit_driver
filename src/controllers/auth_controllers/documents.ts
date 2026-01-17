import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";
import { uploadToSupabase } from "../../utils/supabaseUpload";
import fs from "fs";
import { driverVehicleInfoSchema } from "../../validator/driverValidation";

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

        // Upload to Supabase
        const s3FileUrl = await uploadToSupabase(file, "driver-documents");
        console.log("Supabase upload successful", {
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

/**
 * Upload vehicle images (cover, interior, exterior)
 * POST /api/driver/documents/vehicleImages
 */
export const uploadVehicleImages = async (
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

    // Check if files were uploaded
    if (!req.files) {
      return next(new AppError("No images uploaded", 400));
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    // Debug: Log what files were received
    console.log("Upload vehicle images - Files received:", {
      fileFields: Object.keys(files),
      fileCounts: Object.entries(files).map(([key, value]) => ({ [key]: Array.isArray(value) ? value.length : 0 })),
    });

    // Check if vehicle exists for this driver
    const vehicle = await prisma.vehicle.findUnique({
      where: { driverId: driverId },
      select: {
        id: true,
        vehicleImages: true,
      },
    });

    if (!vehicle) {
      return next(new AppError("Vehicle not found. Please create vehicle information first.", 404));
    }

    // Get existing images or initialize empty object
    let existingImages: any = {
      cover: [],
      interior: [],
      exterior: [],
    };

    if (vehicle.vehicleImages) {
      try {
        existingImages = vehicle.vehicleImages as any;
        existingImages.cover = existingImages.cover || [];
        existingImages.interior = existingImages.interior || [];
        existingImages.exterior = existingImages.exterior || [];
      } catch (error) {
        console.error("Error parsing existing vehicle images:", error);
        // Keep default empty arrays
      }
    }

    const uploadedUrls: { cover: string[]; interior: string[]; exterior: string[] } = {
      cover: [],
      interior: [],
      exterior: [],
    };

    const uploadErrors: string[] = [];

    // Process cover images
    if (files["cover"] && files["cover"].length > 0) {
      for (const file of files["cover"]) {
        try {
          if (!fs.existsSync(file.path)) {
            uploadErrors.push(`Cover image not found: ${file.originalname}`);
            continue;
          }
          const s3Url = await uploadToSupabase(file, "vehicle-images");
          uploadedUrls.cover.push(s3Url);
          // Clean up local file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          const errorDetails = error instanceof Error ? error.stack : String(error);
          console.error(`Supabase upload failed for cover image ${file.originalname}:`, {
            error: errorMsg,
            details: errorDetails,
            filePath: file.path,
            fileExists: file.path ? fs.existsSync(file.path) : false,
          });
          uploadErrors.push(`Failed to upload cover image ${file.originalname}: ${errorMsg}`);
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }
    }

    // Process interior images
    if (files["interior"] && files["interior"].length > 0) {
      for (const file of files["interior"]) {
        try {
          if (!fs.existsSync(file.path)) {
            uploadErrors.push(`Interior image not found: ${file.originalname}`);
            continue;
          }
          const s3Url = await uploadToSupabase(file, "vehicle-images");
          uploadedUrls.interior.push(s3Url);
          // Clean up local file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (error) {
          uploadErrors.push(`Failed to upload interior image ${file.originalname}: ${error instanceof Error ? error.message : "Unknown error"}`);
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }
    }

    // Process exterior images
    if (files["exterior"] && files["exterior"].length > 0) {
      for (const file of files["exterior"]) {
        try {
          if (!fs.existsSync(file.path)) {
            uploadErrors.push(`Exterior image not found: ${file.originalname}`);
            continue;
          }
          const s3Url = await uploadToSupabase(file, "vehicle-images");
          uploadedUrls.exterior.push(s3Url);
          // Clean up local file
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (error) {
          uploadErrors.push(`Failed to upload exterior image ${file.originalname}: ${error instanceof Error ? error.message : "Unknown error"}`);
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        }
      }
    }

    // Check if any images were successfully uploaded
    const totalUploaded = uploadedUrls.cover.length + uploadedUrls.interior.length + uploadedUrls.exterior.length;
    
    // Debug: Log what was processed
    console.log("Upload vehicle images - Processing summary:", {
      totalUploaded,
      coverCount: uploadedUrls.cover.length,
      interiorCount: uploadedUrls.interior.length,
      exteriorCount: uploadedUrls.exterior.length,
      uploadErrors,
      fileFieldsReceived: Object.keys(files),
    });
    
    if (totalUploaded === 0) {
      // Provide more detailed error message
      const errorDetails = [];
      if (uploadErrors.length > 0) {
        errorDetails.push(...uploadErrors);
      } else {
        // If no errors but also no uploads, the files might be empty or invalid
        const fileFieldInfo = Object.entries(files).map(([field, fileArray]) => {
          const count = Array.isArray(fileArray) ? fileArray.length : 0;
          const hasValidFiles = Array.isArray(fileArray) && fileArray.some(f => f && f.path);
          return `${field}: ${count} file(s)${hasValidFiles ? '' : ' (no valid file paths)'}`;
        }).join(', ');
        errorDetails.push(`Files received but not processed. Details: ${fileFieldInfo || 'No valid files found'}`);
      }
      return next(new AppError("No images were successfully uploaded. " + errorDetails.join("; "), 400));
    }

    // Merge with existing images (append new images to existing ones)
    const updatedImages = {
      cover: [...existingImages.cover, ...uploadedUrls.cover],
      interior: [...existingImages.interior, ...uploadedUrls.interior],
      exterior: [...existingImages.exterior, ...uploadedUrls.exterior],
    };

    // Update vehicle with new images
    const updatedVehicle = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        vehicleImages: updatedImages,
      },
      select: {
        id: true,
        licensePlate: true,
        make: true,
        model: true,
        year: true,
        vehicleImages: true,
      },
    });

    // Parse images for response
    let responseImages = {
      cover: [] as string[],
      interior: [] as string[],
      exterior: [] as string[],
    };

    if (updatedVehicle.vehicleImages) {
      try {
        const parsed = updatedVehicle.vehicleImages as any;
        responseImages = {
          cover: parsed.cover || [],
          interior: parsed.interior || [],
          exterior: parsed.exterior || [],
        };
      } catch (error) {
        console.error("Error parsing vehicle images:", error);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Successfully uploaded ${totalUploaded} image(s)`,
      data: {
        vehicleId: updatedVehicle.id,
        licensePlate: updatedVehicle.licensePlate,
        make: updatedVehicle.make,
        model: updatedVehicle.model,
        year: updatedVehicle.year,
        images: responseImages,
        uploaded: {
          cover: uploadedUrls.cover.length,
          interior: uploadedUrls.interior.length,
          exterior: uploadedUrls.exterior.length,
        },
      },
      ...(uploadErrors.length > 0 && { warnings: uploadErrors }),
    });
  } catch (error: any) {
    console.error("Error uploading vehicle images:", error);
    return next(new AppError("Failed to upload vehicle images", 500));
  }
};

/**
 * Create or update vehicle information
 * POST /api/driver/documents/vehicleInfo
 */
export const createOrUpdateVehicleInfo = async (
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

    // Validate request body
    const validatedData = driverVehicleInfoSchema.parse(req.body);
    const {
      model,
      brand,
      number,
      year,
      fuelType,
      seatingCapacity,
      hasCNG,
      hasElectric,
      insuranceStatus,
      insuranceExpiryDate,
      registrationExpiryDate,
      drivingExperience,
    } = validatedData;

    // Check if vehicle already exists for this driver
    const existingVehicle = await prisma.vehicle.findUnique({
      where: { driverId: driverId },
    });

    // Determine vehicle type from model (simple mapping - can be enhanced)
    const getVehicleType = (model: string): string => {
      const modelLower = model.toLowerCase();
      if (modelLower.includes('suv') || modelLower.includes('xuv')) return 'suv';
      if (modelLower.includes('hatch') || modelLower.includes('hatchback')) return 'hatchback';
      if (modelLower.includes('sedan')) return 'sedan';
      if (modelLower.includes('van')) return 'van';
      if (modelLower.includes('auto') || modelLower.includes('tuk')) return 'auto';
      return 'sedan'; // Default
    };

    const vehicleType = getVehicleType(model);

    // Prepare vehicle data
    const vehicleData: any = {
      make: brand,
      model: model,
      year: year,
      licensePlate: number,
      vehicleType: vehicleType,
      fuelType: fuelType,
      seatingCapacity: seatingCapacity,
      hasCNG: hasCNG || false,
      hasElectric: hasElectric || false,
      // Note: roofTop is not in Vehicle model (only in Cab model)
      insuranceStatus: insuranceStatus || false,
      driverId: driverId,
      color: null, // Optional field
      updatedAt: new Date(),
    };

    // Handle dates - Vehicle model uses insuranceExpiry and registrationExpiry (not Date suffix)
    if (insuranceExpiryDate) {
      vehicleData.insuranceExpiry = new Date(insuranceExpiryDate);
    }
    if (registrationExpiryDate) {
      vehicleData.registrationExpiry = new Date(registrationExpiryDate);
    }

    let vehicle;
    if (existingVehicle) {
      // Update existing vehicle
      vehicle = await prisma.vehicle.update({
        where: { id: existingVehicle.id },
        data: vehicleData,
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          vehicleType: true,
          fuelType: true,
          seatingCapacity: true,
          hasCNG: true,
          hasElectric: true,
          insuranceStatus: true,
          insuranceExpiry: true,
          registrationExpiry: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } else {
      // Create new vehicle
      vehicle = await prisma.vehicle.create({
        data: vehicleData,
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          vehicleType: true,
          fuelType: true,
          seatingCapacity: true,
          hasCNG: true,
          hasElectric: true,
          insuranceStatus: true,
          insuranceExpiry: true,
          registrationExpiry: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    // Update driver's driving experience if provided
    if (drivingExperience !== undefined) {
      await prisma.driver.update({
        where: { id: driverId },
        data: {
          drivingExperience: drivingExperience,
        },
      });
    }

    return res.status(existingVehicle ? 200 : 201).json({
      success: true,
      message: existingVehicle
        ? "Vehicle information updated successfully"
        : "Vehicle information created successfully",
      data: {
        vehicle: vehicle,
      },
    });
  } catch (error: any) {
    console.error("Error creating/updating vehicle info:", error);
    console.error("Error details:", {
      name: error.name,
      message: error.message,
      code: error.code,
      meta: error.meta,
      stack: error.stack,
    });
    
    // Handle validation errors
    if (error.name === "ZodError") {
      return next(
        new AppError(
          `Validation failed: ${error.errors.map((e: any) => e.message).join(", ")}`,
          400
        )
      );
    }

    // Handle Prisma unique constraint error (duplicate license plate)
    if (error.code === "P2002") {
      return next(
        new AppError(
          "A vehicle with this license plate number already exists",
          400
        )
      );
    }

    // Handle Prisma field errors (unknown field, etc.)
    if (error.code === "P2009" || error.code === "P2010") {
      console.error("Prisma schema mismatch detected:", error.message);
      return next(
        new AppError(
          "Database schema mismatch. Please contact support.",
          500
        )
      );
    }

    return next(new AppError(
      `Failed to create/update vehicle information: ${error.message || "Unknown error"}`,
      500
    ));
  }
};


