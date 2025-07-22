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
import { getCellId, getNeighbors, getDistance, isPointInRegion } from '../utils/s2Service';
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

// S2 cell id route
router.post('/s2/cellid', authenticate as RequestHandler, async (req: Request, res: Response) => {
  try {
    const { lat, lng, level } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      res.status(400).json({ error: 'lat and lng are required and must be numbers' });
      return;
    }
    const cellId = await getCellId(lat, lng, level);
    res.json({ cellId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cell id', details: error instanceof Error ? error.message : error });
  }
});

// S2 neighbors route
router.post('/s2/neighbors', authenticate as RequestHandler, async (req: Request, res: Response) => {
  try {
    const { cell_id, level } = req.body;
    if (!cell_id) {
      res.status(400).json({ error: 'cell_id is required' });
      return;
    }
    const neighbors = await getNeighbors(cell_id, level);
    res.json({ neighbors });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get neighbors', details: error instanceof Error ? error.message : error });
  }
});

// S2 distance route
router.post('/s2/distance', authenticate as RequestHandler, async (req: Request, res: Response) => {
  try {
    const { lat1, lng1, lat2, lng2 } = req.body;
    if (typeof lat1 !== 'number' || typeof lng1 !== 'number' || typeof lat2 !== 'number' || typeof lng2 !== 'number') {
      res.status(400).json({ error: 'lat1, lng1, lat2, lng2 are required and must be numbers' });
      return;
    }
    const distance = await getDistance(lat1, lng1, lat2, lng2);
    res.json({ distance });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get distance', details: error instanceof Error ? error.message : error });
  }
});

// S2 point-in-region route
router.post('/s2/point-in-region', authenticate as RequestHandler, async (req: Request, res: Response) => {
  try {
    const { lat, lng, region } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Array.isArray(region)) {
      res.status(400).json({ error: 'lat, lng, and region (array) are required' });
      return;
    }
    const inside = await isPointInRegion(lat, lng, region);
    res.json({ inside });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check point in region', details: error instanceof Error ? error.message : error });
  }
});

export default router;