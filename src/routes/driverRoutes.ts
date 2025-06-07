import express, { RequestHandler } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {
    register,
    verifyDriverEmail,
} from '../controllers/authControllers';
import { authenticate } from '../middleware/auth';
import { limiter } from '../middleware/rateLimiter';

const driverRoutes = express.Router();

// Public routes for driver signup, login and email verification
driverRoutes.post('/signup', limiter, (register as unknown) as RequestHandler);


export default driverRoutes;
