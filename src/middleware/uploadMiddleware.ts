import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';

// Create upload directories
const uploadsDir = path.join(process.cwd(), 'uploads');
const tempUploadsDir = path.join(uploadsDir, 'temp');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(tempUploadsDir)) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

// Configure multer for temporary local storage before S3 upload
const storage = multer.diskStorage({
    destination: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        cb(null, tempUploadsDir);
    },
    filename: (req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

// Configure upload middleware to handle multiple documents
export const documentUpload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file size limit
        files: 5 // Maximum 5 files
    },
    fileFilter: (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        // Allow only images and PDFs
        const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`Invalid file type. Only ${allowedMimeTypes.join(', ')} are allowed.`));
        }
    }
}).fields([
    { name: 'documents', maxCount: 5 }
]);

// Rate limiter for document uploads
export const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 upload requests per windowMs
    message: 'Too many document upload requests from this IP, please try again after 15 minutes'
}); 