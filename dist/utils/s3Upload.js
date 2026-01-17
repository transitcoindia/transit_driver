"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToS3 = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Base URL for serving uploaded files - use environment variable or default to localhost
// In production, set BASE_URL to your API URL (e.g., https://api.transitco.in)
const getBaseUrl = () => {
    if (process.env.BASE_URL) {
        return process.env.BASE_URL;
    }
    // Default to localhost for development
    const port = process.env.PORT || '3000';
    return `http://localhost:${port}`;
};
const publicUploadsDir = path_1.default.join(process.cwd(), 'public', 'uploads');
// Ensure public uploads directory exists
const ensureUploadDir = (folder) => {
    const uploadDir = path_1.default.join(publicUploadsDir, folder);
    if (!fs_1.default.existsSync(uploadDir)) {
        fs_1.default.mkdirSync(uploadDir, { recursive: true });
    }
    return uploadDir;
};
/**
 * Save file locally to public/uploads directory
 * Returns the public URL for the file
 */
const uploadToS3 = async (file, folder = 'driver-documents') => {
    try {
        if (!file.path || !fs_1.default.existsSync(file.path)) {
            throw new Error(`Source file not found: ${file.path}`);
        }
        // Ensure upload directory exists
        const uploadDir = ensureUploadDir(folder);
        // Create a unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const fileExt = path_1.default.extname(file.originalname);
        const baseName = path_1.default.basename(file.originalname, fileExt).replace(/\s+/g, '-');
        const filename = `${baseName}-${uniqueSuffix}${fileExt}`;
        const destinationPath = path_1.default.join(uploadDir, filename);
        // Copy file from temp location to permanent location
        fs_1.default.copyFileSync(file.path, destinationPath);
        // Clean up the temporary file
        if (fs_1.default.existsSync(file.path)) {
            fs_1.default.unlinkSync(file.path);
        }
        // Return the public URL
        const publicPath = `/uploads/${folder}/${filename}`;
        const fullUrl = `${getBaseUrl()}${publicPath}`;
        console.log(`File saved locally: ${destinationPath} -> ${fullUrl}`);
        return fullUrl;
    }
    catch (error) {
        console.error('Error saving file locally:', error);
        // Clean up the temporary file if it exists
        if (file.path && fs_1.default.existsSync(file.path)) {
            try {
                fs_1.default.unlinkSync(file.path);
            }
            catch (unlinkError) {
                console.error('Error cleaning up temp file:', unlinkError);
            }
        }
        throw new Error(`Failed to save file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};
exports.uploadToS3 = uploadToS3;
//# sourceMappingURL=s3Upload.js.map