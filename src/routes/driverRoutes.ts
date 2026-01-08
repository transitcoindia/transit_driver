import express,{RequestHandler} from 'express';
import { 
    register, 
    verifyDriverEmail, 
    loginWithEmail,  
    loginWithPhoneNumber,
    verifyPhoneOTP,
    verifyRegistrationOTP,
    getUserDetails,
    googleAuth,
    sendResetEmailController,
    resetPassword
} from '../controllers/auth_controllers/authControllers';
import {
    getDriverRideHistory,
    getDriverRideDetails,
} from '../controllers/ride_controllers/rideHistory';
import {
    getDriverEarnings,
    getDriverEarningsBreakdown,
} from '../controllers/ride_controllers/earnings';
import {
    updateDriverLocation,
    toggleDriverAvailability,
    getDriverLocation,
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
    getCurrentSubscription,
} from '../controllers/ride_controllers/subscription';
import { updateDriverProfile } from '../controllers/auth_controllers/profile';
import { getDocumentStatus } from '../controllers/auth_controllers/documents';
import { authenticate } from '../middleware/authMiddle';

const router = express.Router();

// Registration routes
router.post('/register', register as RequestHandler);
router.post('/verify-registration-otp', verifyRegistrationOTP as RequestHandler);
router.get('/verify-email', verifyDriverEmail);

// Login routes
router.post('/login/email', loginWithEmail as RequestHandler);
router.post('/login/phoneNumber', loginWithPhoneNumber as RequestHandler);
router.post('/login/verify-otp', verifyPhoneOTP as RequestHandler);

// OAuth routes
router.post('/auth/google', (googleAuth as unknown) as RequestHandler);

// Protected routes
router.get('/profile', authenticate as RequestHandler, getUserDetails as RequestHandler);
router.put('/profile', authenticate as RequestHandler, updateDriverProfile as RequestHandler);
router.get('/documents/status', authenticate as RequestHandler, getDocumentStatus as RequestHandler);

// Password reset routes
router.post('/password-reset/request-otp', sendResetEmailController as RequestHandler);
router.post('/password-reset/verify-otp', resetPassword as RequestHandler);

// Ride history routes
router.get('/rides/history', authenticate as RequestHandler, getDriverRideHistory as RequestHandler);
router.get('/rides/:rideId', authenticate as RequestHandler, getDriverRideDetails as RequestHandler);
router.post('/rides/:rideId/rate-rider', authenticate as RequestHandler, rateRider as RequestHandler);

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

// Subscription routes
router.post('/subscription/activate', authenticate as RequestHandler, activateSubscription as RequestHandler);
router.get('/subscription', authenticate as RequestHandler, getCurrentSubscription as RequestHandler);

export default router;