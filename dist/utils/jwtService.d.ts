import jwt from 'jsonwebtoken';
export declare const generateToken: (userId: string) => string;
export declare const generateAccessToken: (userId: string) => string;
export declare const verifyToken: (token: string) => string | jwt.JwtPayload;
