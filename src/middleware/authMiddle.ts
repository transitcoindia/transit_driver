import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import AppError from '../utils/AppError';

const prisma = new PrismaClient();

// Extend Express Request type to include driver
declare global {
  namespace Express {
    interface Request {
      driver?: {
        id: string;
        email: string | null;
        name: string;
        phoneNumber: string | null;
        phoneNumberVerified: boolean;
      };
    }
  }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Check for token in headers
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Authentication required. Please login.', 401));
    }

    const token = authHeader.split(' ')[1];
    
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined');
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET) as { id: string };
    
    // Get driver with necessary fields
    const driver = await prisma.driver.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
        phoneNumberVerified: true,
        driverDetails: true,
        driverStatus: true
      }
    });

    if (!driver) {
      return res.status(401).json({ message: 'Authentication failed. Please login.' });
    }


    // Check if driver's phone is verified
    if (!driver.phoneNumberVerified) {
      return res.status(401).json({ message: 'Phone number not verified. Please verify your phone number.' });
    }

    // Attach driver to request object
    req.driver = {
      id: driver.id,
      email: driver.email,
      name: driver.name,
      phoneNumber: driver.phoneNumber,
      phoneNumberVerified: driver.phoneNumberVerified
    };

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Invalid token. Please login again.', 401));
    }
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Token expired. Please login again.', 401));
    }
    return next(new AppError('Authentication failed. Please try again.', 500));
  }
};
