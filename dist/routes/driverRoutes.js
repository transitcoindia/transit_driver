"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const authControllers_1 = require("../controllers/auth_controllers/authControllers");
const rideHistory_1 = require("../controllers/ride_controllers/rideHistory");
const rideChat_1 = require("../controllers/ride_controllers/rideChat");
const rideManagement_1 = require("../controllers/ride_controllers/rideManagement");
const earnings_1 = require("../controllers/ride_controllers/earnings");
const location_1 = require("../controllers/ride_controllers/location");
const payment_1 = require("../controllers/ride_controllers/payment");
const rating_1 = require("../controllers/ride_controllers/rating");
const subscription_1 = require("../controllers/ride_controllers/subscription");
const profile_1 = require("../controllers/auth_controllers/profile");
const fcmToken_1 = require("../controllers/auth_controllers/fcmToken");
const documents_1 = require("../controllers/auth_controllers/documents");
const authMiddle_1 = require("../middleware/authMiddle");
const broadcastRideRequest_1 = require("../controllers/ride_controllers/broadcastRideRequest");
const driverAdmin_1 = require("../controllers/admin/driverAdmin");
// Create uploads directory if it doesn't exist
const uploadsDir = path_1.default.join(process.cwd(), 'uploads');
const tempUploadsDir = path_1.default.join(uploadsDir, 'temp');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
if (!fs_1.default.existsSync(tempUploadsDir)) {
    fs_1.default.mkdirSync(tempUploadsDir, { recursive: true });
}
// Configure multer for temporary local storage before Supabase upload
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, tempUploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
    }
});
// Configure upload middleware to handle multiple documents
const documentUpload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file size limit
    },
    fileFilter: (req, file, cb) => {
        // Allow only images and PDFs
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        }
        else {
            cb(new Error('Only images and PDF documents are allowed'));
        }
    }
}).fields([
    { name: 'documents', maxCount: 5 } // For multiple documents
]);
// Configure multer for vehicle images (images only, no PDFs)
const vehicleImageUpload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file size limit
    },
    fileFilter: (req, file, cb) => {
        // Allow only images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed for vehicle images'));
        }
    }
}).fields([
    { name: 'cover', maxCount: 5 }, // Cover images
    { name: 'interior', maxCount: 10 }, // Interior images
    { name: 'exterior', maxCount: 10 } // Exterior images
]);
// Configure multer for driver profile image (single image)
const profileImageUpload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed for profile image'));
        }
    }
}).single('profileImage');
// Single image for daily verification selfie (does not update profile photo)
const verificationSelfieUpload = (0, multer_1.default)({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        }
        else {
            cb(new Error('Only image files are allowed for verification selfie'));
        }
    }
}).single('verificationSelfie');
const router = express_1.default.Router();
// Registration routes
router.post('/register', authControllers_1.register);
router.post('/verify-registration-otp', authControllers_1.verifyRegistrationOTP);
router.post('/resend-registration-otp', authControllers_1.resendRegistrationOtp); // Resend OTP when expired or not received
router.get('/verify-email', authControllers_1.verifyDriverEmail);
// Login is OTP-only (no password). Request OTP by email or phone, then verify.
router.post('/login/request-otp', authControllers_1.requestLoginOtp);
router.post('/login/verify-otp', authControllers_1.verifyLoginOtp);
router.post('/login/phoneNumber', authControllers_1.loginWithPhoneNumber); // backward compat: same as request-otp with phoneNumber
// OAuth routes
router.post('/auth/google', authControllers_1.googleAuth);
// Protected routes
router.post('/fcm-token', authMiddle_1.authenticate, fcmToken_1.registerFcmToken);
router.get('/profile', authMiddle_1.authenticate, authControllers_1.getUserDetails);
router.put('/profile', authMiddle_1.authenticate, profile_1.updateDriverProfile);
router.post('/profile/request-phone-otp', authMiddle_1.authenticate, authControllers_1.requestProfilePhoneOtp);
router.post('/profile/verify-phone-otp', authMiddle_1.authenticate, authControllers_1.verifyProfilePhoneOtp);
router.post('/profile/image', authMiddle_1.authenticate, profileImageUpload, profile_1.uploadDriverProfileImage);
router.post('/profile/verification-selfie', authMiddle_1.authenticate, verificationSelfieUpload, profile_1.uploadVerificationSelfie);
router.get('/documents/status', authMiddle_1.authenticate, documents_1.getDocumentStatus);
router.get('/documents/vehicleImages', authMiddle_1.authenticate, documents_1.getVehicleImages);
router.post('/documents/vehicleImages', authMiddle_1.authenticate, vehicleImageUpload, documents_1.uploadVehicleImages);
router.post('/documents/vehicleInfo', authMiddle_1.authenticate, documents_1.createOrUpdateVehicleInfo);
router.post('/documents/upload', authMiddle_1.authenticate, documentUpload, documents_1.uploadDocuments);
// Password reset routes
router.post('/password-reset/request-otp', authControllers_1.sendResetEmailController);
router.post('/password-reset/verify-otp', authControllers_1.resetPassword);
// Ride history routes
router.get('/rides/history', authMiddle_1.authenticate, rideHistory_1.getDriverRideHistory);
router.get('/rides/:rideId', authMiddle_1.authenticate, rideHistory_1.getDriverRideDetails);
router.get('/rides/:rideId/chat', authMiddle_1.authenticate, rideChat_1.getRideChatHistory);
router.post('/rides/:rideId/chat', authMiddle_1.authenticate, rideChat_1.sendRideChatMessage);
router.post('/rides/:rideId/rate-rider', authMiddle_1.authenticate, rating_1.rateRider);
// Ride management routes (gateway calls rides_accepted after driver accepts via gateway)
router.post('/rides_accepted', authMiddle_1.authenticate, rideManagement_1.storeRideAcceptedFromGateway);
router.post('/rides/:rideId/accept', authMiddle_1.authenticate, rideManagement_1.acceptRide);
router.post('/rides/:rideId/arrived-at-pickup', authMiddle_1.authenticate, rideManagement_1.arrivedAtPickup);
router.post('/rides/:rideId/start', authMiddle_1.authenticate, rideManagement_1.startRide);
router.post('/rides/:rideId/complete', authMiddle_1.authenticate, rideManagement_1.completeRide);
router.post('/rides/:rideId/payment-received', authMiddle_1.authenticate, rideManagement_1.markPaymentReceived);
router.post('/rides/:rideId/cancel', authMiddle_1.authenticate, rideManagement_1.cancelRide);
// Earnings routes
router.get('/earnings', authMiddle_1.authenticate, earnings_1.getDriverEarnings);
router.get('/earnings/breakdown', authMiddle_1.authenticate, earnings_1.getDriverEarningsBreakdown);
// Payment routes
router.get('/payments/history', authMiddle_1.authenticate, payment_1.getDriverPaymentHistory);
router.get('/payments/summary', authMiddle_1.authenticate, payment_1.getDriverPaymentSummary);
// Location routes
router.post('/location', authMiddle_1.authenticate, location_1.updateDriverLocation);
router.get('/location', authMiddle_1.authenticate, location_1.getDriverLocation);
router.post('/availability', authMiddle_1.authenticate, location_1.toggleDriverAvailability);
router.post('/availability/heartbeat', authMiddle_1.authenticate, location_1.driverHeartbeat);
// Internal: broadcast new ride request to drivers (called by transit_backend)
router.post('/internal/broadcast-ride-request', broadcastRideRequest_1.broadcastRideRequest);
// Subscription routes (GET /subscription/plans is public so app can show catalogue without auth)
router.get('/subscription/plans', subscription_1.getSubscriptionPlans);
router.post('/subscription/activate', authMiddle_1.authenticate, subscription_1.activateSubscription);
router.get('/subscription', authMiddle_1.authenticate, subscription_1.getCurrentSubscription);
// Admin routes for driver management
router.get('/admin/list', authMiddle_1.authenticateAdmin, driverAdmin_1.getAllDrivers);
router.put('/admin/approve/:driverId', authMiddle_1.authenticateAdmin, driverAdmin_1.approveDriver);
router.get('/admin/approve', driverAdmin_1.approveDriver); // Email token-based approval
router.put('/admin/reject/:driverId', authMiddle_1.authenticateAdmin, driverAdmin_1.rejectDriver);
router.get('/admin/reject', driverAdmin_1.rejectDriver); // Email token-based rejection
router.post('/admin/reject', driverAdmin_1.rejectDriver); // Email token-based rejection (POST)
router.put('/admin/suspend/:driverId', authMiddle_1.authenticateAdmin, driverAdmin_1.suspendDriver);
router.get('/admin/suspend', driverAdmin_1.suspendDriver); // Email token-based suspension (optional)
router.post('/admin/suspend', driverAdmin_1.suspendDriver); // Email token-based suspension (POST)
router.patch('/admin/:driverId/approval', authMiddle_1.authenticateAdmin, driverAdmin_1.updateDriverApproval);
exports.default = router;
//# sourceMappingURL=driverRoutes.js.map