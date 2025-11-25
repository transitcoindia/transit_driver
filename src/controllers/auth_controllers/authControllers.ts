import { Prisma } from '@prisma/client';
import { Request, Response,NextFunction } from "express";
import bcrypt from 'bcryptjs';
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
import { DriverWebSocketClient } from '../../services/websocketClient';

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
    } catch (error: unknown) {
        // Log the full error for debugging
        console.error('❌ Registration error details:', error);
        
        const isUniqueViolation = typeof error === 'object' && error !== null && (error as any).code === 'P2002';
        if (isUniqueViolation) {
            return next(new AppError('Email or phone number already exists', 400));
        }

        if (error instanceof AppError) {
            return next(error);
        }

        // Return more detailed error message
        const message = error instanceof Error ? error.message : 'An error occurred during registration';
        console.error('❌ Error message being sent to client:', message);
        return next(new AppError(message, 500));
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

let driverWebSocketClient: DriverWebSocketClient | null = null;

export const loginWithEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
        console.log(' Login request body:', req.body);
        console.log(' Login request headers:', req.headers);
        
        const { email, password } = req.body;

        // Validate required fields
        if (!email || !password) {
            console.error(' Missing required fields:', { email: !!email, password: !!password });
            return res.status(400).json({
                success: false,
                message: 'Email and password are required',
                received: { email: !!email, password: !!password }
            });
        }

        console.log(' Searching for driver with email:', email);

        // Find driver by email
        const driver = await prisma.driver.findUnique({
            where: { email },
            include: {
                driverDetails: true,
                driverStatus: true
            }
        });

        if (!driver) {
            console.log('❌ Driver not found for email:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        console.log('✅ Driver found:', { id: driver.id, name: driver.name });

        if(driver.emailVerified === false) {
            return res.status(401).json({
                success: false,
                message: 'Please verify your email'
            })
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, driver.password);
        if (!isValidPassword) {
            console.log('❌ Invalid password for driver:', driver.id);
            return next(new AppError('Invalid email or password', 401));
        }

        console.log('✅ Password verified for driver:', driver.id);

        // Generate access token
        const accessToken = generateAccessToken(driver.id);
        
        // If already connected, disconnect previous client
        if (driverWebSocketClient) {
          driverWebSocketClient.disconnect();
        }
        
        // Create new WebSocket client with dynamic driver ID and accessToken
        driverWebSocketClient = new DriverWebSocketClient(driver.id, accessToken);
        driverWebSocketClient.connect().catch((socketError: unknown) => {
          console.error('⚠️ Gateway socket connection failed (login will proceed):', socketError);
        });

        console.log('✅ Driver logged in successfully:', driver.id);

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
      console.error('❌ Login error:', error);
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
        let firstName = '';
        let lastName = '';
        
        if (driver.name) {
            const nameParts = driver.name.split(' ');
            firstName = nameParts[0] || '';
            lastName = nameParts.slice(1).join(' ') || '';
        }

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
        console.error('Error fetching driver details:', error);
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

// Profile Completion API
export const getProfileCompletion = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.driver?.id) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        const driver = await prisma.driver.findUnique({
            where: { id: req.driver.id },
            include: {
                driverDetails: true,
                documents: true,
                vehicle: true
            }
        });

        if (!driver) {
            return res.status(404).json({
                success: false,
                message: 'Driver not found'
            });
        }

        // Calculate completion percentage
        const completionData = calculateProfileCompletion(driver);
        
        return res.status(200).json({
            success: true,
            data: completionData
        });
    } catch (error) {
        console.error('Error fetching profile completion:', error);
        return next(new AppError('Failed to fetch profile completion', 500));
    }
};

// Helper function to calculate profile completion
function calculateProfileCompletion(driver: any) {
    const requiredFields = {
        // Basic Info (40% weight)
        basicInfo: {
            name: driver.name ? 1 : 0,
            email: driver.email ? 1 : 0,
            phoneNumber: driver.phoneNumber ? 1 : 0,
            emailVerified: driver.emailVerified ? 1 : 0,
            phoneNumberVerified: driver.phoneNumberVerified ? 1 : 0
        },
        
        // Driver Details (30% weight)
        driverDetails: {
            licenseNumber: driver.driverDetails?.licenseNumber ? 1 : 0,
            profileImage: driver.driverDetails?.profileImage ? 1 : 0,
            dateOfBirth: driver.driverDetails?.dateOfBirth ? 1 : 0,
            gender: driver.driverDetails?.gender ? 1 : 0,
            address: driver.driverDetails?.address ? 1 : 0,
            city: driver.driverDetails?.city ? 1 : 0,
            state: driver.driverDetails?.state ? 1 : 0,
            drivingExperience: driver.driverDetails?.drivingExperience ? 1 : 0,
            bankDetails: driver.driverDetails?.bankDetails ? 1 : 0
        },
        
        // Documents (20% weight)
        documents: {
            drivingLicense: driver.documents?.some((doc: any) => 
                doc.documentType === 'DRIVING_LICENSE' && doc.isVerified
            ) ? 1 : 0,
            vehicleRegistration: driver.documents?.some((doc: any) => 
                doc.documentType === 'VEHICLE_REGISTRATION' && doc.isVerified
            ) ? 1 : 0,
            insurance: driver.documents?.some((doc: any) => 
                doc.documentType === 'INSURANCE' && doc.isVerified
            ) ? 1 : 0
        },
        
        // Vehicle Info (10% weight)
        vehicle: {
            vehicleInfo: driver.vehicle ? 1 : 0,
            insuranceStatus: driver.vehicle?.insuranceStatus ? 1 : 0
        }
    };

    // Calculate scores for each category
    const basicScore = Object.values(requiredFields.basicInfo).reduce((a, b) => a + b, 0) / 5;
    const detailsScore = Object.values(requiredFields.driverDetails).reduce((a, b) => a + b, 0) / 9;
    const documentsScore = Object.values(requiredFields.documents).reduce((a, b) => a + b, 0) / 3;
    const vehicleScore = Object.values(requiredFields.vehicle).reduce((a, b) => a + b, 0) / 2;

    // Calculate weighted total percentage
    const totalPercentage = Math.round(
        (basicScore * 0.4 + detailsScore * 0.3 + documentsScore * 0.2 + vehicleScore * 0.1) * 100
    );

    // Identify missing fields
    const missingFields: string[] = [];
    if (!driver.name) missingFields.push('Full Name');
    if (!driver.emailVerified) missingFields.push('Email Verification');
    if (!driver.phoneNumberVerified) missingFields.push('Phone Verification');
    if (!driver.driverDetails?.licenseNumber) missingFields.push('License Number');
    if (!driver.driverDetails?.profileImage) missingFields.push('Profile Photo');
    if (!driver.driverDetails?.dateOfBirth) missingFields.push('Date of Birth');
    if (!driver.driverDetails?.gender) missingFields.push('Gender');
    if (!driver.driverDetails?.address) missingFields.push('Address');
    if (!driver.driverDetails?.city) missingFields.push('City');
    if (!driver.driverDetails?.state) missingFields.push('State');
    if (!driver.driverDetails?.drivingExperience) missingFields.push('Driving Experience');
    if (!driver.driverDetails?.bankDetails) missingFields.push('Bank Details');
    
    if (!driver.documents?.some((doc: any) => doc.documentType === 'DRIVING_LICENSE' && doc.isVerified)) {
        missingFields.push('Driving License Verification');
    }
    if (!driver.documents?.some((doc: any) => doc.documentType === 'VEHICLE_REGISTRATION' && doc.isVerified)) {
        missingFields.push('Vehicle Registration Verification');
    }
    if (!driver.documents?.some((doc: any) => doc.documentType === 'INSURANCE' && doc.isVerified)) {
        missingFields.push('Insurance Verification');
    }
    if (!driver.vehicle) missingFields.push('Vehicle Information');
    if (driver.vehicle && !driver.vehicle.insuranceStatus) missingFields.push('Vehicle Insurance Status');

    // Count total completed fields
    const totalCompleted = 
        Object.values(requiredFields.basicInfo).reduce((a, b) => a + b, 0) +
        Object.values(requiredFields.driverDetails).reduce((a, b) => a + b, 0) +
        Object.values(requiredFields.documents).reduce((a, b) => a + b, 0) +
        Object.values(requiredFields.vehicle).reduce((a, b) => a + b, 0);

    return {
        completionPercentage: totalPercentage,
        completedFields: totalCompleted,
        totalFields: 19,
        missingFields,
        isKYCComplete: totalPercentage >= 80 && documentsScore >= 0.66, // At least 2/3 documents verified
        breakdown: {
            basicInfo: Math.round(basicScore * 100),
            driverDetails: Math.round(detailsScore * 100),
            documents: Math.round(documentsScore * 100),
            vehicle: Math.round(vehicleScore * 100)
        },
        nextSteps: missingFields.slice(0, 3), // Show top 3 priorities
        verificationStatus: {
            emailVerified: driver.emailVerified,
            phoneVerified: driver.phoneNumberVerified,
            documentsVerified: documentsScore >= 0.66,
            profileComplete: totalPercentage >= 80
        }
    };
}

// Upload Profile Image
export const uploadProfileImage = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.driver?.id) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided. Please upload an image.'
            });
        }

        const driverId = req.driver.id;
        const file = req.file;

        console.log('📸 Processing profile image upload:', {
            driverId,
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size
        });

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.'
            });
        }

        // Validate file size (max 5MB)
        const maxSize = 5 * 1024 * 1024; // 5MB
        if (file.size > maxSize) {
            return res.status(400).json({
                success: false,
                message: 'File size too large. Maximum size is 5MB.'
            });
        }

        // Upload to S3 or save locally
        let imageUrl: string;
        
        try {
            // Try S3 upload first
            imageUrl = await uploadToS3(file, 'profile-images');
            console.log('✅ Image uploaded to S3:', imageUrl);
        } catch (uploadError) {
            console.log('⚠️ S3 upload failed, saving locally:', uploadError);
            // Fallback to local storage
            imageUrl = `/uploads/profile-images/${file.filename}`;
        }

        // Check if driver details exist
        const existingDriverDetails = await prisma.driverDetails.findUnique({
            where: { driverId }
        });

        if (existingDriverDetails) {
            // Update existing driver details
            await prisma.driverDetails.update({
                where: { driverId },
                data: {
                    profileImage: imageUrl,
                    updatedAt: new Date()
                }
            });
        } else {
            // Create driver details with profile image
            await prisma.driverDetails.create({
                data: {
                    driverId,
                    profileImage: imageUrl,
                    licenseNumber: '', // Will be updated later
                    isVerified: false
                }
            });
        }

        console.log('✅ Profile image saved to database');

        return res.status(200).json({
            success: true,
            message: 'Profile image uploaded successfully',
            data: {
                imageUrl,
                uploadedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('❌ Error uploading profile image:', error);
        return next(new AppError('Failed to upload profile image', 500));
    }
};