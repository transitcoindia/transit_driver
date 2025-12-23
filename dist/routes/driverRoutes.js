"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authControllers_1 = require("../controllers/auth_controllers/authControllers");
const authMiddle_1 = require("../middleware/authMiddle");
const router = express_1.default.Router();
// Registration routes
router.post('/register', authControllers_1.register);
router.post('/verify-registration-otp', authControllers_1.verifyRegistrationOTP);
router.get('/verify-email', authControllers_1.verifyDriverEmail);
// Login routes
router.post('/login/email', authControllers_1.loginWithEmail);
router.post('/login/phoneNumber', authControllers_1.loginWithPhoneNumber);
router.post('/login/verify-otp', authControllers_1.verifyPhoneOTP);
// OAuth routes
router.post('/auth/google', authControllers_1.googleAuth);
// Protected routes
router.get('/profile', authMiddle_1.authenticate, authControllers_1.getUserDetails);
// Password reset routes
router.post('/password-reset/request-otp', authControllers_1.sendResetEmailController);
router.post('/password-reset/verify-otp', authControllers_1.resetPassword);
exports.default = router;
//# sourceMappingURL=driverRoutes.js.map