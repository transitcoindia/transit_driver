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
import { sendOtp } from '../utils/otpService';

const generateOTP = (): string=>{
 const min = 100000; // 6 digits minimum
    const max = 999999; // 6 digits maximum
    const otp = Math.floor(Math.random() * (max - min + 1)) + min;
    return otp.toString();
};




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
                name:`${firstName} ${lastName}`,
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

export const login =async (req:Request,res:Response,next:NextFunction)=>{

    const {email, phoneNumber}= req.body;
    if(email){
        const {password}= req.body;
        const driver = await prisma.driver.findUnique({where:{email}});
        if(!driver){
            return next(new AppError('Invalid credentials',401));
        }
        const isPasswordValid = await bcrypt.compare(password,driver.password);
        if(!isPasswordValid){
            return next(new AppError('Invalid credentials',401));
        }
        const token = generateToken(driver.id);
        return res.status(200).json({
            message: 'Login successful',
            token,
        });
    } else if(phoneNumber){
        const driver = await prisma.driver.findFirst({ where: { phoneNumber } });
        if (!driver) {
            return next(new AppError('Driver not found', 404));
        }
        
        // Generate OTP first
        const otp = generateOTP();
        
        // Create a new request object with phoneNumber and otp
        const otpReq = {
            ...req,
            body: {
                phoneNumber: phoneNumber,
                otp: otp
            }
        } as Request;
        
        // Call sendOTPToPhoneNumber with the modified request
        await sendOTPToPhoneNumber(otpReq, res, next);
        
        // If sendOTPToPhoneNumber was successful, call verifyOTP
        if (res.statusCode === 200) {
            // Create request for verifyOTP
            const verifyReq = {
                ...req,
                body: {
                    phoneNumber: phoneNumber,
                    otp: otp
                }
            } as Request;
            
            // Call verifyOTP
            await verifyOTP(verifyReq, res, next);
            
            // If verifyOTP was also successful, generate JWT token
            if (res.statusCode === 200) {
                const token = generateToken(driver.id);
                return res.status(200).json({
                    message: 'Login successful',
                    token,
                    driver: {
                        id: driver.id,
                        email: driver.email,
                        name: driver.name,
                        phoneNumber: driver.phoneNumber,
                        phoneNumberVerified: true
                    }
                });
            }
        }
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

export const resendVerificationEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      return next(new AppError('Email is required', 400));
    }

    // Find the user by email
    const user = await prisma.driver.findUnique({ where: { email } });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Check if email is already verified
    if (user.emailVerified) {
      return next(new AppError('Email is already verified', 400));
    }

    // Generate a verification token
    const verificationToken = generateToken(user.id);

    // Send verification email
    await sendDriverVerificationEmail(email, verificationToken);

    return res.status(200).json({ message: 'Verification email sent successfully' });
  } catch (error) {
    console.error('Error sending verification email:', error);
    return next(new AppError('An error occurred while sending verification email', 500));
  }
};


export const sendOTPToPhoneNumber = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phoneNumber,otp } = req.body;

        if (!phoneNumber) {
            return next(new AppError('Phone number is required', 400));
        }

        const driver = await prisma.driver.findFirst({ where: { phoneNumber } });

        if (!driver) {
            return next(new AppError('No account found with this phone number', 404));
        }

        // Generate OTP
        //const otp = generateOTP();
        
        await sendOtp(phoneNumber, otp); // Send OTP using fast2sms

        // Save OTP to the database with an expiration time
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP expires in 10 minutes

        await prisma.otp.create({
            data: {
                phoneNumber,
                otp,
                expiresAt,
            },
        });
        
        console.log(`OTP ${otp} sent to phone number ${phoneNumber}`);
        return res.status(200).json({ 
            message: 'OTP sent successfully',
        });
    } 
    catch (error) {
        console.error('Error sending OTP:', error);
        return res.status(500).json({ error: 'Failed to send OTP' });
    }
};


export const verifyOTP = async (req: Request, res: Response, next: NextFunction) => {
    try{
        const {phoneNumber,otp}=req.body;
        const otpRecord = await prisma.otp.findFirst({where:{phoneNumber,otp}});
        if(!otpRecord){
            return next(new AppError('Invalid OTP',401));
        }
        const currentTime = new Date();
        if(otpRecord.expiresAt < currentTime){
            return next(new AppError('OTP expired',401));
        } 
        await prisma.driver.update({
            where:{phoneNumber},
            data:{phoneNumberVerified:true}
        });
        return res.status(200).json({message:'OTP verified successfully'});

    } catch(error){
      console.error('Error verifying OTP:', error);
      return res.status(500).json({ error: 'Failed to verify OTP' });
    }
}


