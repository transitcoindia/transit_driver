import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️  Supabase credentials not found. File uploads will fail. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/**
 * Upload file to Supabase Storage
 * Returns the public URL for the file
 */
export const uploadToSupabase = async (
    file: Express.Multer.File,
    folder: string = 'driver-documents'
): Promise<string> => {
    try {
        if (!supabase) {
            throw new Error('Supabase client not initialized. Please configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
        }

        if (!file.path || !fs.existsSync(file.path)) {
            throw new Error(`Source file not found: ${file.path}`);
        }

        // Read file buffer
        const fileBuffer = fs.readFileSync(file.path);
        
        // Create a unique filename
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const fileExt = path.extname(file.originalname);
        const baseName = path.basename(file.originalname, fileExt).replace(/\s+/g, '-');
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
        if (fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
            } catch (unlinkError) {
                console.error('Error cleaning up temp file:', unlinkError);
            }
        }

        console.log(`File uploaded to Supabase: ${filePath} -> ${urlData.publicUrl}`);
        return urlData.publicUrl;
    } catch (error) {
        console.error('Error uploading file to Supabase:', error);
        
        // Clean up the temporary file if it exists
        if (file.path && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
            } catch (unlinkError) {
                console.error('Error cleaning up temp file:', unlinkError);
            }
        }

        throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};
