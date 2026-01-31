import { Request, Response, NextFunction } from "express";
export declare const register: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const resendRegistrationOtp: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const verifyRegistrationOTP: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const verifyDriverEmail: (req: Request, res: Response) => Promise<void>;
export declare const requestLoginOtp: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const verifyLoginOtp: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
/** @deprecated Use requestLoginOtp with body { phoneNumber } */
export declare const loginWithPhoneNumber: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
/** @deprecated Use verifyLoginOtp with body { phoneNumber, otp } */
export declare const verifyPhoneOTP: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const requestProfilePhoneOtp: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const verifyProfilePhoneOtp: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const getUserDetails: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const googleAuth: (req: Request, res: Response, next: NextFunction) => Promise<Response<any, Record<string, any>>>;
export declare const sendResetEmailController: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const resetPassword: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
