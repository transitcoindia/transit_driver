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
    resetPassword
} from '../controllers/auth_controllers/authControllers';
import  { submitVehicleInfo, uploadDocuments } from '../controllers/driver_detailes_controller/driverController'
import { authenticate } from '../middleware/authMiddle';
import { limiter } from '../middleware/rateLimiter';
import { NextFunction, Request, Response } from 'express';
import { storeDriverRideDetails, startRideWithCode } from '../controllers/driver_detailes_controller/driverRides_Controller';
// import { documentUpload, uploadLimiter } from '../middleware/uploadMiddleware';


const uploadsDir = path.join(process.cwd(), 'uploads');
const tempUploadsDir = path.join(uploadsDir, 'temp');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });;
}

if (!fs.existsSync(tempUploadsDir)) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

// Configure multer for temporary local storage before S3 upload
const storage = multer.diskStorage({
    destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
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
    filename: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
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
    fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
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

// Protected routes
router.get('/profile', authenticate as RequestHandler, getUserDetails as RequestHandler);

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

export default router;