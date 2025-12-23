import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            driver?: {
                id: string;
                email: string;
                name: string;
                phoneNumber: string;
                phoneNumberVerified: boolean;
            };
        }
    }
}
export declare const authenticate: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
