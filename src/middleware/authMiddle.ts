import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import AppError from '../utils/AppError';

const prisma = new PrismaClient();

// Extend Express Request type to include driver and admin user
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
      user?: {
        id: string;
        email: string;
        name: string | null;
        isAdmin: boolean;
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
    
    // Get driver with user relation (email/phone are in User table now)
    const driver = await prisma.driver.findUnique({
      where: { id: decoded.id },
      include: {
        user: true, // REQUIRED: Get email/phone from User table
        driverDetails: true,
        driverStatus: true
      }
    });

    if (!driver || !driver.user) {
      return res.status(401).json({ message: 'Authentication failed. Please login.' });
    }

    // Attach driver to request object (using User data for email/phone)
    // NOTE: We no longer block requests when phoneNumberVerified is false.
    //       Instead, downstream handlers (like profile fetch) can read the
    //       flag and the client can decide what to show. This allows
    //       partially-onboarded drivers to still fetch their profile.
    req.driver = {
      id: driver.id,
      email: driver.user.email,
      name: driver.name,
      phoneNumber: driver.user.phoneNumber || null,
      phoneNumberVerified: driver.user.phoneNumberVerified || false
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

/**
 * Admin authentication middleware
 * Checks if the authenticated user is an admin
 */
export const authenticateAdmin = async (req: Request, res: Response, next: NextFunction) => {
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
    
    // Get user (not driver) to check admin status
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        name: true,
        isAdmin: true,
      }
    });

    if (!user) {
      return res.status(401).json({ message: 'Authentication failed. Please login.' });
    }

    if (!user.isAdmin) {
      return next(new AppError('Unauthorized: Admin access required', 403));
    }

    // Attach user to request object
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin
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
