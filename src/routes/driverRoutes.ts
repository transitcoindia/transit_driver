import express, { RequestHandler } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {
    register,
    login,
    verifyDriverEmail,
} from '../controllers/authControllers';
import { authenticate } from '../middleware/auth';
import { limiter } from '../middleware/rateLimiter';
import {
    
    requestOTP,
    verifyOTPLogin,
} from '../controllers/driverController';
 

const driverRoutes = express.Router();

// Public routes for driver signup, login and email verification
driverRoutes.post('/signup', limiter, (register as unknown) as RequestHandler);

// Authentication routes
driverRoutes.post('/register', register);
driverRoutes.post('/login', login);
driverRoutes.post('/request-otp', requestOTP);
driverRoutes.post('/verify-otp', verifyOTPLogin);

// Protected routes
driverRoutes.use(authenticate);

export default driverRoutes;
