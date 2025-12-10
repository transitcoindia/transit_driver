import express,{RequestHandler, ErrorRequestHandler} from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { 
    register, 
    verifyDriverEmail, 
    loginWithEmail,  
    loginWithPhoneNumber,
    verifyPhoneOTP,
    verifyRegistrationOTP,
    getUserDetails,
    googleAuth,
    sendResetEmailController,
    resetPassword,
    getProfileCompletion,
    uploadProfileImage
} from '../controllers/auth_controllers/authControllers';
import  { submitVehicleInfo, uploadDocuments, uploadVehicleImages } from '../controllers/driver_detailes_controller/driverController'
import { authenticate } from '../middleware/authMiddle';
import { s2LocationIngest, s2LocationIngestPublic } from './locationIngest';
import { limiter } from '../middleware/rateLimiter';
import { NextFunction, Request, Response } from 'express';
import { storeDriverRideDetails, startRideWithCode, endRide } from '../controllers/driver_detailes_controller/driverRides_Controller';
import { activateSubscription } from '../controllers/driver_status/driverStatusController';
import { 
    generateUploadUrl, 
    confirmUpload, 
    generateBatchUploadUrls, 
    batchConfirmUploads 
} from '../controllers/driver_detailes_controller/s3UploadController';
import {
    submitAllDocuments,
    getDocumentStatus,
    requestDocumentUploadUrls,
    uploadDocumentsDirect
} from '../controllers/driver_detailes_controller/driverDocumentsController';
// import { documentUpload, uploadLimiter} from '../middleware/uploadMiddleware';


const uploadsDir = path.join(process.cwd(), 'uploads');
const tempUploadsDir = path.join(uploadsDir, 'temp');
const profileImagesDir = path.join(uploadsDir, 'profile-images');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });;
}

if (!fs.existsSync(tempUploadsDir)) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

if (!fs.existsSync(profileImagesDir)) {
    fs.mkdirSync(profileImagesDir, { recursive: true });
}

// Configure multer for temporary local storage before S3 upload
const storage = multer.diskStorage({
    destination: (req: Request, file: any, cb: (error: Error | null, filename: string) => void) => {
        console.log('Multer destination called for file:', {
            originalname: file.originalname,
            fieldname: file.fieldname,
            mimetype: file.mimetype
        });
        // Ensure directories exist
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        if (!fs.existsSync(tempUploadsDir)) {
            fs.mkdirSync(tempUploadsDir, { recursive: true });
        }
        cb(null, tempUploadsDir);
    },
    filename: (req: Request, file: any, cb: (error: Error | null, filename: string) => void) => {
        console.log('Multer filename called for file:', {
            originalname: file.originalname,
            fieldname: file.fieldname,
            mimetype: file.mimetype
        });
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, `document-${uniqueSuffix}${ext}`);
    }
});

// Configure upload middleware to handle multiple documents
const documentUpload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file size limit
        files: 5 // Maximum 5 files
    },
    fileFilter: (req: Request, file: any, cb: multer.FileFilterCallback) => {
        console.log('Multer fileFilter called for file:', {
            originalname: file.originalname,
            fieldname: file.fieldname,
            mimetype: file.mimetype
        });
        // Allow only images and PDFs
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only images and PDF documents are allowed'));
        }
    }
}).array('documents', 5);

// Error handling middleware for multer
const handleMulterError = ((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Multer error details:', {
        error: err,
        errorName: err.name,
        errorMessage: err.message,
        errorCode: err.code,
        requestHeaders: req.headers,
        requestBody: req.body,
        requestFiles: req.files
    });

    if (err instanceof multer.MulterError) {
        console.error('Multer error:', err);
        return res.status(400).json({
            status: 'error',
            message: `Upload error: ${err.message}`
        });
    } else if (err) {
        console.error('Other error:', err);
        return res.status(500).json({
            status: 'error',
            message: err.message
        });
    }
    next();
}) as ErrorRequestHandler;

// Configure multer for profile image upload (single file)
const profileImageUpload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB file size limit
        files: 1 // Only 1 file
    },
    fileFilter: (req: Request, file: any, cb: multer.FileFilterCallback) => {
        console.log('Profile image upload - fileFilter:', {
            originalname: file.originalname,
            fieldname: file.fieldname,
            mimetype: file.mimetype
        });
        // Allow only images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for profile pictures'));
        }
    }
}).single('profileImage'); // Single field named 'profileImage'

// Configure multer for vehicle images (multiple fields)
const vehicleImagesUpload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB per file
        files: 11 // Maximum 11 files total (1 cover + 5 exterior + 5 interior)
    },
    fileFilter: (req: Request, file: any, cb: multer.FileFilterCallback) => {
        console.log('Vehicle images upload - fileFilter:', {
            originalname: file.originalname,
            fieldname: file.fieldname,
            mimetype: file.mimetype
        });
        // Allow only images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for vehicle images'));
        }
    }
}).fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'exteriorImages', maxCount: 5 },
    { name: 'interiorImages', maxCount: 5 }
]);

const router = express.Router();

// Registration routes
router.post('/register', register as RequestHandler);
router.post('/verify-registration-otp', verifyRegistrationOTP as RequestHandler);
router.get('/verify-email', verifyDriverEmail);

// Login routes
router.post('/login/email', loginWithEmail as RequestHandler);
router.post('/login/phoneNumber', loginWithPhoneNumber as RequestHandler);
router.post('/login/verify-otp', verifyPhoneOTP as RequestHandler);

// OAuth routes
router.post('/auth/google', (googleAuth as unknown) as RequestHandler);

// Driver rides routes
router.post('/rides_accepted', authenticate as RequestHandler, storeDriverRideDetails as any);
router.post('/start_ride', authenticate as RequestHandler, startRideWithCode as any);
router.post('/end_ride', authenticate as RequestHandler, endRide as any);

// Protected routes
router.get('/profile', authenticate as RequestHandler, getUserDetails as RequestHandler);
router.get('/profile/completion', authenticate as RequestHandler, getProfileCompletion as RequestHandler);
router.post(
    '/profile/image',
    (authenticate as unknown) as RequestHandler,
    profileImageUpload,
    handleMulterError,
    (uploadProfileImage as unknown) as RequestHandler
);

// Password reset routes
router.post('/password-reset/request-otp', sendResetEmailController as RequestHandler);
router.post('/password-reset/verify-otp', resetPassword as RequestHandler);

// Protected routes for driver documents
router.post('/documents/vehicleInfo', authenticate as RequestHandler, submitVehicleInfo as RequestHandler);
router.post(
    '/documents/upload',
    (authenticate as unknown) as RequestHandler,
    limiter,
    documentUpload,
    handleMulterError,
    (uploadDocuments as unknown) as RequestHandler
);

// Vehicle images upload route
router.post(
    '/documents/vehicleImages',
    (authenticate as unknown) as RequestHandler,
    limiter,
    vehicleImagesUpload,
    handleMulterError,
    (uploadVehicleImages as unknown) as RequestHandler
);

router.post(
    '/subscription/activate',
    authenticate as RequestHandler,
    activateSubscription as any
);

// S3 Presigned URL Upload Routes (New Flow)
// Client requests presigned URL, uploads directly to S3, then confirms
router.post(
    '/upload-url',
    (authenticate as unknown) as RequestHandler,
    limiter,
    (generateUploadUrl as unknown) as RequestHandler
);

router.post(
    '/confirm-upload',
    (authenticate as unknown) as RequestHandler,
    (confirmUpload as unknown) as RequestHandler
);

// Batch upload endpoints for multiple files
router.post(
    '/batch-upload-urls',
    (authenticate as unknown) as RequestHandler,
    limiter,
    (generateBatchUploadUrls as unknown) as RequestHandler
);

router.post(
    '/batch-confirm-uploads',
    (authenticate as unknown) as RequestHandler,
    (batchConfirmUploads as unknown) as RequestHandler
);

// Flutter Driver Documents Screen API Endpoints
// These endpoints handle the complete driver documents submission from mobile app

// Configure multer for direct S3 uploads (uses memory storage for buffer upload)
const documentFilesUploadDirect = multer({
    storage: multer.memoryStorage(), // Use memory storage for direct S3 upload
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file size limit
    },
    fileFilter: (req: Request, file: any, cb: multer.FileFilterCallback) => {
        // Allow only images and PDFs
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type. Only ${allowedMimeTypes.join(', ')} are allowed.`));
        }
    }
}).fields([
    { name: 'aadhar', maxCount: 1 },
    { name: 'drivingLicense', maxCount: 1 },
    { name: 'rc', maxCount: 1 }
]);

// Configure multer for presigned URL requests (uses memory storage since we're just getting metadata)
const documentFilesUpload = multer({
    storage: multer.memoryStorage(), // Use memory storage since we're just getting metadata
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file size limit
    },
    fileFilter: (req: Request, file: any, cb: multer.FileFilterCallback) => {
        // Allow only images and PDFs
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type. Only ${allowedMimeTypes.join(', ')} are allowed.`));
        }
    }
}).fields([
    { name: 'aadhar', maxCount: 1 },
    { name: 'drivingLicense', maxCount: 1 },
    { name: 'rc', maxCount: 1 }
]);

// Middleware to conditionally apply multer only for multipart/form-data
const conditionalMulter: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
        // Apply multer middleware for multipart/form-data requests
        const multerMiddleware = documentFilesUpload as any;
        return multerMiddleware(req, res, next);
    }
    // Skip multer for JSON requests
    next();
};

// Direct upload endpoint - automatically uploads files to S3
router.post(
    '/documents/upload-direct',
    (authenticate as unknown) as RequestHandler,
    limiter,
    documentFilesUploadDirect,
    handleMulterError,
    (uploadDocumentsDirect as unknown) as RequestHandler
);

router.post(
    '/documents/request-upload-urls',
    (authenticate as unknown) as RequestHandler,
    limiter,
    conditionalMulter, // Conditionally handle multipart/form-data
    (requestDocumentUploadUrls as unknown) as RequestHandler
);

router.post(
    '/documents/submit-all',
    (authenticate as unknown) as RequestHandler,
    (submitAllDocuments as unknown) as RequestHandler
);

router.get(
    '/documents/status',
    (authenticate as unknown) as RequestHandler,
    (getDocumentStatus as unknown) as RequestHandler
);

export default router;