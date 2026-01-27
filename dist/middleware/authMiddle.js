"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateAdmin = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const AppError_1 = __importDefault(require("../utils/AppError"));
const prisma = new client_1.PrismaClient();
const authenticate = async (req, res, next) => {
    try {
        // Check for token in headers
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(new AppError_1.default('Authentication required. Please login.', 401));
        }
        const token = authHeader.split(' ')[1];
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not defined');
        }
        // Verify token
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
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
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return next(new AppError_1.default('Invalid token. Please login again.', 401));
        }
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return next(new AppError_1.default('Token expired. Please login again.', 401));
        }
        return next(new AppError_1.default('Authentication failed. Please try again.', 500));
    }
};
exports.authenticate = authenticate;
/**
 * Admin authentication middleware
 * Checks if the authenticated user is an admin
 */
const authenticateAdmin = async (req, res, next) => {
    try {
        // Check for token in headers
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(new AppError_1.default('Authentication required. Please login.', 401));
        }
        const token = authHeader.split(' ')[1];
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not defined');
        }
        // Verify token
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
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
            return next(new AppError_1.default('Unauthorized: Admin access required', 403));
        }
        // Attach user to request object
        req.user = {
            id: user.id,
            email: user.email,
            name: user.name,
            isAdmin: user.isAdmin
        };
        next();
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return next(new AppError_1.default('Invalid token. Please login again.', 401));
        }
        if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return next(new AppError_1.default('Token expired. Please login again.', 401));
        }
        return next(new AppError_1.default('Authentication failed. Please try again.', 500));
    }
};
exports.authenticateAdmin = authenticateAdmin;
//# sourceMappingURL=authMiddle.js.map