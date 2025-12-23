import { Prisma } from '@prisma/client';
import { Request, Response,NextFunction } from "express";
import bcrypt from 'bcrypt';
import  {prisma}  from "../../prismaClient";
import AppError from '../../utils/AppError';
import { JwtPayload } from 'jsonwebtoken';
import { sendDriverApprovalEmail, sendDriverDocumentsNotificationEmail, sendDriverRejectionEmail, sendDriverVerificationEmail } from '../../utils/emailService';
import { generateToken, verifyToken, generateAccessToken } from '../../utils/jwtService';
import { uploadToS3 } from '../../utils/s3Upload';
import { driverDocumentSchema, driverSignupSchema, driverVehicleInfoSchema } from '../../validator/driverValidation';
import { sendOtp } from '../../utils/otpService';
import { OAuth2Client } from 'google-auth-library';
import { addHours, isAfter } from 'date-fns';

const client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  undefined, // Client Secret is not used for 'postmessage' type
  'postmessage' // This is required for mobile apps
);
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

export const register = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const validatedData = driverSignupSchema.parse(req.body);
        const { email, firstName, lastName, password, confirmPassword, phoneNumber } = validatedData;

        // Check if the email already exists
        const existingUser = await prisma.driver.findUnique({ where: { email } });
        if (existingUser) {
            return next(new AppError('Email already exists', 400));
        }
        if (password !== confirmPassword) {
            return next(new AppError('Passwords do not match', 400));
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

        // Generate and send OTP for phone verification
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        // Save OTP to database
        await prisma.otp.create({
            data: {
                phoneNumber,
                otp,
                expiresAt,
                type: 'REGISTRATION'
            }
        });

        // Send OTP via Fast2SMS
        // const otpResponse = await sendOtp(phoneNumber, otp);
        // if (!otpResponse || otpResponse.return === false) {
        //     return next(new AppError('Failed to send OTP. Please try again.', 500));
        // }

        return res.status(201).json({
            success: true,
            message: 'Driver account created successfully. Please verify your email and phone number.',
            otp,
            data: {
                driver: {
                    id: driver.id,
                    email: driver.email,
                    name: driver.name,
                    phoneNumber: driver.phoneNumber,
                    emailVerified: driver.emailVerified,
                    phoneNumberVerified: driver.phoneNumberVerified
                }
            }
        });
    } catch (error) {
        // Comprehensive error logging (using both console.log and console.error for PM2)
        const errorLog = `=== REGISTRATION ERROR START ===
Error type: ${error?.constructor?.name}
Error message: ${error instanceof Error ? error.message : String(error)}
Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`;
        
        console.log(errorLog);
        console.error(errorLog);
        
        try {
            console.log('Error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        } catch (e) {
            console.log('Error object (stringified):', String(error));
        }
        
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            const prismaLog = `Prisma error code: ${error.code}
Prisma error message: ${error.message}
Prisma error meta: ${JSON.stringify(error.meta)}`;
            console.log(prismaLog);
            console.error(prismaLog);
            if (error.code === 'P2002') {
                console.log('=== REGISTRATION ERROR END ===');
                return next(new AppError('Email or phone number already exists', 400));
            }
        }

        if (error instanceof AppError) {
            console.log('=== REGISTRATION ERROR END ===');
            return next(error);
        }

        // Check for Zod validation errors
        if (error && typeof error === 'object' && 'issues' in error) {
            const zodLog = `Zod validation error: ${JSON.stringify((error as any).issues, null, 2)}`;
            console.log(zodLog);
            console.error(zodLog);
            console.log('=== REGISTRATION ERROR END ===');
            return next(new AppError('Validation failed: ' + JSON.stringify((error as any).issues), 400));
        }

        console.log('=== REGISTRATION ERROR END ===');
        return next(new AppError('An error occurred during registration', 500));
    }
};

// Verify phone number during registration
export const verifyRegistrationOTP = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phoneNumber, otp } = req.body;

        // Find the most recent OTP for the phone number
        const otpRecord = await prisma.otp.findFirst({
            where: {
                phoneNumber,
                otp,
                type: 'REGISTRATION',
                expiresAt: {
                    gt: new Date()
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!otpRecord) {
            return next(new AppError('Invalid or expired OTP', 401));
        }

        // Find driver
        const driver = await prisma.driver.findUnique({
            where: { phoneNumber },
            include: {
                driverDetails: true,
                driverStatus: true
            }
        });

        if (!driver) {
            return next(new AppError('Driver not found', 404));
        }

        // Update driver's phone verification status
        await prisma.driver.update({
            where: { id: driver.id },
            data: { phoneNumberVerified: true }
        });

        // Delete used OTP
        await prisma.otp.delete({
            where: { id: otpRecord.id }
        });

        // Generate access token
        const accessToken = generateAccessToken(driver.id);

        return res.status(200).json({
            success: true,
            message: 'Phone number verified successfully',
            token: accessToken,
            data: {
                driver: {
                    id: driver.id,
                    name: driver.name,
                    email: driver.email,
                    phoneNumber: driver.phoneNumber,
                    emailVerified: driver.emailVerified,
                    phoneNumberVerified: driver.phoneNumberVerified,
                    driverDetails: driver.driverDetails,
                    driverStatus: driver.driverStatus
                }
            }
        });
    } catch (error) {
        return next(new AppError('An error occurred during OTP verification', 500));
    }
};

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

// Email login
export const loginWithEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;

        // Find driver by email
        const driver = await prisma.driver.findUnique({
            where: { email },
            include: {
                driverDetails: true,
                driverStatus: true
            }
        });

        if (!driver) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        if(driver.emailVerified === false) {
            return res.status(401).json({
                success: false,
                message: 'Please verify your email'
            })
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, driver.password);
        if (!isValidPassword) {
            return next(new AppError('Invalid email or password', 401));
        }

        // Generate access token
        const accessToken = generateAccessToken(driver.id);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token: accessToken,
            data: {
                driver: {
                    id: driver.id,
                    name: driver.name,
                    email: driver.email,
                    phoneNumber: driver.phoneNumber,
                    emailVerified: driver.emailVerified,
                    phoneNumberVerified: driver.phoneNumberVerified,
                    driverDetails: driver.driverDetails,
                    driverStatus: driver.driverStatus
                }
            }
        });
    } catch (error) {
        return next(new AppError('An error occurred during login', 500));
    }
};

// Request OTP for phone login
export const loginWithPhoneNumber = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phoneNumber } = req.body;

        // Find driver by phone number
        const driver = await prisma.driver.findUnique({
            where: { phoneNumber }
        });

        if (!driver) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number'
            })
        }

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        // Save OTP to database
        await prisma.otp.create({
            data: {
                phoneNumber,
                otp,
                expiresAt,
                type: 'LOGIN'
            }
        });

        // // Send OTP via Fast2SMS
        // const otpResponse = await sendOtp(phoneNumber, otp);
        // if (!otpResponse || otpResponse.return === false) {
        //     return next(new AppError('Failed to send OTP. Please try again.', 500));
        // }

        return res.status(200).json({
            success: true,
            message: 'OTP sent successfully to your phone number',
            otp
        });
    } catch (error) {
        return next(new AppError('An error occurred while sending OTP', 500));
    }
};

// Verify OTP and login
export const verifyPhoneOTP = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phoneNumber, otp } = req.body;

        // Find the most recent OTP for the phone number
        const otpRecord = await prisma.otp.findFirst({
            where: {
                phoneNumber,
                otp,
                type: 'LOGIN',
                expiresAt: {
                    gt: new Date()
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        if (!otpRecord) {
            return next(new AppError('Invalid or expired OTP', 401));
        }

        // Find driver
        const driver = await prisma.driver.findUnique({
            where: { phoneNumber },
            include: {
                driverDetails: true,
                driverStatus: true
            }
        });

        if (!driver) {
            return next(new AppError('Driver not found', 404));
        }

        // Generate access token
        const accessToken = generateAccessToken(driver.id);

        // Delete used OTP
        await prisma.otp.delete({
            where: { id: otpRecord.id }
        });

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token: accessToken,
            data: {
                driver: {
                    id: driver.id,
                    name: driver.name,
                    email: driver.email,
                    phoneNumber: driver.phoneNumber,
                    emailVerified: driver.emailVerified,
                    phoneNumberVerified: driver.phoneNumberVerified,
                    driverDetails: driver.driverDetails,
                    driverStatus: driver.driverStatus
                }
            }
        });
    } catch (error) {
        return next(new AppError('An error occurred during OTP verification', 500));
    }
};

//user details
export const getUserDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.driver?.id) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        const driver = await prisma.driver.findUnique({
            where: { id: req.driver.id },
            select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
                emailVerified: true,
                phoneNumberVerified: true,
                driverDetails: {
                    select: {
                        id: true,
                        licenseNumber: true,
                        isAvailable: true,
                        isVerified: true,
                        rating: true,
                        totalRides: true,
                        totalEarnings: true,
                        profileImage: true,
                        dateOfBirth: true,
                        gender: true,
                        address: true,
                        city: true,
                        state: true,
                        country: true
                    }
                }
            }
        });

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        // Split name into firstName and lastName
        const [firstName, ...lastNameParts] = driver.name.split(' ');
        const lastName = lastNameParts.join(' ');

        return res.status(200).json({
            success: true,
            data: {
                id: driver.id,
                firstName,
                lastName,
                email: driver.email,
                phoneNumber: driver.phoneNumber,
                emailVerified: driver.emailVerified,
                phoneNumberVerified: driver.phoneNumberVerified,
                driverDetails: driver.driverDetails
            }
        });
    } catch (error) {
        return next(new AppError('Failed to fetch driver details', 500));
    }
};

export const googleAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        message: 'ID token is required'
      });
    }

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token'
      });
    }

    const { email, name, picture, sub: googleId } = payload;

    // Check if driver exists
    let driver = await prisma.driver.findUnique({
      where: { email: email as string },
      include: {
        driverDetails: true
      }
    });

    if (!driver) {
      // Create new driver if doesn't exist
      driver = await prisma.driver.create({
        data: {
          email: email as string,
          name: name as string,
          password: '', // Empty password for OAuth users
          phoneNumber: '', // Empty phone number initially
          emailVerified: true, // Email is verified through Google
          phoneNumberVerified: false,
          driverDetails: {
            create: {
              licenseNumber: `TEMP-${googleId}`, // Temporary license number
              profileImage: picture as string,
              isAvailable: false,
              isVerified: false
            }
          }
        },
        include: {
          driverDetails: true
        }
      });
    } else if (!driver.emailVerified) {
      // Update email verification status if not verified
      driver = await prisma.driver.update({
        where: { id: driver.id },
        data: { emailVerified: true },
        include: {
          driverDetails: true
        }
      });
    }

    // Generate access token
    const accessToken = generateAccessToken(driver.id);

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        driver: {
          id: driver.id,
          name: driver.name,
          email: driver.email,
          emailVerified: driver.emailVerified,
          phoneNumberVerified: driver.phoneNumberVerified,
          profileImage: driver.driverDetails?.profileImage
        }
      }
    });
  } catch (error) {
    console.error('Google auth error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

export const sendResetEmailController = async (req: Request, res: Response, next: NextFunction) => {
  
    try {
      const { phoneNumber } = req.body;
  
      if (!phoneNumber) {
        return res.status(400).json({
          status: "error",
          message: "phoneNumber is required"
        });
      }
      const user = await prisma.driver.findUnique({ where: { phoneNumber } });
      if (!user) {
        return next(new AppError('User not found', 404));
      }
  
      // Generate OTP for password reset
      const otp = generateOTP();
  
      // // Generate a reset token and set expiration time
      const expiresAt = addHours(new Date(), 1); // Token expires in 1 hour
  
      await prisma.otp.create({ 
        data: { 
          phoneNumber, 
          otp, 
          expiresAt,
          type: 'PASSWORD_RESET'
        } 
      });
  
      // Send OTP via SMS
      await sendOtp(phoneNumber, otp);
  
      return res.status(200).json({ 
        message: 'Password reset OTP sent to your phone number',
        phoneNumber,
        otp
      });
  
    } catch (error) {
      console.error('Error sending reset email:', error);
      return next(new AppError('An error occurred while sending reset email', 500));
    }
  };


  export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  
    try {
      // Find user by reset token
      const { phoneNumber, otp, newPassword, confirmPassword } = req.body;
  
      if (!phoneNumber || !otp || !newPassword || !confirmPassword) {
        return res.status(400).json({
          status: "error",
          message: "Phone number, OTP, new password, and confirm password are required"
        });
      }
  
      // Check if passwords match
      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          status: "error",
          message: "Passwords do not match"
        });
      }
  
      const otpRecord = await prisma.otp.findFirst({
        where: {
          phoneNumber,
          otp,
          type: 'PASSWORD_RESET'
        },
      });
  
      if (!otpRecord) {
        return res.status(400).json({ error: 'Invalid OTP' });
      }
  
      // Check if the OTP has expired
      if (isAfter(new Date(), otpRecord.expiresAt)) {
        return res.status(400).json({ error: 'OTP has expired' });
      }
  
      // Find the user
      const user = await prisma.driver.findUnique({
        where: { phoneNumber }
      });
  
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
  
  
      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
  
      // Update user password and clear reset token
      await prisma.driver.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          resetToken: null,
          resetTokenExpiresAt: null,
        },
      });
  
      // Delete the OTP record
      await prisma.otp.delete({
        where: { id: otpRecord.id },
      });
      
      
      return res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
      console.error('Error resetting password:', error);
      return next(new AppError('An error occurred while resetting the password', 500));
    }
  };