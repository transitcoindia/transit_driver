import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../prismaClient';
import AppError from '../../utils/AppError';
import { generatePresignedUploadUrl, extractS3KeyFromUrl } from '../../utils/s3Upload';
import { z } from 'zod';

// Validation schema for presigned URL request
const presignedUrlRequestSchema = z.object({
    filename: z.string().min(1, 'Filename is required'),
    contentType: z.string().min(1, 'Content type is required'),
    folder: z.enum([
        'driver-documents',
        'vehicle-images/cover',
        'vehicle-images/exterior',
        'vehicle-images/interior',
        'profile-images'
    ], { errorMap: () => ({ message: 'Invalid folder type' }) }),
    documentType: z.enum([
        'DRIVING_LICENSE',
        'VEHICLE_REGISTRATION',
        'INSURANCE',
        'AADHAR',
        'PAN',
        'VEHICLE_IMAGE',
        'PROFILE_IMAGE'
    ]).optional()
});

// Validation schema for confirming upload
const confirmUploadSchema = z.object({
    key: z.string().min(1, 'S3 key is required'),
    documentType: z.enum([
        'DRIVING_LICENSE',
        'VEHICLE_REGISTRATION',
        'INSURANCE',
        'AADHAR',
        'PAN'
    ]).optional(),
    documentNumber: z.string().optional(),
    expiryDate: z.string().optional(),
    vehicleImageType: z.enum(['cover', 'exterior', 'interior']).optional()
});

// Allowed MIME types for documents
const ALLOWED_DOCUMENT_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/pdf'
];

// Allowed MIME types for images only
const ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png'
];

/**
 * Generate presigned URL for client-side upload
 * POST /api/driver/upload-url
 */
export const generateUploadUrl = async (
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
        const validatedData = presignedUrlRequestSchema.parse(req.body);
        const { filename, contentType, folder, documentType } = validatedData;

        // Validate content type based on folder
        if (folder === 'driver-documents') {
            if (!ALLOWED_DOCUMENT_TYPES.includes(contentType)) {
                return next(new AppError(
                    `Invalid content type. Allowed types: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`,
                    400
                ));
            }
        } else {
            if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
                return next(new AppError(
                    `Invalid content type for images. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`,
                    400
                ));
            }
        }

        // Additional validation for document types
        if (folder === 'driver-documents' && !documentType) {
            return next(new AppError('Document type is required for document uploads', 400));
        }

        // Generate presigned URL (valid for 5 minutes)
        const uploadData = await generatePresignedUploadUrl(
            folder,
            filename,
            contentType,
            300 // 5 minutes expiration
        );

        console.log('Generated presigned URL:', {
            driverId,
            folder,
            filename,
            contentType,
            key: uploadData.key
        });

        return res.status(200).json({
            status: 'success',
            data: {
                uploadUrl: uploadData.url,
                key: uploadData.key,
                bucket: uploadData.bucket,
                region: uploadData.region,
                expiresIn: 300,
                instructions: {
                    method: 'PUT',
                    headers: {
                        'Content-Type': contentType
                    },
                    note: 'Upload the file directly to the uploadUrl using PUT method. After successful upload, call /confirm-upload endpoint.'
                }
            }
        });

    } catch (error) {
        console.error('Error generating upload URL:', error);
        
        if (error instanceof z.ZodError) {
            return next(new AppError(
                `Validation error: ${error.errors.map(e => e.message).join(', ')}`,
                400
            ));
        }

        return next(new AppError(
            `Error generating upload URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
            500
        ));
    }
};

/**
 * Confirm successful upload and save document metadata to database
 * POST /api/driver/confirm-upload
 */
export const confirmUpload = async (
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
        const validatedData = confirmUploadSchema.parse(req.body);
        const { key, documentType, documentNumber, expiryDate, vehicleImageType } = validatedData;

        // Build the S3 URL
        const region = process.env.AWS_REGION || 'ap-south-1';
        const bucketName = process.env.AWS_S3_BUCKET_NAME || 'transit-driver-documents';
        const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

        console.log('Confirming upload:', {
            driverId,
            key,
            documentType,
            s3Url
        });

        // Handle document uploads
        if (documentType && ['DRIVING_LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE', 'AADHAR', 'PAN'].includes(documentType)) {
            
            // Validate document-specific fields
            if (documentType === 'DRIVING_LICENSE' && !documentNumber) {
                return next(new AppError('Document number is required for driving license', 400));
            }
            
            if (documentType === 'VEHICLE_REGISTRATION' && !documentNumber) {
                return next(new AppError('RC number is required for vehicle registration', 400));
            }

            // Validate expiry date if provided
            if (expiryDate) {
                const date = new Date(expiryDate);
                if (isNaN(date.getTime()) || date <= new Date()) {
                    return next(new AppError('Expiry date must be in the future', 400));
                }
            }

            // Create document record
            const document = await prisma.driverDocument.create({
                data: {
                    driverId,
                    documentType,
                    documentNumber: documentNumber || undefined,
                    documentUrl: s3Url,
                    expiryDate: expiryDate ? new Date(expiryDate) : undefined,
                    uploadDate: new Date()
                }
            });

            // Update government IDs if applicable
            if (documentType === 'AADHAR' || documentType === 'PAN') {
                const existingDetails = await prisma.driverDetails.findUnique({
                    where: { driverId },
                    select: { bankDetails: true }
                });

                const currentBankDetails = (existingDetails?.bankDetails || {}) as Record<string, any>;

                await prisma.driverDetails.upsert({
                    where: { driverId },
                    update: {
                        bankDetails: {
                            ...currentBankDetails,
                            [documentType === 'AADHAR' ? 'aadharNumber' : 'panNumber']: documentNumber
                        }
                    },
                    create: {
                        driverId,
                        isVerified: false,
                        licenseNumber: '',
                        bankDetails: {
                            [documentType === 'AADHAR' ? 'aadharNumber' : 'panNumber']: documentNumber
                        }
                    }
                });
            }

            // Check if all required documents are uploaded
            const allDocsUploaded = await checkRequiredDocuments(driverId);

            return res.status(200).json({
                status: 'success',
                message: 'Document uploaded successfully',
                data: {
                    documentId: document.id,
                    documentType: document.documentType,
                    documentUrl: s3Url,
                    s3Key: key,
                    allRequiredDocumentsUploaded: allDocsUploaded,
                    verificationStatus: allDocsUploaded ? 'UNDER_REVIEW' : 'PENDING'
                }
            });
        }

        // Handle vehicle image uploads
        if (vehicleImageType) {
            const vehicle = await prisma.vehicle.findUnique({
                where: { driverId },
                select: { id: true, vehicleImages: true }
            });

            if (!vehicle) {
                return next(new AppError('Please submit vehicle information first', 400));
            }

            // Get existing images
            const existingImages = (vehicle.vehicleImages || {
                cover: [],
                exterior: [],
                interior: []
            }) as { cover: string[]; exterior: string[]; interior: string[] };

            // Add new image to appropriate array
            const updatedImages = { ...existingImages };
            if (vehicleImageType === 'cover') {
                updatedImages.cover = [s3Url]; // Replace cover image
            } else if (vehicleImageType === 'exterior') {
                updatedImages.exterior = [...existingImages.exterior, s3Url];
            } else if (vehicleImageType === 'interior') {
                updatedImages.interior = [...existingImages.interior, s3Url];
            }

            // Update vehicle with new images
            await prisma.vehicle.update({
                where: { id: vehicle.id },
                data: { vehicleImages: updatedImages }
            });

            return res.status(200).json({
                status: 'success',
                message: 'Vehicle image uploaded successfully',
                data: {
                    vehicleId: vehicle.id,
                    imageType: vehicleImageType,
                    imageUrl: s3Url,
                    s3Key: key,
                    allImages: updatedImages
                }
            });
        }

        // Handle profile image uploads
        if (key.startsWith('profile-images/')) {
            // Profile image is stored in DriverDetails, not Driver
            await prisma.driverDetails.upsert({
                where: { driverId },
                update: {
                    profileImage: s3Url
                },
                create: {
                    driverId,
                    licenseNumber: '', // Will be updated later when submitting documents
                    profileImage: s3Url,
                    isVerified: false
                }
            });

            return res.status(200).json({
                status: 'success',
                message: 'Profile image uploaded successfully',
                data: {
                    profileImageUrl: s3Url,
                    s3Key: key
                }
            });
        }

        // Generic success response
        return res.status(200).json({
            status: 'success',
            message: 'Upload confirmed successfully',
            data: {
                url: s3Url,
                s3Key: key
            }
        });

    } catch (error) {
        console.error('Error confirming upload:', error);
        
        if (error instanceof z.ZodError) {
            return next(new AppError(
                `Validation error: ${error.errors.map(e => e.message).join(', ')}`,
                400
            ));
        }

        return next(new AppError(
            `Error confirming upload: ${error instanceof Error ? error.message : 'Unknown error'}`,
            500
        ));
    }
};

/**
 * Helper function to check if all required documents are uploaded
 */
async function checkRequiredDocuments(driverId: string): Promise<boolean> {
    try {
        const allDocuments = await prisma.driverDocument.findMany({
            where: { driverId },
            select: { documentType: true }
        });

        const requiredDocTypes = ['DRIVING_LICENSE', 'VEHICLE_REGISTRATION', 'INSURANCE'];
        const uploadedDocTypes = allDocuments.map(doc => doc.documentType);

        const allDocumentTypesUploaded = requiredDocTypes.every(docType => 
            uploadedDocTypes.includes(docType)
        );

        // Check for government ID
        const driver = await prisma.driver.findUnique({
            where: { id: driverId },
            select: {
                driverDetails: {
                    select: { bankDetails: true }
                }
            }
        });

        const bankDetails = driver?.driverDetails?.bankDetails as { 
            aadharNumber?: string; 
            panNumber?: string 
        } | null;
        
        const hasGovernmentId = Boolean(bankDetails?.aadharNumber || bankDetails?.panNumber);

        return allDocumentTypesUploaded && hasGovernmentId;
    } catch (error) {
        console.error('Error checking required documents:', error);
        return false;
    }
}

/**
 * Batch generate presigned URLs for multiple files
 * POST /api/driver/batch-upload-urls
 */
export const generateBatchUploadUrls = async (
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

        const { files } = req.body;

        if (!Array.isArray(files) || files.length === 0) {
            return next(new AppError('Files array is required', 400));
        }

        if (files.length > 10) {
            return next(new AppError('Maximum 10 files can be uploaded at once', 400));
        }

        const uploadUrls = [];

        for (const fileRequest of files) {
            try {
                const validatedData = presignedUrlRequestSchema.parse(fileRequest);
                const { filename, contentType, folder } = validatedData;

                const uploadData = await generatePresignedUploadUrl(
                    folder,
                    filename,
                    contentType,
                    300
                );

                uploadUrls.push({
                    filename,
                    uploadUrl: uploadData.url,
                    key: uploadData.key,
                    bucket: uploadData.bucket,
                    region: uploadData.region,
                    documentType: fileRequest.documentType
                });
            } catch (error) {
                console.error('Error generating URL for file:', fileRequest.filename, error);
                uploadUrls.push({
                    filename: fileRequest.filename,
                    error: error instanceof Error ? error.message : 'Failed to generate URL'
                });
            }
        }

        return res.status(200).json({
            status: 'success',
            data: {
                uploads: uploadUrls,
                expiresIn: 300,
                instructions: {
                    method: 'PUT',
                    note: 'Upload each file to its respective uploadUrl using PUT method with Content-Type header. After all uploads complete, call /batch-confirm-uploads endpoint.'
                }
            }
        });

    } catch (error) {
        console.error('Error generating batch upload URLs:', error);
        return next(new AppError(
            `Error generating batch upload URLs: ${error instanceof Error ? error.message : 'Unknown error'}`,
            500
        ));
    }
};

/**
 * Batch confirm uploads
 * POST /api/driver/batch-confirm-uploads
 */
export const batchConfirmUploads = async (
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

        const { uploads } = req.body;

        if (!Array.isArray(uploads) || uploads.length === 0) {
            return next(new AppError('Uploads array is required', 400));
        }

        const results = [];

        for (const upload of uploads) {
            try {
                const validatedData = confirmUploadSchema.parse(upload);
                
                // Simulate confirmation logic (call actual confirmUpload logic here)
                const region = process.env.AWS_REGION || 'ap-south-1';
                const bucketName = process.env.AWS_S3_BUCKET_NAME || 'transit-driver-documents';
                const s3Url = `https://${bucketName}.s3.${region}.amazonaws.com/${validatedData.key}`;

                results.push({
                    key: validatedData.key,
                    status: 'success',
                    url: s3Url
                });
            } catch (error) {
                results.push({
                    key: upload.key,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Failed to confirm upload'
                });
            }
        }

        return res.status(200).json({
            status: 'success',
            message: 'Batch uploads processed',
            data: { results }
        });

    } catch (error) {
        console.error('Error confirming batch uploads:', error);
        return next(new AppError(
            `Error confirming batch uploads: ${error instanceof Error ? error.message : 'Unknown error'}`,
            500
        ));
    }
};

