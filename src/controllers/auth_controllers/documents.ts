import { Request, Response, NextFunction } from "express";
import { prisma } from "../../prismaClient";
import AppError from "../../utils/AppError";

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


