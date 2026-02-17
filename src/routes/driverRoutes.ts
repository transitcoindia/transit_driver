import express,{RequestHandler} from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { 
    register, 
    verifyDriverEmail, 
    requestLoginOtp,
    verifyLoginOtp,
    loginWithPhoneNumber,
    verifyRegistrationOTP,
    resendRegistrationOtp,
    getUserDetails,
    googleAuth,
    sendResetEmailController,
    resetPassword,
    requestProfilePhoneOtp,
    verifyProfilePhoneOtp,
} from '../controllers/auth_controllers/authControllers';
import {
    getDriverRideHistory,
    getDriverRideDetails,
    getDriverActiveRide,
} from '../controllers/ride_controllers/rideHistory';
import { getRideChatHistory, sendRideChatMessage } from '../controllers/ride_controllers/rideChat';
import {
    acceptRide,
    arrivedAtPickup,
    riderCallAttempted,
    startRide,
    completeRide,
    markPaymentReceived,
    cancelRide,
    storeRideAcceptedFromGateway,
    getDriverStrikes,
} from '../controllers/ride_controllers/rideManagement';
import {
    getDriverEarnings,
    getDriverEarningsBreakdown,
} from '../controllers/ride_controllers/earnings';
import {
    updateDriverLocation,
    toggleDriverAvailability,
    getDriverLocation,
    driverHeartbeat,
} from '../controllers/ride_controllers/location';
import {
    getDriverPaymentHistory,
    getDriverPaymentSummary,
} from '../controllers/ride_controllers/payment';
import {
    rateRider,
} from '../controllers/ride_controllers/rating';
import {
    activateSubscription,
    createSubscriptionOrder,
    getCurrentSubscription,
    getSubscriptionPlans,
} from '../controllers/ride_controllers/subscription';
import { getWalletBalance, getWalletTransactions, createTopUpOrder, verifyTopUp } from '../controllers/ride_controllers/wallet';
import { getReferralInfo } from '../controllers/ride_controllers/referral';
import { updateDriverProfile, uploadDriverProfileImage, uploadVerificationSelfie } from '../controllers/auth_controllers/profile';
import {
  addEmergencyContact,
  getEmergencyContacts,
  updateEmergencyContact,
  deleteEmergencyContact,
  triggerSos,
  updateSosLocation,
  getSosLive,
} from '../controllers/auth_controllers/emergency';
import { registerFcmToken } from '../controllers/auth_controllers/fcmToken';
import { getDocumentStatus, getVehicleImages, uploadDocuments, createOrUpdateVehicleInfo, uploadVehicleImages } from '../controllers/auth_controllers/documents';
import { authenticate, authenticateAdmin } from '../middleware/authMiddle';
import { broadcastRideRequest } from '../controllers/ride_controllers/broadcastRideRequest';
import {
    getAllDrivers,
    approveDriver,
    rejectDriver,
    suspendDriver,
    updateDriverApproval,
    getDriverStrikesAdmin,
} from '../controllers/admin/driverAdmin';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
const tempUploadsDir = path.join(uploadsDir, 'temp');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

if (!fs.existsSync(tempUploadsDir)) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
}

// Configure multer for temporary local storage before Supabase upload
const storage = multer.diskStorage({
    destination: (req: express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        cb(null, tempUploadsDir);
    },
    filename: (req: express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + '-' + uniqueSuffix + '.' + file.originalname.split('.').pop());
    }
});

// Configure upload middleware to handle multiple documents
const documentUpload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file size limit
    },
    fileFilter: (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        // Allow only images and PDFs
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only images and PDF documents are allowed'));
        }
    }
}).fields([
    { name: 'documents', maxCount: 5 }  // For multiple documents
]);

// Configure multer for vehicle images (images only, no PDFs)
const vehicleImageUpload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB file size limit
    },
    fileFilter: (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        // Allow only images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for vehicle images'));
        }
    }
}).fields([
    { name: 'cover', maxCount: 5 },      // Cover images
    { name: 'interior', maxCount: 10 },  // Interior images
    { name: 'exterior', maxCount: 10 }   // Exterior images
]);

// Configure multer for driver profile image (single image)
const profileImageUpload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for profile image'));
        }
    }
}).single('profileImage');

// Single image for daily verification selfie (does not update profile photo)
const verificationSelfieUpload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req: express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for verification selfie'));
        }
    }
}).single('verificationSelfie');

const router = express.Router();

// Registration routes
router.post('/register', register as RequestHandler);
router.post('/verify-registration-otp', verifyRegistrationOTP as RequestHandler);
router.post('/resend-registration-otp', resendRegistrationOtp as RequestHandler); // Resend OTP when expired or not received
router.get('/verify-email', verifyDriverEmail);

// Login is OTP-only (no password). Request OTP by email or phone, then verify.
router.post('/login/request-otp', requestLoginOtp as RequestHandler);
router.post('/login/verify-otp', verifyLoginOtp as RequestHandler);
router.post('/login/phoneNumber', loginWithPhoneNumber as RequestHandler); // backward compat: same as request-otp with phoneNumber

// OAuth routes
router.post('/auth/google', (googleAuth as unknown) as RequestHandler);

// Protected routes
router.post('/fcm-token', authenticate as RequestHandler, registerFcmToken as RequestHandler);
router.get('/profile', authenticate as RequestHandler, getUserDetails as RequestHandler);
router.put('/profile', authenticate as RequestHandler, updateDriverProfile as RequestHandler);
router.post('/profile/request-phone-otp', authenticate as RequestHandler, requestProfilePhoneOtp as RequestHandler);
router.post('/profile/verify-phone-otp', authenticate as RequestHandler, verifyProfilePhoneOtp as RequestHandler);
router.post('/profile/image', authenticate as RequestHandler, profileImageUpload as any, uploadDriverProfileImage as RequestHandler);
router.post('/profile/verification-selfie', authenticate as RequestHandler, verificationSelfieUpload as any, uploadVerificationSelfie as RequestHandler);

// Emergency contacts (driver profile)
router.get('/emergency/contacts', authenticate as RequestHandler, getEmergencyContacts as RequestHandler);
router.post('/emergency/contacts', authenticate as RequestHandler, addEmergencyContact as RequestHandler);
router.put('/emergency/contacts/:contactId', authenticate as RequestHandler, updateEmergencyContact as RequestHandler);
router.delete('/emergency/contacts/:contactId', authenticate as RequestHandler, deleteEmergencyContact as RequestHandler);
router.post('/emergency/sos', authenticate as RequestHandler, triggerSos as RequestHandler);
router.post('/emergency/sos/:sessionId/location', authenticate as RequestHandler, updateSosLocation as RequestHandler);
// Public – no auth. Shared via SMS to emergency contacts.
router.get('/emergency/sos/live/:sessionId', getSosLive as RequestHandler);

router.get('/documents/status', authenticate as RequestHandler, getDocumentStatus as RequestHandler);
router.get('/documents/vehicleImages', authenticate as RequestHandler, getVehicleImages as RequestHandler);
router.post('/documents/vehicleImages', authenticate as RequestHandler, vehicleImageUpload as any, uploadVehicleImages as RequestHandler);
router.post('/documents/vehicleInfo', authenticate as RequestHandler, createOrUpdateVehicleInfo as RequestHandler);
router.post('/documents/upload', authenticate as RequestHandler, documentUpload as any, uploadDocuments as RequestHandler);

// Password reset routes
router.post('/password-reset/request-otp', sendResetEmailController as RequestHandler);
router.post('/password-reset/verify-otp', resetPassword as RequestHandler);

// Ride history routes
router.get('/rides/history', authenticate as RequestHandler, getDriverRideHistory as RequestHandler);
router.get('/rides/active', authenticate as RequestHandler, getDriverActiveRide as RequestHandler);
router.get('/rides/:rideId', authenticate as RequestHandler, getDriverRideDetails as RequestHandler);
router.get('/rides/:rideId/chat', authenticate as RequestHandler, getRideChatHistory as RequestHandler);
router.post('/rides/:rideId/chat', authenticate as RequestHandler, sendRideChatMessage as RequestHandler);
router.post('/rides/:rideId/rate-rider', authenticate as RequestHandler, rateRider as RequestHandler);

// Ride management routes (gateway calls rides_accepted after driver accepts via gateway)
router.post('/rides_accepted', authenticate as RequestHandler, storeRideAcceptedFromGateway as RequestHandler);
router.post('/rides/:rideId/accept', authenticate as RequestHandler, acceptRide as RequestHandler);
router.post('/rides/:rideId/arrived-at-pickup', authenticate as RequestHandler, arrivedAtPickup as RequestHandler);
router.post('/rides/:rideId/rider-call-attempted', authenticate as RequestHandler, riderCallAttempted as RequestHandler);
router.post('/rides/:rideId/start', authenticate as RequestHandler, startRide as RequestHandler);
router.post('/rides/:rideId/complete', authenticate as RequestHandler, completeRide as RequestHandler);
router.post('/rides/:rideId/payment-received', authenticate as RequestHandler, markPaymentReceived as RequestHandler);
router.post('/rides/:rideId/cancel', authenticate as RequestHandler, cancelRide as RequestHandler);

// Strike routes
router.get('/strikes', authenticate as RequestHandler, getDriverStrikes as RequestHandler);

// Earnings routes
router.get('/earnings', authenticate as RequestHandler, getDriverEarnings as RequestHandler);
router.get('/earnings/breakdown', authenticate as RequestHandler, getDriverEarningsBreakdown as RequestHandler);

// Payment routes
router.get('/payments/history', authenticate as RequestHandler, getDriverPaymentHistory as RequestHandler);
router.get('/payments/summary', authenticate as RequestHandler, getDriverPaymentSummary as RequestHandler);

// Location routes
router.post('/location', authenticate as RequestHandler, updateDriverLocation as RequestHandler);
router.get('/location', authenticate as RequestHandler, getDriverLocation as RequestHandler);
router.post('/availability', authenticate as RequestHandler, toggleDriverAvailability as RequestHandler);
router.post('/availability/heartbeat', authenticate as RequestHandler, driverHeartbeat as RequestHandler);

// Internal: broadcast new ride request to drivers (called by transit_backend)
router.post('/internal/broadcast-ride-request', broadcastRideRequest as RequestHandler);

// Subscription routes (GET /subscription/plans is public so app can show catalogue without auth)
router.get('/subscription/plans', getSubscriptionPlans as RequestHandler);
router.post('/subscription/create-order', authenticate as RequestHandler, createSubscriptionOrder as RequestHandler);
router.post('/subscription/activate', authenticate as RequestHandler, activateSubscription as RequestHandler);
router.get('/subscription', authenticate as RequestHandler, getCurrentSubscription as RequestHandler);

// Wallet routes
router.get('/wallet', authenticate as RequestHandler, getWalletBalance as RequestHandler);
router.get('/wallet/transactions', authenticate as RequestHandler, getWalletTransactions as RequestHandler);
router.post('/wallet/top-up/create-order', authenticate as RequestHandler, createTopUpOrder as RequestHandler);
router.post('/wallet/top-up/verify', authenticate as RequestHandler, verifyTopUp as RequestHandler);

// Referral routes
router.get('/referral', authenticate as RequestHandler, getReferralInfo as RequestHandler);

// Admin routes for driver management
router.get('/admin/list', authenticateAdmin as RequestHandler, getAllDrivers as RequestHandler);
router.put('/admin/approve/:driverId', authenticateAdmin as RequestHandler, approveDriver as RequestHandler);
router.get('/admin/approve', approveDriver as RequestHandler); // Email token-based approval
router.put('/admin/reject/:driverId', authenticateAdmin as RequestHandler, rejectDriver as RequestHandler);
router.get('/admin/reject', rejectDriver as RequestHandler); // Email token-based rejection
router.post('/admin/reject', rejectDriver as RequestHandler); // Email token-based rejection (POST)
router.put('/admin/suspend/:driverId', authenticateAdmin as RequestHandler, suspendDriver as RequestHandler);
router.get('/admin/suspend', suspendDriver as RequestHandler); // Email token-based suspension (optional)
router.post('/admin/suspend', suspendDriver as RequestHandler); // Email token-based suspension (POST)
router.patch('/admin/:driverId/approval', authenticateAdmin as RequestHandler, updateDriverApproval as RequestHandler);
router.get('/admin/strikes/:driverId', authenticateAdmin as RequestHandler, getDriverStrikesAdmin as RequestHandler);

export default router;