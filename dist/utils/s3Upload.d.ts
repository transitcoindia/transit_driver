/**
 * Upload file to Supabase Storage
 * Returns the public URL for the file
 */
export declare const uploadToS3: (file: Express.Multer.File, folder?: string) => Promise<string>;
