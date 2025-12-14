import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../prismaClient';
import AppError from '../../utils/AppError';
import { z } from 'zod';

/**
 * Driver Documents Upload Controller
 * Handles the Flutter driver documents screen API endpoints
 */

// Type definition for upload results
interface UploadResult {
    documentName: string;
    documentType: string;
    documentId: string;
    filename: string;
    contentType: string;
    size: number;
    base64Length: number;
    saved: boolean;
}

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
 * Upload documents directly to Supabase database (base64 format)
 * POST /api/driver/documents/upload-direct
 * 
 * Accepts multipart/form-data with files and saves them as base64 in Supabase database
 * Uses Prisma to directly connect to the database
 */
export const uploadDocumentsDirect = async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    try {
        console.log('📤 uploadDocumentsDirect called:', {
            contentType: req.headers['content-type'],
            hasFiles: !!req.files,
            filesKeys: req.files ? Object.keys(req.files) : [],
            driverId: req.driver?.id
        });

        const driverId = req.driver?.id;

        if (!driverId) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized'
            });
        }

        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;

        if (!files || Object.keys(files).length === 0) {
            console.error('❌ No files in request:', {
                files: req.files,
                contentType: req.headers['content-type'],
                body: req.body
            });
            return next(new AppError(
                'No files provided. Please upload files via multipart/form-data with fields: aadhar, drivingLicense, rc',
                400
            ));
        }

        // Log file details
        console.log('📁 Files received:', Object.keys(files).map(key => ({
            field: key,
            count: files[key]?.length || 0,
            files: files[key]?.map(f => ({
                originalname: f.originalname,
                mimetype: f.mimetype,
                size: f.size,
                hasBuffer: !!f.buffer,
                bufferSize: f.buffer?.length || 0
            }))
        })));

        // Define the 3 documents we need
        const documentsToUpload = [
            { name: 'aadhar', type: 'AADHAR' },
            { name: 'drivingLicense', type: 'DRIVING_LICENSE' },
            { name: 'rc', type: 'VEHICLE_REGISTRATION' }
        ];

        const uploadResults: UploadResult[] = [];

        // Process all documents in a transaction
        const result = await prisma.$transaction(async (tx) => {
            for (const doc of documentsToUpload) {
                const fileArray = files?.[doc.name];
                if (!fileArray || fileArray.length === 0) {
                    throw new AppError(
                        `Missing ${doc.name} file. Please upload the file via form-data.`,
                        400
                    );
                }

                const file = fileArray[0];

                // Validate content type
                const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
                if (!allowedTypes.includes(file.mimetype)) {
                    throw new AppError(
                        `Invalid file type for ${doc.name}. Received: ${file.mimetype}. Allowed: ${allowedTypes.join(', ')}`,
                        400
                    );
                }

                // Validate file buffer exists
                if (!file.buffer) {
                    throw new AppError(
                        `File buffer is missing for ${doc.name}. Make sure multer is configured with memoryStorage().`,
                        400
                    );
                }

                // Convert buffer to base64
                const base64Data = file.buffer.toString('base64');
                const base64String = `data:${file.mimetype};base64,${base64Data}`;

                console.log(`Converting ${doc.name} to base64:`, {
                    filename: file.originalname,
                    size: file.size,
                    base64Length: base64String.length,
                    contentType: file.mimetype
                });

                // Check if document already exists for this driver and type
                const existingDoc = await tx.driverDocument.findFirst({
                    where: {
                        driverId: driverId,
                        documentType: doc.type
                    }
                });

                let savedDocument;
                if (existingDoc) {
                    // Update existing document
                    savedDocument = await tx.driverDocument.update({
                        where: { id: existingDoc.id },
                        data: {
                            documentUrl: base64String,
                            uploadDate: new Date(),
                            isVerified: false, // Reset verification status on update
                            verifiedDate: null,
                            verificationNotes: null
                        }
                    });
                } else {
                    // Create new document
                    savedDocument = await tx.driverDocument.create({
                        data: {
                            driverId: driverId,
                            documentType: doc.type,
                            documentUrl: base64String,
                            uploadDate: new Date(),
                            isVerified: false
                        }
                    });
                }

                uploadResults.push({
                    documentName: doc.name,
                    documentType: doc.type,
                    documentId: savedDocument.id,
                    filename: file.originalname,
                    contentType: file.mimetype,
                    size: file.size,
                    base64Length: base64String.length,
                    saved: true
                });
            }

            return uploadResults;
        });

        console.log('All documents saved to Supabase database successfully:', {
            driverId,
            documentCount: result.length
        });

        return res.status(200).json({
            status: 'success',
            message: 'All documents saved to database successfully in base64 format',
            data: {
                uploads: result,
                message: 'Documents are stored in base64 format in Supabase database'
            }
        });

    } catch (error) {
        console.error('Error saving documents to database:', error);
        
        // Log detailed error information
        const errorDetails = {
            error: error,
            errorName: error?.constructor?.name,
            errorMessage: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            driverId: req.driver?.id,
            filesReceived: req.files ? Object.keys(req.files).length : 0
        };
        console.error('Full error details:', errorDetails);

        // Provide more specific error messages
        let errorMessage = 'Error saving documents to database';
        if (error instanceof Error) {
            if (error.message.includes('buffer')) {
                errorMessage = 'File upload error: File buffer is missing. Please ensure files are sent correctly.';
            } else if (error.message.includes('Prisma') || error.message.includes('database')) {
                errorMessage = `Database Error: ${error.message}`;
            } else {
                errorMessage = `Upload Error: ${error.message}`;
            }
        }

        return next(new AppError(errorMessage, 500));
    }
};

/**
 * Request presigned URLs for all 3 document images
 * POST /api/driver/documents/request-upload-urls
 * 
 * Supports two formats:
 * 1. JSON body with file metadata: { "aadhar": {"filename": "...", "contentType": "..."}, ... }
 * 2. Multipart/form-data with actual files: form fields named "aadhar", "drivingLicense", "rc"
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
        const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
        const isFormData = files && Object.keys(files).length > 0;

        for (const doc of documentsToUpload) {
            let filename: string;
            let contentType: string;

            if (isFormData) {
                // Handle multipart/form-data with actual files
                const fileArray = files?.[doc.name];
                if (!fileArray || fileArray.length === 0) {
                    return next(new AppError(
                        `Missing ${doc.name} file. Please upload the file via form-data.`,
                        400
                    ));
                }

                const file = fileArray[0];
                filename = file.originalname || `${doc.name}-${Date.now()}`;
                contentType = file.mimetype;

                // Validate content type
                const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
                if (!allowedTypes.includes(contentType)) {
                    return next(new AppError(
                        `Invalid file type for ${doc.name}. Received: ${contentType}. Allowed: ${allowedTypes.join(', ')}`,
                        400
                    ));
                }
            } else {
                // Handle JSON body with metadata
                const metadata = req.body[doc.name];
                if (!metadata || typeof metadata !== 'object') {
                    return next(new AppError(
                        `Missing ${doc.name} file information. Provide either: 1) JSON body with {"${doc.name}": {"filename": "...", "contentType": "..."}}, or 2) multipart/form-data with file field named "${doc.name}"`,
                        400
                    ));
                }

                filename = metadata.filename;
                contentType = metadata.contentType;

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
            }

            // Generate presigned URL with longer expiration for mobile uploads
            // Increased to 15 minutes (900 seconds) to account for network delays and retries
            const uploadData = await generatePresignedUploadUrl(
                doc.folder,
                filename,
                contentType,
                900 // 15 minutes expiration for mobile uploads (was 10 minutes)
            );

            uploadUrls.push({
                documentName: doc.name,
                documentType: doc.type,
                uploadUrl: uploadData.url,
                key: uploadData.key,
                bucket: uploadData.bucket,
                region: uploadData.region,
                filename,
                contentType
            });
        }

        return res.status(200).json({
            status: 'success',
            data: {
                uploadUrls,
                expiresIn: 600,
                requestFormat: isFormData ? 'multipart/form-data' : 'json',
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

