import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';

// Initialize S3 client with proper configuration
// Use environment variables for region and bucket name
// Priority: AWS_BUCKET_REGION > AWS_REGION > default (ap-south-1)
// Note: AWS_BUCKET_REGION should match the actual bucket region
const region = process.env.AWS_BUCKET_REGION || process.env.AWS_REGION || 'ap-south-1';
const bucketName = process.env.AWS_S3_BUCKET_NAME || 'transit-driver-documents-shankhtech';
const s3Endpoint = process.env.AWS_S3_ENDPOINT; // For local MinIO/LocalStack

// Log S3 configuration on startup (only once)
declare global {
  var s3ConfigLogged: boolean | undefined;
}

if (!global.s3ConfigLogged) {
  // Determine endpoint that will be used
  const endpointToUse = s3Endpoint || 'AWS SDK automatic (based on region)';
  
  console.log('📦 S3 Configuration:', {
    region: region,
    bucket: bucketName,
    hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
    hasCustomEndpoint: !!s3Endpoint,
    endpoint: endpointToUse,
    note: s3Endpoint ? 'Using custom endpoint' : 'Using AWS SDK automatic endpoint resolution',
    envVars: {
      AWS_BUCKET_REGION: process.env.AWS_BUCKET_REGION || 'not set',
      AWS_REGION: process.env.AWS_REGION || 'not set',
      AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME || 'not set',
      AWS_S3_ENDPOINT: process.env.AWS_S3_ENDPOINT || 'not set (using SDK default)'
    }
  });
  
  // Warn if region might be incorrect
  if (bucketName === 'transit-driver-documents-shankhtech' && region !== 'ap-south-1') {
    console.warn(`⚠️ WARNING: Bucket "${bucketName}" is in ap-south-1, but configured region is "${region}"`);
    console.warn('⚠️ This may cause presigned URL generation to fail. Set AWS_BUCKET_REGION=ap-south-1');
  }
  
  global.s3ConfigLogged = true;
}

// Configure the S3 client
// When running on EC2/EBS with instance profile, credentials are automatically fetched
// For local development, can use MinIO or LocalStack with AWS_S3_ENDPOINT
const s3ClientConfig: any = {
    region: region,
    // Credentials will be automatically picked up from:
    // 1. Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    // 2. EC2 Instance Metadata Service (when using instance profile)
    // 3. ECS task role (when running in ECS)
    // Note: Do NOT set endpoint for AWS S3 - SDK handles it automatically
    // Only set endpoint for custom services like MinIO/LocalStack
    forcePathStyle: false, // Use virtual-hosted style (bucket.s3.region.amazonaws.com)
};

// Only set endpoint for custom/local S3 services (MinIO, LocalStack, etc.)
// For AWS S3, let the SDK automatically determine the correct endpoint based on region
if (s3Endpoint) {
    // Custom endpoint for local development (MinIO, LocalStack, etc.)
    s3ClientConfig.endpoint = s3Endpoint;
    s3ClientConfig.forcePathStyle = true; // Required for custom endpoints
    console.log(`🔧 Using custom S3 endpoint: ${s3Endpoint}`);
} else {
    // For AWS S3, don't set endpoint - SDK will use correct endpoint based on region
    // This prevents PermanentRedirect errors
    console.log(`🔧 Using AWS S3 with automatic endpoint resolution for region: ${region}`);
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
        // Validate file object
        if (!file) {
            throw new Error('File object is required');
        }

        // Validate file path exists
        if (!file.path) {
            throw new Error(`File path is missing for ${file.originalname || 'unknown file'}. The file may not have been uploaded correctly.`);
        }

        // Check if file exists on disk
        if (!fs.existsSync(file.path)) {
            throw new Error(`File not found at path: ${file.path}. The file may have been deleted or moved.`);
        }

        // Validate file has required properties
        if (!file.originalname) {
            throw new Error('File originalname is missing');
        }

        if (!file.mimetype) {
            throw new Error('File mimetype is missing');
        }

        console.log('Uploading file to S3:', {
            filename: file.originalname,
            path: file.path,
            size: fs.statSync(file.path).size,
            contentType: file.mimetype,
            folder: folder
        });

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

        let uploadResult;
        try {
            uploadResult = await s3Client.send(new PutObjectCommand(uploadParams));
        } catch (firstError: any) {
            // Handle PermanentRedirect error - bucket might be in different region
            if (firstError.Code === 'PermanentRedirect' || firstError.name === 'PermanentRedirect') {
                console.error('⚠️ PermanentRedirect error detected');
                console.error('Error details:', {
                    Code: firstError.Code,
                    Endpoint: firstError.Endpoint,
                    Region: firstError.Region,
                    Bucket: bucketName,
                    CurrentRegion: region
                });
                
                // Extract the correct region from error
                const correctRegion = firstError.Region || 'ap-south-1';
                
                console.log(`🔄 Retrying with correct region: ${correctRegion}`);
                
                // Create a new S3 client with the correct region (don't set endpoint for AWS)
                const correctedS3Config: any = {
                    region: correctRegion,
                    forcePathStyle: false,
                };
                
                if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
                    correctedS3Config.credentials = {
                        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
                    };
                }
                
                const correctedS3Client = new S3Client(correctedS3Config);
                
                try {
                    uploadResult = await correctedS3Client.send(new PutObjectCommand(uploadParams));
                    console.log('✅ Upload succeeded after redirect correction');
                } catch (retryError: any) {
                    throw new Error(`S3 PermanentRedirect: Bucket "${bucketName}" is in region "${correctRegion}", but configured region is "${region}". Set AWS_BUCKET_REGION=${correctRegion}`);
                }
            } else {
                throw firstError;
            }
        }

        console.log('File uploaded to S3 successfully:', {
            filename: file.originalname,
            s3Key: filename,
            bucket: bucketName
        });

        // Clean up the local file
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

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
        if (file && file.path && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
            } catch (cleanupError) {
                console.error('Error cleaning up file:', cleanupError);
            }
        }

        // Provide more descriptive error message
        if (error instanceof Error) {
            throw new Error(`Failed to upload file to S3: ${error.message}`);
        }
        throw new Error('Failed to upload file to S3: Unknown error');
    }
};

/**
 * Upload file to S3 from buffer (for memory storage)
 * @param file - Multer file object with buffer
 * @param folder - S3 folder/prefix
 * @returns S3 URL and key
 */
export const uploadToS3FromBuffer = async (
    file: Express.Multer.File,
    folder: string = 'driver-documents'
): Promise<{ url: string; key: string }> => {
    try {
        // Validate file buffer exists
        if (!file.buffer) {
            throw new Error(`File buffer is missing for ${file.originalname}. Make sure multer is configured with memoryStorage().`);
        }

        // Validate file has required properties
        if (!file.originalname || !file.mimetype) {
            throw new Error(`File metadata missing: originalname=${file.originalname}, mimetype=${file.mimetype}`);
        }

        // Validate S3 configuration
        if (!bucketName) {
            throw new Error('AWS_S3_BUCKET_NAME environment variable is not set');
        }

        console.log('Uploading file to S3:', {
            filename: file.originalname,
            size: file.buffer.length,
            contentType: file.mimetype,
            bucket: bucketName,
            region: region
        });

        // Create a unique filename
        const timestamp = Date.now();
        const randomSuffix = Math.round(Math.random() * 1e9);
        const sanitizedFilename = file.originalname.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '');
        const key = `${folder}/${timestamp}-${randomSuffix}-${sanitizedFilename}`;

        let uploadParams: any = {
            Bucket: bucketName,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype,
            Metadata: {
                'x-amz-meta-uploaded-by': 'transit-app',
                'x-amz-meta-document-type': file.originalname.split('.').pop() || '',
                'x-amz-meta-upload-date': new Date().toISOString()
            }
        };

        console.log('S3 Upload Params:', {
            bucket: bucketName,
            key: key,
            contentType: file.mimetype,
            bodySize: file.buffer.length,
            hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
            region: region
        });

        let uploadResult;
        try {
            uploadResult = await s3Client.send(new PutObjectCommand(uploadParams));
        } catch (firstError: any) {
            // Handle PermanentRedirect error - bucket might be in different region
            if (firstError.Code === 'PermanentRedirect' || firstError.name === 'PermanentRedirect') {
                console.error('⚠️ PermanentRedirect error detected');
                console.error('Error details:', {
                    Code: firstError.Code,
                    Endpoint: firstError.Endpoint,
                    Region: firstError.Region,
                    Bucket: bucketName,
                    CurrentRegion: region
                });
                
                // Extract the correct endpoint from error if available
                const correctEndpoint = firstError.Endpoint || `https://s3.ap-south-1.amazonaws.com`;
                const correctRegion = firstError.Region || 'ap-south-1';
                
                console.log(`🔄 Retrying with correct endpoint: ${correctEndpoint} (region: ${correctRegion})`);
                
                // Create a new S3 client with the correct endpoint
                const correctedS3Config: any = {
                    ...s3ClientConfig,
                    region: correctRegion,
                    endpoint: correctEndpoint,
                    forcePathStyle: false,
                };
                
                if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
                    correctedS3Config.credentials = {
                        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
                    };
                }
                
                const correctedS3Client = new S3Client(correctedS3Config);
                
                try {
                    uploadResult = await correctedS3Client.send(new PutObjectCommand(uploadParams));
                    console.log('✅ Upload succeeded after redirect correction');
                } catch (retryError: any) {
                    throw new Error(`S3 PermanentRedirect: Bucket "${bucketName}" must be accessed using endpoint "${correctEndpoint}" in region "${correctRegion}". Please set AWS_BUCKET_REGION=${correctRegion} and ensure AWS_S3_ENDPOINT is not set.`);
                }
            }
            // If AccessDenied, try with ACL (bucket might require explicit ACL)
            else if (firstError.Code === 'AccessDenied' || firstError.name === 'AccessDenied') {
                console.log('⚠️ AccessDenied error, retrying with ACL...');
                uploadParams.ACL = 'private';
                try {
                    uploadResult = await s3Client.send(new PutObjectCommand(uploadParams));
                } catch (aclError: any) {
                    // If ACL also fails, throw original error with better message
                    console.error('❌ Upload failed even with ACL:', aclError);
                    throw new Error(`S3 Access Denied. Please check IAM permissions for user/role. Required permissions: s3:PutObject, s3:PutObjectAcl. Error: ${firstError.message || firstError.Code || 'Unknown error'}`);
                }
            } else {
                throw firstError;
            }
        }

        // Construct the URL based on the bucket name and region
        const cloudFrontUrl = process.env.AWS_CLOUDFRONT_URL;
        const url = cloudFrontUrl 
            ? `${cloudFrontUrl}/${key}`
            : `https://${bucketName}.s3.${region}.amazonaws.com/${key}`;

        console.log('File uploaded to S3 successfully:', { key, url });

        return { url, key };
    } catch (error) {
        console.error('Error uploading file to S3 from buffer:', error);

        const s3Error = error as any;
        let errorMessage = 'Failed to upload file to S3';
        
        if (s3Error.$metadata && s3Error.Code) {
            console.error(`S3 Error Details: Code=${s3Error.Code}, Region=${region}, Status=${s3Error.$metadata.httpStatusCode}`, {
                requestId: s3Error.RequestId,
                endpoint: s3Error.Endpoint,
                bucket: bucketName,
                region: s3Error.Region
            });
            
            // Provide specific guidance for PermanentRedirect errors
            if (s3Error.Code === 'PermanentRedirect' || s3Error.name === 'PermanentRedirect') {
                const correctEndpoint = s3Error.Endpoint || `https://s3.ap-south-1.amazonaws.com`;
                const correctRegion = s3Error.Region || 'ap-south-1';
                errorMessage = `S3 PermanentRedirect: The bucket "${bucketName}" must be accessed using endpoint "${correctEndpoint}" in region "${correctRegion}". ` +
                    `Current configuration: region="${region}", endpoint="${s3ClientConfig.endpoint || 'default'}". ` +
                    `Fix: Set AWS_BUCKET_REGION=${correctRegion} in your environment variables.`;
            }
            // Provide specific guidance for AccessDenied errors
            else if (s3Error.Code === 'AccessDenied' || s3Error.name === 'AccessDenied') {
                errorMessage = `S3 Access Denied: The IAM user/role does not have permission to upload to bucket "${bucketName}". ` +
                    `Required permissions: s3:PutObject, s3:PutObjectAcl. ` +
                    `Check IAM policies and bucket policies. Error: ${s3Error.message || 'Access Denied'}`;
            } else {
                errorMessage = `S3 Upload Error: ${s3Error.Code} - ${s3Error.message || 'Unknown error'}`;
            }
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }

        // Log detailed error for debugging
        console.error('Full error details:', {
            error: error,
            errorName: error?.constructor?.name,
            errorMessage: errorMessage,
            bucket: bucketName,
            region: region,
            hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
            accessKeyId: process.env.AWS_ACCESS_KEY_ID ? process.env.AWS_ACCESS_KEY_ID.substring(0, 8) + '...' : 'not set',
            s3ErrorCode: s3Error.Code,
            s3ErrorName: s3Error.name,
            key: (error as any).key || 'unknown'
        });

        throw new Error(errorMessage);
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
        // Log configuration for debugging
        console.log('Generating presigned URL with config:', {
            bucket: bucketName,
            region: region,
            folder: folder,
            filename: filename,
            contentType: contentType
        });

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

        // Validate that the generated URL uses the correct region
        // Extract region from URL to verify
        const urlRegionMatch = url.match(/\.s3\.([^.]+)\.amazonaws\.com/);
        const urlRegion = urlRegionMatch ? urlRegionMatch[1] : 'unknown';
        
        if (urlRegion !== region && urlRegion !== 'unknown') {
            console.warn(`⚠️ Region mismatch detected! Expected: ${region}, URL contains: ${urlRegion}`);
            console.warn('This may cause upload failures. Check AWS_REGION or AWS_BUCKET_REGION environment variable.');
        }

        console.log('Presigned URL generated:', {
            key: key,
            bucket: bucketName,
            expectedRegion: region,
            urlRegion: urlRegion,
            urlPreview: url.substring(0, 100) + '...'
        });

        return {
            url,
            key,
            bucket: bucketName,
            region
        };
    } catch (error) {
        console.error('Error generating presigned URL:', error);
        console.error('Configuration at time of error:', {
            bucket: bucketName,
            region: region,
            hasCredentials: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
        });
        
        if (error instanceof Error) {
            throw new Error(`Failed to generate upload URL: ${error.message}`);
        }
        throw new Error('Failed to generate upload URL: Unknown error');
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
