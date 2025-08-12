import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import e, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import { JwtPayload } from 'jsonwebtoken';
import { prisma } from '../../prismaClient';
import AppError from '../../utils/AppError';
import { uploadToS3 } from '../../utils/s3Upload';
import { driverDocumentSchema, driverSignupSchema, driverVehicleInfoSchema } from '../../validator/driverValidation';
import { sendDriverDocumentsNotificationEmail } from '../../utils/emailService';

export const submitVehicleInfo = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const driverId = req.driver?.id;
        
        if (!driverId) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized'
            })
        }
        
        // Validate request body against schema
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
            roofTop,
            insuranceStatus,
            insuranceExpiryDate,
            registrationExpiryDate,
            drivingExperience,
            licenseNumber
        } = validatedData;

        // First check if driver details exist
        const existingDriverDetails = await prisma.driverDetails.findUnique({
            where: { driverId }
        });

        // Create or update driver details record
        const updatedDriverDetails = await prisma.driverDetails.upsert({
            where: { driverId },
            update: {
                drivingExperience
            },
            create: {
                driverId,
                drivingExperience,
                isVerified: false,
                licenseNumber: '' // Using empty string for now
            }
        });
        
        // Check if driver already has a vehicle
        const existingVehicle = await prisma.vehicle.findUnique({
            where: { driverId }
        });

        let vehicle;
        if (existingVehicle) {
            // Update existing vehicle
            vehicle = await prisma.vehicle.update({
                where: { id: existingVehicle.id },
                data: {
                    make: brand,
                    model: model,
                    year: year,
                    licensePlate: number,
                    fuelType: fuelType,
                    seatingCapacity: seatingCapacity,
                    hasCNG: hasCNG || false,
                    hasElectric: hasElectric || false,
                    roofTop: roofTop || false,
                    insuranceStatus: insuranceStatus,
                    insuranceExpiryDate: insuranceExpiryDate ? new Date(insuranceExpiryDate) : null,
                    registrationExpiryDate: registrationExpiryDate ? new Date(registrationExpiryDate) : null,
                    isActive: true,
                    isAvailable: true,
                    isInService: true
                }
            });
        } else {
            // Create a new vehicle and assign to driver
            const vehicleCount = await prisma.vehicle.count();
            vehicle = await prisma.vehicle.create({
                data: {
                    make: brand,
                    model: model,
                    year: year,
                    licensePlate: number,
                    fuelType: fuelType,
                    seatingCapacity: seatingCapacity,
                    hasCNG: hasCNG || false,
                    hasElectric: hasElectric || false,
                    roofTop: roofTop || false,
                    insuranceStatus: insuranceStatus,
                    insuranceExpiryDate: insuranceExpiryDate ? new Date(insuranceExpiryDate) : null,
                    registrationExpiryDate: registrationExpiryDate ? new Date(registrationExpiryDate) : null,
                    driverId: driverId,
                    vehicleType: 'STANDARD', // Default vehicle type
                    color: 'UNKNOWN', // Default color
                    isActive: true,
                    isAvailable: true,
                    isInService: true
                }
            });
        }

        res.status(201).json({
            status: 'success',
            message: existingVehicle ? 'Vehicle information updated successfully' : 'Vehicle information submitted successfully',
            data: {
                vehicle,
                driverDetails: {
                    id: updatedDriverDetails.id,
                    drivingExperience: updatedDriverDetails.drivingExperience,
                    isVerified: updatedDriverDetails.isVerified,
                    approvalStatus: updatedDriverDetails.isVerified ? 'APPROVED' : 'PENDING'
                }
            }
        });
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            console.log(error);
            if (error.code === 'P2002') {
                console.log(error);
                return next(new AppError('Vehicle with this license plate already exists', 400));
            }
        }
        next(error);
    }
};

// Unified document upload
export const uploadDocuments = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const driverId = req.driver?.id;
        
        if (!driverId) {
            return res.status(401).json({
                status: 'fail',
                message: 'Unauthorized'
            });
        }

        // Debug logging for request
        console.log('Request details:', {
            body: req.body,
            files: req.files,
            headers: req.headers,
            contentType: req.headers['content-type'],
            contentLength: req.headers['content-length']
        });

        // Check if files were uploaded through Multer
        if (!req.files || !('documents' in req.files) || !Array.isArray(req.files['documents']) || req.files['documents'].length === 0) {
            console.error('File upload error:', {
                files: req.files,
                hasDocuments: req.files && 'documents' in req.files,
                isArray: req.files && 'documents' in req.files && Array.isArray(req.files['documents']),
                length: req.files && 'documents' in req.files ? req.files['documents'].length : 0,
                contentType: req.headers['content-type'],
                contentLength: req.headers['content-length']
            });
            return next(new AppError('No documents uploaded. Please upload all required documents.', 400));
        }

        const documentFiles = req.files['documents'] as Express.Multer.File[];
        console.log('Document files details:', documentFiles.map(f => ({
            originalname: f.originalname,
            path: f.path,
            size: f.size,
            mimetype: f.mimetype,
            fieldname: f.fieldname,
            buffer: f.buffer ? 'Buffer exists' : 'No buffer'
        })));

        // Check if files exist before processing
        for (const file of documentFiles) {
            if (!fs.existsSync(file.path)) {
                console.error('File not found on disk:', {
                    path: file.path,
                    originalname: file.originalname,
                    fieldname: file.fieldname
                });
                return next(new AppError(`File not found: ${file.originalname}. Upload directory may not exist.`, 500));
            }
        }

        // Parse document data
        let documentData;
        try {
            documentData = JSON.parse(req.body.documentData || '[]');
            console.log('Parsed document data:', documentData);
        } catch (error) {
            console.error('Failed to parse documentData JSON', error);
            return next(new AppError('Invalid document data format', 400));
        }

        if (!Array.isArray(documentData) || documentData.length !== documentFiles.length) {
            console.error('Document data mismatch:', {
                documentDataLength: documentData.length,
                filesLength: documentFiles.length
            });
            return next(new AppError('Document data must match the number of uploaded files', 400));
        }

        // Check for required document types
        const requiredDocTypes = ["DRIVING_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE"];
        const uploadedDocTypes = documentData.map(doc => doc.documentType);

        // Verify all required document types are included
        const missingDocTypes = requiredDocTypes.filter(type => !uploadedDocTypes.includes(type));
        if (missingDocTypes.length > 0) {
            return next(new AppError(`Missing required document types: ${missingDocTypes.join(', ')}. All three document types are required.`, 400));
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
            }>()
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
                        error: 'Document type is required'
                    });
                    continue;
                }

                // Validate document data based on type
                let documentNumber = data.documentNumber;
                let isValid = true;
                let validationError = '';

                if (data.documentType === "DRIVING_LICENSE") {
                    if (!data.driverLicenseNumber) {
                        isValid = false;
                        validationError = 'Driver license number is required';
                    }
                    documentNumber = data.driverLicenseNumber;
                } else if (data.documentType === "VEHICLE_REGISTRATION") {
                    if (!data.rcNumber) {
                        isValid = false;
                        validationError = 'RC number is required';
                    }
                    documentNumber = data.rcNumber;
                }

                // Validate expiry date if provided
                if (data.expiryDate) {
                    const date = new Date(data.expiryDate);
                    if (isNaN(date.getTime()) || date <= new Date()) {
                        isValid = false;
                        validationError = 'Expiry date must be in the future';
                    }
                }

                if (!isValid) {
                    results.errors.push({
                        file: file.originalname,
                        error: validationError
                    });
                    continue;
                }

                // Upload to S3
                const s3FileUrl = await uploadToS3(file, 'driver-documents');
                console.log('S3 upload successful', { fileName: file.originalname, s3FileUrl });

                // Create document record
                const document = await prisma.driverDocument.create({
                    data: {
                        driverId,
                        documentType: data.documentType,
                        documentNumber,
                        documentUrl: s3FileUrl,
                        expiryDate: data.expiryDate ? new Date(data.expiryDate) : undefined,
                        uploadDate: new Date()
                    },
                });

                results.success.push({
                    file: file.originalname,
                    documentId: document.id,
                    documentType: document.documentType,
                    documentUrl: s3FileUrl
                });

            } catch (error) {
                console.error('Error processing file', {
                    fileName: file.originalname,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });

                // Clean up the local file if it exists
                if (file.path && fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }

                results.errors.push({
                    file: file.originalname,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }

        // Update Government IDs if provided
        if (req.body.aadharNumber || req.body.panNumber) {
            await prisma.driverDetails.update({
                where: { driverId },
                data: {
                    bankDetails: {
                        aadharNumber: req.body.aadharNumber || undefined,
                        panNumber: req.body.panNumber || undefined,
                    }
                }
            });
        }

        // Check for all required documents after batch upload
        const allDocsUploaded = await checkRequiredDocumentsAndNotify(driverId, req.driver?.email || '');
        return res.status(200).json({
            message: 'Documents processed',
            results,
            allRequiredDocumentsUploaded: allDocsUploaded,
            status: allDocsUploaded ? 'UNDER_REVIEW' : 'PENDING'
        });
    } catch (error) {
        if (error instanceof AppError) {
            return next(error);
        }
        return next(new AppError(`Error uploading documents: ${error instanceof Error ? error.message : 'Unknown error'}`, 500));
    }
};

async function checkRequiredDocumentsAndNotify(driverId: string, userEmail: string) {
    try {
        // Get all documents for this driver
        const allDocuments = await prisma.driverDocument.findMany({
            where: { driverId }
        });

        const requiredDocTypes = ["DRIVING_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE"];
        const uploadedDocTypes = allDocuments.map(doc => doc.documentType);

        // Get driver to check if government IDs are provided
        const driver = await prisma.driver.findUnique({
            where: { id: driverId },
            select: {
                id: true,
                name: true,
                email: true,
                driverDetails: {
                    select: {
                        bankDetails: true
                    }
                }
            }
        });

        const bankDetails = driver?.driverDetails?.bankDetails as { aadharNumber?: string; panNumber?: string } | null;
        const hasGovernmentId = Boolean(bankDetails?.aadharNumber || bankDetails?.panNumber);
        const allDocumentTypesUploaded = requiredDocTypes.every(docType => uploadedDocTypes.includes(docType));
        const allRequiredDocsUploaded = allDocumentTypesUploaded && hasGovernmentId;

        if (allRequiredDocsUploaded) {
            // Update driver details status
            await prisma.driverDetails.update({
                where: { driverId },
                data: {
                    isVerified: false // Set to false initially, will be updated by admin
                }
            });

            // Get all documents with their URLs and details
            const documentDetails = await prisma.driverDocument.findMany({
                where: { driverId },
                select: {
                    documentType: true,
                    documentUrl: true,
                    documentNumber: true,
                }
            }).then(docs => docs.map(doc => ({
                documentType: doc.documentType,
                documentUrl: doc.documentUrl,
                documentNumber: doc.documentNumber || undefined
            })));

            if (driver) {
                // Send notification email to admin with approval/rejection links
                await sendDriverDocumentsNotificationEmail(
                    { id: driver.id, name: driver.name, userId: driver.id },
                    userEmail,
                    documentDetails
                );
                console.log('Admin notification email sent successfully');
            }
        }

        return allRequiredDocsUploaded;
    } catch (error) {
        console.error("Error checking required documents:", error);
        return false;
    }
}





