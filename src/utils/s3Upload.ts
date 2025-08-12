import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

// Initialize S3 client with proper configuration
// Update the default region to match your actual bucket region
const region = process.env.AWS_BUCKET_REGION || 'us-east-1';
const bucketName = process.env.AWS_S3_BUCKET_NAME || 'transit-driver-documents';

// Configure the S3 client without specifying an endpoint
// AWS SDK will handle the regional redirects automatically
const s3Client = new S3Client({
    region: region,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    },
    // Don't specify the endpoint, as the bucket may use the global endpoint
    forcePathStyle: false
});

export const uploadToS3 = async (
    file: any,
    folder: string = 'driver-documents'
): Promise<string> => {
    try {
        const fileStream = fs.createReadStream(file.path);

        // Create a unique filename
        const filename = `${folder}/${Date.now()}-${path.basename(file.originalname).replace(/\s+/g, '-')}`;

        const uploadParams = {
            Bucket: bucketName,
            Key: filename,
            Body: fileStream,
            ContentType: file.mimetype,
            ACL: 'public-read' as const, // Make the file publicly accessible
            Metadata: {
                'x-amz-meta-uploaded-by': 'transit-app',
                'x-amz-meta-document-type': file.originalname.split('.').pop() || '',
                'x-amz-meta-upload-date': new Date().toISOString()
            }
        };

        const uploadResult = await s3Client.send(new PutObjectCommand(uploadParams));

        // Clean up the local file
        fs.unlinkSync(file.path);

        // Construct the URL based on the bucket name and region
        return `https://${bucketName}.s3.amazonaws.com/${filename}`;
    } catch (error) {
        console.error('Error uploading file to S3:', error);

        // More detailed error logging for S3 errors
        const s3Error = error as any;
        if (s3Error.$metadata && s3Error.Code) {
            console.error(`S3 Error Details: Code=${s3Error.Code}, Region=${region}, Status=${s3Error.$metadata.httpStatusCode}`, {
                requestId: s3Error.RequestId,
                endpoint: s3Error.Endpoint,
                bucket: bucketName
            });

            // If it's a PermanentRedirect error, log the correct endpoint
            if (s3Error.Code === 'PermanentRedirect' && s3Error.Endpoint) {
                console.error(`Bucket is in a different region or uses a different endpoint. Try using: ${s3Error.Endpoint}`);
                // You could also update the region here if needed
            }
        }

        // Clean up the local file if it exists
        if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        throw new Error('Failed to upload file to S3');
    }
};
