import fs from 'fs';
import path from 'path';

export const saveToLocal = async (
    file: any,
    folder: string = 'driver-documents'
): Promise<string> => {
    try {
        // Create uploads directory if it doesn't exist
        const uploadsDir = path.join(process.cwd(), 'uploads', folder);
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        // Create unique filename
        const filename = `${Date.now()}-${path.basename(file.originalname).replace(/\s+/g, '-')}`;
        const filepath = path.join(uploadsDir, filename);

        // Copy file from temp location to uploads
        fs.copyFileSync(file.path, filepath);

        // Clean up temp file
        fs.unlinkSync(file.path);

        // Return URL path
        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        return `${baseUrl}/uploads/${folder}/${filename}`;
    } catch (error) {
        console.error('Error saving file locally:', error);
        
        // Clean up temp file if it exists
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }
        
        throw new Error('Failed to save file locally');
    }
};

