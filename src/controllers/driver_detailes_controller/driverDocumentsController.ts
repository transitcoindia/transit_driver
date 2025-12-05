import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../prismaClient';
import AppError from '../../utils/AppError';
import { z } from 'zod';

/**
 * Driver Documents Upload Controller
 * Handles the Flutter driver documents screen API endpoints
 */

// Validation schema for document upload request
const driverDocumentsSchema = z.object({
    // Aadhar and PAN details
    aadharNumber: z.string().min(12, 'Aadhar number must be 12 digits').max(12),
    panNumber: z.string().min(10, 'PAN number must be 10 characters').max(10),
    
    // Driving License details
    driverLicenseNumber: z.string().min(1, 'Driving license number is required'),
    driverLicenseExpiry: z.string().min(1, 'License expiry date is required'),
    driverLicenseS3Key: z.string().min(1, 'Driver license image S3 key is required'),
    
    // RC (Vehicle Registration) details
    rcNumber: z.string().min(1, 'RC number is required'),
    rcExpiry: z.string().min(1, 'RC expiry date is required'),
    rcS3Key: z.string().min(1, 'RC image S3 key is required'),
    
    // Insurance details
    insuranceNumber: z.string().min(1, 'Insurance number is required'),
    insuranceExpiry: z.string().min(1, 'Insurance expiry date is required'),
    
    // Aadhar image
    aadharS3Key: z.string().min(1, 'Aadhar image S3 key is required'),
});

/**
 * Submit all driver documents at once
 * POST /api/driver/documents/submit-all
 * 
 * This endpoint receives all document metadata and S3 keys after
 * the client has already uploaded images directly to S3 using presigned URLs
 */
export const submitAllDocuments = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const driverId = req.driver?.id;

        if (!driverId) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized'
            });
        }

        // Validate request body
        const validatedData = driverDocumentsSchema.parse(req.body);

        const {
            aadharNumber,
            panNumber,
            driverLicenseNumber,
            driverLicenseExpiry,
            driverLicenseS3Key,
            rcNumber,
            rcExpiry,
            rcS3Key,
            insuranceNumber,
            insuranceExpiry,
            aadharS3Key
        } = validatedData;

        // Build S3 URLs from keys
        const region = process.env.AWS_REGION || 'ap-south-1';
        const bucketName = process.env.AWS_S3_BUCKET_NAME || 'transit-driver-documents-shankhtech';
        
        const buildS3Url = (key: string) => `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

        const driverLicenseUrl = buildS3Url(driverLicenseS3Key);
        const rcUrl = buildS3Url(rcS3Key);
        const aadharUrl = buildS3Url(aadharS3Key);

        // Start a transaction to ensure all documents are created together
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update or create driver details with Aadhar and PAN
            const driverDetails = await tx.driverDetails.upsert({
                where: { driverId },
                update: {
                    licenseNumber: driverLicenseNumber,
                    bankDetails: {
                        aadharNumber,
                        panNumber
                    }
                },
                create: {
                    driverId,
                    licenseNumber: driverLicenseNumber,
                    isVerified: false,
                    bankDetails: {
                        aadharNumber,
                        panNumber
                    }
                }
            });

            // 2. Create Driving License document
            const drivingLicenseDoc = await tx.driverDocument.create({
                data: {
                    driverId,
                    documentType: 'DRIVING_LICENSE',
                    documentNumber: driverLicenseNumber,
                    documentUrl: driverLicenseUrl,
                    expiryDate: new Date(driverLicenseExpiry),
                    uploadDate: new Date(),
                    isVerified: false
                }
            });

            // 3. Create Vehicle Registration (RC) document
            const rcDoc = await tx.driverDocument.create({
                data: {
                    driverId,
                    documentType: 'VEHICLE_REGISTRATION',
                    documentNumber: rcNumber,
                    documentUrl: rcUrl,
                    expiryDate: new Date(rcExpiry),
                    uploadDate: new Date(),
                    isVerified: false
                }
            });

            // 4. Create Insurance document
            const insuranceDoc = await tx.driverDocument.create({
                data: {
                    driverId,
                    documentType: 'INSURANCE',
                    documentNumber: insuranceNumber,
                    documentUrl: aadharUrl, // Note: Insurance doc uses a different URL in production
                    expiryDate: new Date(insuranceExpiry),
                    uploadDate: new Date(),
                    isVerified: false
                }
            });

            // 5. Create Aadhar document record
            const aadharDoc = await tx.driverDocument.create({
                data: {
                    driverId,
                    documentType: 'AADHAR',
                    documentNumber: aadharNumber,
                    documentUrl: aadharUrl,
                    uploadDate: new Date(),
                    isVerified: false
                }
            });

            // 6. Create PAN document record (if needed)
            const panDoc = await tx.driverDocument.create({
                data: {
                    driverId,
                    documentType: 'PAN',
                    documentNumber: panNumber,
                    documentUrl: aadharUrl, // Typically PAN and Aadhar might share or have separate uploads
                    uploadDate: new Date(),
                    isVerified: false
                }
            });

            return {
                driverDetails,
                documents: {
                    drivingLicense: drivingLicenseDoc,
                    rc: rcDoc,
                    insurance: insuranceDoc,
                    aadhar: aadharDoc,
                    pan: panDoc
                }
            };
        });

        console.log('All driver documents submitted successfully:', {
            driverId,
            documentCount: 5
        });

        return res.status(201).json({
            status: 'success',
            message: 'All documents submitted successfully and are under review',
            data: {
                driverDetailsId: result.driverDetails.id,
                documents: {
                    drivingLicense: {
                        id: result.documents.drivingLicense.id,
                        documentType: result.documents.drivingLicense.documentType,
                        expiryDate: result.documents.drivingLicense.expiryDate
                    },
                    rc: {
                        id: result.documents.rc.id,
                        documentType: result.documents.rc.documentType,
                        expiryDate: result.documents.rc.expiryDate
                    },
                    insurance: {
                        id: result.documents.insurance.id,
                        documentType: result.documents.insurance.documentType,
                        expiryDate: result.documents.insurance.expiryDate
                    },
                    aadhar: {
                        id: result.documents.aadhar.id,
                        documentType: result.documents.aadhar.documentType
                    },
                    pan: {
                        id: result.documents.pan.id,
                        documentType: result.documents.pan.documentType
                    }
                },
                verificationStatus: 'PENDING',
                message: 'Your documents are under review. You will be notified once verified.'
            }
        });

    } catch (error) {
        console.error('Error submitting driver documents:', error);

        if (error instanceof z.ZodError) {
            return next(new AppError(
                `Validation error: ${error.errors.map(e => e.message).join(', ')}`,
                400
            ));
        }

        return next(new AppError(
            `Error submitting documents: ${error instanceof Error ? error.message : 'Unknown error'}`,
            500
        ));
    }
};

/**
 * Get document upload status for driver
 * GET /api/driver/documents/status
 */
export const getDocumentStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const driverId = req.driver?.id;

        if (!driverId) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized'
            });
        }

        // Get all documents for this driver
        const documents = await prisma.driverDocument.findMany({
            where: { driverId },
            select: {
                id: true,
                documentType: true,
                documentNumber: true,
                expiryDate: true,
                isVerified: true,
                verificationNotes: true,
                uploadDate: true,
                verifiedDate: true
            },
            orderBy: {
                uploadDate: 'desc'
            }
        });

        // Get driver details
        const driverDetails = await prisma.driverDetails.findUnique({
            where: { driverId },
            select: {
                licenseNumber: true,
                isVerified: true,
                bankDetails: true
            }
        });

        // Check which required documents are uploaded
        const requiredDocTypes = ['DRIVING_LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE', 'AADHAR', 'PAN'];
        const uploadedDocTypes = documents.map(doc => doc.documentType);
        const missingDocTypes = requiredDocTypes.filter(type => !uploadedDocTypes.includes(type));

        const allDocsUploaded = missingDocTypes.length === 0;
        const allDocsVerified = allDocsUploaded && documents.every(doc => doc.isVerified);

        return res.status(200).json({
            status: 'success',
            data: {
                documents,
                driverDetails: {
                    licenseNumber: driverDetails?.licenseNumber,
                    isVerified: driverDetails?.isVerified || false,
                    hasAadhar: !!(driverDetails?.bankDetails as any)?.aadharNumber,
                    hasPAN: !!(driverDetails?.bankDetails as any)?.panNumber
                },
                summary: {
                    totalDocuments: documents.length,
                    verifiedDocuments: documents.filter(d => d.isVerified).length,
                    pendingDocuments: documents.filter(d => !d.isVerified).length,
                    missingDocuments: missingDocTypes,
                    allDocumentsUploaded: allDocsUploaded,
                    allDocumentsVerified: allDocsVerified,
                    overallStatus: allDocsVerified ? 'VERIFIED' : allDocsUploaded ? 'UNDER_REVIEW' : 'INCOMPLETE'
                }
            }
        });

    } catch (error) {
        console.error('Error getting document status:', error);
        return next(new AppError(
            `Error retrieving document status: ${error instanceof Error ? error.message : 'Unknown error'}`,
            500
        ));
    }
};

/**
 * Request presigned URLs for all 3 document images
 * POST /api/driver/documents/request-upload-urls
 */
export const requestDocumentUploadUrls = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        const driverId = req.driver?.id;

        if (!driverId) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized'
            });
        }

        const { generatePresignedUploadUrl } = await import('../../utils/s3Upload');

        // Define the 3 documents we need URLs for
        const documentsToUpload = [
            { name: 'aadhar', type: 'AADHAR', folder: 'driver-documents' },
            { name: 'drivingLicense', type: 'DRIVING_LICENSE', folder: 'driver-documents' },
            { name: 'rc', type: 'VEHICLE_REGISTRATION', folder: 'driver-documents' }
        ];

        const uploadUrls = [];

        for (const doc of documentsToUpload) {
            const { filename, contentType } = req.body[doc.name] || {};

            if (!filename || !contentType) {
                return next(new AppError(
                    `Missing ${doc.name} file information (filename and contentType required)`,
                    400
                ));
            }

            // Validate content type
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
            if (!allowedTypes.includes(contentType)) {
                return next(new AppError(
                    `Invalid content type for ${doc.name}. Allowed: ${allowedTypes.join(', ')}`,
                    400
                ));
            }

            const uploadData = await generatePresignedUploadUrl(
                doc.folder,
                filename,
                contentType,
                600 // 10 minutes expiration for mobile uploads
            );

            uploadUrls.push({
                documentName: doc.name,
                documentType: doc.type,
                uploadUrl: uploadData.url,
                key: uploadData.key,
                bucket: uploadData.bucket,
                region: uploadData.region
            });
        }

        return res.status(200).json({
            status: 'success',
            data: {
                uploadUrls,
                expiresIn: 600,
                instructions: {
                    step1: 'Upload each file to its respective uploadUrl using PUT method',
                    step2: 'Set Content-Type header to match the file type',
                    step3: 'After all uploads complete, call /api/driver/documents/submit-all with all metadata and S3 keys'
                }
            }
        });

    } catch (error) {
        console.error('Error generating upload URLs:', error);
        return next(new AppError(
            `Error generating upload URLs: ${error instanceof Error ? error.message : 'Unknown error'}`,
            500
        ));
    }
};

