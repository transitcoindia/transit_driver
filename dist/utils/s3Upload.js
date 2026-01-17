"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToS3 = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  Supabase credentials not found. File uploads will fail. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.');
}
const supabase = supabaseUrl && supabaseKey ? (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey) : null;
/**
 * Upload file to Supabase Storage
 * Returns the public URL for the file
 */
const uploadToS3 = async (file, folder = 'driver-documents') => {
    try {
        if (!supabase) {
            throw new Error('Supabase client not initialized. Please configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
        }
        if (!file.path || !fs_1.default.existsSync(file.path)) {
            throw new Error(`Source file not found: ${file.path}`);
        }
        // Read file buffer
        const fileBuffer = fs_1.default.readFileSync(file.path);
        // Create a unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const fileExt = path_1.default.extname(file.originalname);
        const baseName = path_1.default.basename(file.originalname, fileExt).replace(/\s+/g, '-');
        const filename = `${baseName}-${uniqueSuffix}${fileExt}`;
        const filePath = `${folder}/${filename}`;
        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
            .from('driver-files') // Bucket name - update this to your actual bucket name
            .upload(filePath, fileBuffer, {
            contentType: file.mimetype,
            upsert: false, // Don't overwrite existing files
        });
        if (error) {
            console.error('Supabase upload error:', error);
            throw new Error(`Failed to upload to Supabase: ${error.message}`);
        }
        // Get public URL
        const { data: urlData } = supabase.storage
            .from('driver-files')
            .getPublicUrl(filePath);
        if (!urlData?.publicUrl) {
            throw new Error('Failed to get public URL from Supabase');
        }
        // Clean up the temporary file
        if (fs_1.default.existsSync(file.path)) {
            try {
                fs_1.default.unlinkSync(file.path);
            }
            catch (unlinkError) {
                console.error('Error cleaning up temp file:', unlinkError);
            }
        }
        console.log(`File uploaded to Supabase: ${filePath} -> ${urlData.publicUrl}`);
        return urlData.publicUrl;
    }
    catch (error) {
        console.error('Error uploading file to Supabase:', error);
        // Clean up the temporary file if it exists
        if (file.path && fs_1.default.existsSync(file.path)) {
            try {
                fs_1.default.unlinkSync(file.path);
            }
            catch (unlinkError) {
                console.error('Error cleaning up temp file:', unlinkError);
            }
        }
        throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};
exports.uploadToS3 = uploadToS3;
//# sourceMappingURL=s3Upload.js.map