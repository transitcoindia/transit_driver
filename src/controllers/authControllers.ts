import { Prisma } from '@prisma/client';
import { Request, Response,NextFunction } from "express";
import bcrypt from 'bcrypt';
import  {prisma}  from "../prismaClient";
import AppError from '../utils/AppError';
import { JwtPayload } from 'jsonwebtoken';
import { sendDriverApprovalEmail, sendDriverDocumentsNotificationEmail, sendDriverRejectionEmail, sendDriverVerificationEmail } from '../utils/emailService';
import { generateToken, verifyToken, generateAccessToken } from '../utils/jwtService';
import { uploadToS3 } from '../utils/s3Upload';
import { driverDocumentSchema, driverSignupSchema, driverVehicleInfoSchema } from '../validator/driverValidation';

export const register = async (req: Request, res: Response, next: NextFunction) => {

    try{
        
        const validatedData = driverSignupSchema.parse(req.body);
        const { email, firstName, lastName, password, confirmPassword, phoneNumber } = validatedData;

        // Check if the email already exists
        const existingUser = await prisma.driver.findUnique({ where: { email } });
        if (existingUser) {
            return next(new AppError('Email already exists', 400));
        }

        // Check if phone number already exists
        if (phoneNumber) {
            const existingPhone = await prisma.driver.findFirst({ where: { phoneNumber } });
            if (existingPhone) {
                return next(new AppError('Phone number already exists', 400));
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user with isDriver flag
        const driver = await prisma.driver.create({
            data: {
                email,
                name: `${firstName} ${lastName}`,
                password: hashedPassword,
                emailVerified: false,
                phoneNumber,
                phoneNumberVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        const verificationToken = generateToken(driver.id);

        // Send verification email
        await sendDriverVerificationEmail(email, verificationToken);

        return res.status(201).json({
            message: 'Driver account created successfully. Please verify your email.',
            user: { id: driver.id, email: driver.email, name: driver.name }
        });
    }
    catch(error){

        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            if (error.code === 'P2002') {
                return next(new AppError('Email or phone number already exists', 400));
            }
        }

        if (error instanceof AppError) {
            return next(error);
        }

        return next(new AppError('An error occurred during registration', 500));

    }
    

}

// Verify email
export const verifyDriverEmail = async (req: Request, res: Response) => {
    const { token } = req.query;

    if (!token) {
        return res.redirect(`${process.env.FRONTEND_APP_URL}/unverified-email?success=false`);
    }

    try {
        // Verify the token and assert the type
        const decoded = verifyToken(token as string) as JwtPayload;

        // Update user to set email as verified
        await prisma.driver.update({
            where: { id: (decoded as JwtPayload).id },
            data: { emailVerified: true },
        });

        // Redirect to frontend driver onboarding page
        return res.redirect(`${process.env.FRONTEND_APP_URL}/verified-email?success=true`);
    } catch (error) {
        console.error('Error during email verification:', error);
        return res.redirect(`${process.env.FRONTEND_APP_URL}/unverified-email?success=false`);
    }
};


