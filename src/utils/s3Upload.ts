import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

// Initialize S3 client with proper configuration
// Use environment variables for region and bucket name
const region = process.env.AWS_REGION || 'ap-south-1';
const bucketName = process.env.AWS_S3_BUCKET_NAME || 'transit-driver-documents-shankhtech';
const s3Endpoint = process.env.AWS_S3_ENDPOINT; // For local MinIO/LocalStack

// Configure the S3 client
// When running on EC2/EBS with instance profile, credentials are automatically fetched
// For local development, can use MinIO or LocalStack with AWS_S3_ENDPOINT
const s3ClientConfig: any = {
    region: region,
    // Credentials will be automatically picked up from:
    // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    // 2. EC2 Instance Metadata Service (when using instance profile)
    // 3. ECS task role (when running in ECS)
    forcePathStyle: s3Endpoint ? true : false, // Required for MinIO/LocalStack
};

// Add custom endpoint for local development (MinIO, LocalStack, etc.)
if (s3Endpoint) {
    s3ClientConfig.endpoint = s3Endpoint;
    console.log(`🔧 Using custom S3 endpoint: ${s3Endpoint}`);
}

// Add explicit credentials if provided (for local dev)
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    s3ClientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    };
    console.log('🔑 Using explicit AWS credentials from environment');
}

const s3Client = new S3Client(s3ClientConfig);

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
            // Remove ACL if bucket has "Block Public Access" enabled
            // ACL: 'public-read' as const,
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
        // For private buckets, you'll need to use CloudFront or presigned URLs
        const cloudFrontUrl = process.env.AWS_CLOUDFRONT_URL;
        if (cloudFrontUrl) {
            return `${cloudFrontUrl}/${filename}`;
        }
        
        // Fallback to standard S3 URL
        return `https://${bucketName}.s3.${region}.amazonaws.com/${filename}`;
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

/**
 * Generate a presigned PUT URL for direct client-side upload to S3
 * @param folder - S3 folder/prefix (e.g., 'driver-documents', 'vehicle-images/cover')
 * @param filename - Original filename from client
 * @param contentType - MIME type of the file
 * @param expiresIn - URL expiration time in seconds (default: 300 = 5 minutes)
 * @returns Object containing presigned URL and S3 key
 */
export const generatePresignedUploadUrl = async (
    folder: string,
    filename: string,
    contentType: string,
    expiresIn: number = 300
): Promise<{ url: string; key: string; bucket: string; region: string }> => {
    try {
        // Sanitize filename
        const sanitizedFilename = filename.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
        
        // Create a unique S3 key
        const timestamp = Date.now();
        const randomSuffix = Math.round(Math.random() * 1e9);
        const key = `${folder}/${timestamp}-${randomSuffix}-${sanitizedFilename}`;

        // Create the PutObjectCommand
        const command = new PutObjectCommand({
            Bucket: bucketName,
            Key: key,
            ContentType: contentType,
            ACL: 'private', // Use private ACL for documents
            Metadata: {
                'x-amz-meta-uploaded-by': 'transit-app',
                'x-amz-meta-upload-date': new Date().toISOString()
            }
        });

        // Generate presigned URL
        const url = await getSignedUrl(s3Client, command, { expiresIn });

        return {
            url,
            key,
            bucket: bucketName,
            region
        };
    } catch (error) {
        console.error('Error generating presigned URL:', error);
        throw new Error('Failed to generate upload URL');
    }
};

/**
 * Generate presigned GET URL for accessing private S3 objects
 * @param key - S3 object key
 * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
 * @returns Presigned URL for downloading/viewing the file
 */
export const generatePresignedDownloadUrl = async (
    key: string,
    expiresIn: number = 3600
): Promise<string> => {
    try {
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: key
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn });
        return url;
    } catch (error) {
        console.error('Error generating presigned download URL:', error);
        throw new Error('Failed to generate download URL');
    }
};

/**
 * Helper function to extract S3 key from full URL
 * @param url - Full S3 URL
 * @returns S3 key (path within bucket)
 */
export const extractS3KeyFromUrl = (url: string): string => {
    try {
        // Handle different S3 URL formats:
        // 1. https://bucket.s3.region.amazonaws.com/key
        // 2. https://s3.region.amazonaws.com/bucket/key
        // 3. CloudFront URL
        
        const urlObj = new URL(url);
        
        // For bucket.s3.region.amazonaws.com format
        if (urlObj.hostname.includes('.s3.')) {
            return urlObj.pathname.substring(1); // Remove leading slash
        }
        
        // For s3.region.amazonaws.com/bucket format
        if (urlObj.hostname.startsWith('s3.')) {
            const parts = urlObj.pathname.split('/').filter(Boolean);
            parts.shift(); // Remove bucket name
            return parts.join('/');
        }
        
        // For CloudFront or custom domain
        return urlObj.pathname.substring(1); // Remove leading slash
    } catch (error) {
        console.error('Error extracting S3 key from URL:', error);
        throw new Error('Invalid S3 URL format');
    }
};
