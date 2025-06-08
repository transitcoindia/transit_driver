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

// Password reset routes
router.post('/password-reset/request-otp', sendResetEmailController as RequestHandler);
router.post('/password-reset/verify-otp', resetPassword as RequestHandler);

export default router;