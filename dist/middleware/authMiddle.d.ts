import { Request, Response, NextFunction } from 'express';
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
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
/**
 * Admin authentication middleware
 * Checks if the authenticated user is an admin
 */
export declare const authenticateAdmin: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
