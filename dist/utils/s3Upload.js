"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToS3 = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Initialize S3 client with proper configuration
// Update the default region to match your actual bucket region
const region = process.env.AWS_BUCKET_REGION || 'us-east-1';
const bucketName = process.env.AWS_S3_BUCKET_NAME || 'transit-driver-documents';
// Configure the S3 client without specifying an endpoint
// AWS SDK will handle the regional redirects automatically
const s3Client = new client_s3_1.S3Client({
    region: region,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
    },
    // Don't specify the endpoint, as the bucket may use the global endpoint
    forcePathStyle: false
});
const uploadToS3 = async (file, folder = 'driver-documents') => {
    try {
        const fileStream = fs_1.default.createReadStream(file.path);
        // Create a unique filename
        const filename = `${folder}/${Date.now()}-${path_1.default.basename(file.originalname).replace(/\s+/g, '-')}`;
        const uploadParams = {
            Bucket: bucketName,
            Key: filename,
            Body: fileStream,
            ContentType: file.mimetype,
            ACL: 'public-read', // Make the file publicly accessible
            Metadata: {
                'x-amz-meta-uploaded-by': 'transit-app',
                'x-amz-meta-document-type': file.originalname.split('.').pop() || '',
                'x-amz-meta-upload-date': new Date().toISOString()
            }
        };
        const uploadResult = await s3Client.send(new client_s3_1.PutObjectCommand(uploadParams));
        // Clean up the local file
        fs_1.default.unlinkSync(file.path);
        // Construct the URL based on the bucket name and region
        return `https://${bucketName}.s3.amazonaws.com/${filename}`;
    }
    catch (error) {
        console.error('Error uploading file to S3:', error);
        // More detailed error logging for S3 errors
        const s3Error = error;
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
        if (file.path && fs_1.default.existsSync(file.path)) {
            fs_1.default.unlinkSync(file.path);
        }
        throw new Error('Failed to upload file to S3');
    }
};
exports.uploadToS3 = uploadToS3;
//# sourceMappingURL=s3Upload.js.map