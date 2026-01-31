import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { Request, Response,NextFunction } from "express";
import bcrypt from 'bcrypt';
import  {prisma}  from "../../prismaClient";
import AppError from '../../utils/AppError';
import { JwtPayload } from 'jsonwebtoken';
import { sendDriverVerificationEmail, sendDriverOtpEmail } from '../../utils/emailService';
import { generateToken, verifyToken, generateAccessToken } from '../../utils/jwtService';
import { driverSignupSchema } from '../../validator/driverValidation';
import { sendOtp } from '../../utils/otpService';
import { OAuth2Client } from 'google-auth-library';
import { addHours, isAfter } from 'date-fns';
import { generateUserId } from '../../utils/generateUserId';

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
        let { email, firstName, lastName, phoneNumber } = validatedData;
        email = (email && email.trim()) || undefined;
        phoneNumber = (phoneNumber && phoneNumber.replace(/\D/g, "").slice(-10)) || undefined;

        if (!email && !phoneNumber) {
            return next(new AppError('At least one of email or phone number is required', 400));
        }

        // User table requires email – use placeholder when registering with phone only
        const normalizedEmail = email || `driver+91${phoneNumber}@driver.placeholder`;
        const normalizedPhone = phoneNumber || null;

        const existingEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingEmail) {
            return next(new AppError('Email already exists', 400));
        }
        if (normalizedPhone) {
            const existingPhone = await prisma.user.findFirst({ where: { phoneNumber: normalizedPhone } });
            if (existingPhone) {
                return next(new AppError('Phone number already exists', 400));
            }
        }

        const hashedPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
        const customId = await generateUserId(prisma, false, true);

        const user = await prisma.user.create({
            data: {
                id: customId,
                email: normalizedEmail,
                name: `${firstName} ${lastName}`,
                password: hashedPassword,
                emailVerified: false,
                phoneNumber: normalizedPhone,
                phoneNumberVerified: false,
                isDriver: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });

        const driver = await prisma.driver.create({
            data: {
                userId: user.id,
                name: `${firstName} ${lastName}`,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
            include: {
                user: true,
            },
        });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Send OTP only to the channel(s) the user registered with
        const channelsSent: string[] = [];
        if (user.phoneNumber) {
            await prisma.otp.create({
                data: { phoneNumber: user.phoneNumber, otp, expiresAt },
            });
            try {
                await sendOtp(user.phoneNumber, otp);
                channelsSent.push('phone');
            } catch (e) {
                console.error('Failed to send registration OTP via Fast2SMS:', e);
            }
        }
        if (email) {
            await prisma.verification.deleteMany({ where: { identifier: normalizedEmail } });
            await prisma.verification.create({
                data: {
                    identifier: normalizedEmail,
                    value: otp,
                    expiresAt,
                },
            });
            try {
                await sendDriverOtpEmail(normalizedEmail, otp, 'registration');
                channelsSent.push('email');
            } catch (e) {
                console.error('Failed to send registration OTP via email:', e);
            }
        }

        const verifyHint = channelsSent.length === 2
            ? 'Verify your email or phone with the OTP sent. You can verify the other channel later.'
            : channelsSent.includes('phone')
                ? 'Verify your phone with the OTP sent. You can add and verify email later.'
                : 'Verify your email with the OTP sent. You can add and verify phone later.';

        return res.status(201).json({
            success: true,
            message: `Driver account created. ${verifyHint}`,
            data: {
                driver: {
                    id: driver.id,
                    email: driver.user?.email === normalizedEmail ? (email || null) : driver.user?.email,
                    name: driver.name,
                    phoneNumber: driver.user?.phoneNumber || null,
                    emailVerified: driver.user?.emailVerified || false,
                    phoneNumberVerified: driver.user?.phoneNumberVerified || false,
                },
                verifyWith: channelsSent,
            },
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

// Resend registration OTP – send only to the channel requested (phone or email)
export const resendRegistrationOtp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phoneNumber, email } = req.body;
        const byPhone = phoneNumber && String(phoneNumber).replace(/\D/g, '').length >= 10;
        const byEmail = email && String(email).trim().length > 0 && String(email).includes('@');

        if (byPhone && byEmail) {
            return next(new AppError('Send either phoneNumber or email, not both', 400));
        }
        if (!byPhone && !byEmail) {
            return next(new AppError('Either phone number or email is required', 400));
        }

        const user = await prisma.user.findFirst({
            where: byPhone
                ? { phoneNumber: String(phoneNumber).replace(/\D/g, '').slice(-10), isDriver: true }
                : { email: String(email).trim(), isDriver: true },
            include: { driver: true },
        });
        if (!user || !user.driver) {
            return res.status(401).json({
                success: false,
                message: 'No driver account found for this ' + (byPhone ? 'phone number' : 'email'),
            });
        }

        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        if (byPhone) {
            if (user.phoneNumberVerified) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number is already verified',
                });
            }
            const phone = String(phoneNumber).replace(/\D/g, '').slice(-10);
            await prisma.otp.deleteMany({ where: { phoneNumber: phone } });
            await prisma.otp.create({ data: { phoneNumber: phone, otp, expiresAt } });
            try {
                await sendOtp(phone, otp);
            } catch (e) {
                console.error('Failed to send registration OTP via Fast2SMS:', e);
            }
            return res.status(200).json({
                success: true,
                message: 'OTP sent again to your phone',
            });
        } else {
            if (user.emailVerified) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is already verified',
                });
            }
            const emailStr = String(email).trim();
            await prisma.verification.deleteMany({ where: { identifier: emailStr } });
            await prisma.verification.create({
                data: { identifier: emailStr, value: otp, expiresAt },
            });
            try {
                await sendDriverOtpEmail(emailStr, otp, 'registration');
            } catch (e) {
                console.error('Failed to send registration OTP via email:', e);
            }
            return res.status(200).json({
                success: true,
                message: 'OTP sent again to your email',
            });
        }
    } catch (error) {
        console.error('Error resending registration OTP:', error);
        return next(new AppError('Failed to resend OTP', 500));
    }
};

// Verify registration OTP – accept either phone or email; verify only that channel. Other channel can be verified later.
export const verifyRegistrationOTP = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { phoneNumber, email, otp } = req.body;
        if (!otp) {
            return next(new AppError('OTP is required', 400));
        }
        const byPhone = phoneNumber && String(phoneNumber).replace(/\D/g, '').length >= 10;
        const byEmail = email && String(email).trim().length > 0 && String(email).includes('@');

        if (byPhone && byEmail) {
            return next(new AppError('Send either phoneNumber+otp or email+otp, not both', 400));
        }
        if (!byPhone && !byEmail) {
            return next(new AppError('Either phoneNumber or email is required', 400));
        }

        let user: { id: string; email: string; phoneNumber: string | null; emailVerified: boolean; phoneNumberVerified: boolean | null; driver: any } | null = null;
        const updateData: { phoneNumberVerified?: boolean; emailVerified?: boolean } = {};

        if (byPhone) {
            const phone = String(phoneNumber).replace(/\D/g, '').slice(-10);
            const otpRecord = await prisma.otp.findFirst({
                where: { phoneNumber: phone, otp, expiresAt: { gt: new Date() } },
                orderBy: { createdAt: 'desc' },
            });
            if (!otpRecord) {
                return next(new AppError('Invalid or expired OTP', 401));
            }
            user = await prisma.user.findFirst({
                where: { phoneNumber: phone, isDriver: true },
                include: { driver: { include: { driverDetails: true, driverStatus: true } } },
            }) as any;
            if (!user?.driver) {
                return next(new AppError('Driver not found', 404));
            }
            updateData.phoneNumberVerified = true;
            await prisma.otp.delete({ where: { id: otpRecord.id } });
        } else {
            const emailStr = String(email).trim();
            const verification = await prisma.verification.findFirst({
                where: { identifier: emailStr, value: otp, expiresAt: { gt: new Date() } },
                orderBy: { createdAt: 'desc' },
            });
            if (!verification) {
                return next(new AppError('Invalid or expired OTP', 401));
            }
            user = await prisma.user.findFirst({
                where: { email: emailStr, isDriver: true },
                include: { driver: { include: { driverDetails: true, driverStatus: true } } },
            }) as any;
            if (!user?.driver) {
                return next(new AppError('Driver not found', 404));
            }
            updateData.emailVerified = true;
            await prisma.verification.deleteMany({ where: { identifier: emailStr } });
        }

        await prisma.user.update({
            where: { id: user.id },
            data: updateData,
        });

        const accessToken = generateAccessToken(user.driver.id);
        const message = byPhone
            ? 'Phone number verified. You can verify email later from profile.'
            : 'Email verified. You can verify phone later from profile.';

        return res.status(200).json({
            success: true,
            message,
            token: accessToken,
            data: {
                driver: {
                    id: user.driver.id,
                    name: user.driver.name,
                    email: user.email,
                    phoneNumber: user.phoneNumber,
                    emailVerified: updateData.emailVerified ?? user.emailVerified,
                    phoneNumberVerified: updateData.phoneNumberVerified ?? user.phoneNumberVerified,
                    driverDetails: user.driver.driverDetails,
                    driverStatus: user.driver.driverStatus,
                },
            },
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
        const userId = (decoded as JwtPayload).id;

        // Update User to set email as verified
        await prisma.user.update({
            where: { id: userId },
            data: { emailVerified: true },
        });

        // No need to update Driver - email verification is handled in User table only

        // Redirect to frontend driver onboarding page
        return res.redirect(`${process.env.FRONTEND_APP_URL}/verified-email?success=true`);
    } catch (error) {
        console.error('Error during email verification:', error);
        return res.redirect(`${process.env.FRONTEND_APP_URL}/unverified-email?success=false`);
    }
};

// Driver login is OTP-only (no password). Request OTP by email or phone, then verify.

// Request OTP for driver login (email or phone)
export const requestLoginOtp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, phoneNumber } = req.body;
        const byEmail = email && String(email).trim().length > 0 && String(email).includes('@');
        const byPhone = phoneNumber && String(phoneNumber).replace(/\D/g, '').length >= 10;
        if ((byEmail && byPhone) || (!byEmail && !byPhone)) {
            return res.status(400).json({
                success: false,
                message: 'Send exactly one of email or phoneNumber'
            });
        }

        if (byEmail) {
            const emailStr = String(email).trim();
            const user = await prisma.user.findFirst({
                where: { email: emailStr, isDriver: true },
                include: { driver: true }
            });
            if (!user || !user.driver) {
                return res.status(401).json({ success: false, message: 'No driver account found for this email' });
            }
            if (!user.emailVerified) {
                return res.status(403).json({ success: false, message: 'Please verify your email first' });
            }
            const otp = generateOTP();
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
            await prisma.verification.deleteMany({ where: { identifier: emailStr } });
            await prisma.verification.create({
                data: { identifier: emailStr, value: otp, expiresAt },
            });
            try {
                await sendDriverOtpEmail(emailStr, otp, 'login');
            } catch (e) {
                console.error('Failed to send login OTP via email:', e);
            }
            return res.status(200).json({
                success: true,
                message: 'OTP sent to your email',
            });
        }

        const phone = String(phoneNumber).replace(/\D/g, '').slice(-10);
        const user = await prisma.user.findFirst({
            where: { phoneNumber: phone, isDriver: true },
            include: { driver: true }
        });
        if (!user || !user.driver) {
            return res.status(401).json({ success: false, message: 'No driver account found for this phone number' });
        }
        if (!user.phoneNumberVerified) {
            return res.status(403).json({ success: false, message: 'Please verify your phone number first' });
        }
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await prisma.otp.deleteMany({ where: { phoneNumber: phone } });
        await prisma.otp.create({ data: { phoneNumber: phone, otp, expiresAt } });
        try {
            await sendOtp(phone, otp);
        } catch (e) {
            console.error('Failed to send login OTP via Fast2SMS:', e);
        }
        return res.status(200).json({
            success: true,
            message: 'OTP sent to your phone number',
        });
    } catch (error) {
        return next(new AppError('An error occurred while sending OTP', 500));
    }
};

// Verify OTP and login (email+otp or phoneNumber+otp)
export const verifyLoginOtp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, phoneNumber, otp } = req.body;
        const byEmail = email && String(email).trim().length > 0 && String(email).includes('@');
        const byPhone = phoneNumber && String(phoneNumber).replace(/\D/g, '').length >= 10;
        if (!otp || (byEmail && byPhone) || (!byEmail && !byPhone)) {
            return res.status(400).json({
                success: false,
                message: 'Send (email or phoneNumber) and otp'
            });
        }

        let user: any = null;

        if (byEmail) {
            const emailStr = String(email).trim();
            const verification = await prisma.verification.findFirst({
                where: { identifier: emailStr, value: otp, expiresAt: { gt: new Date() } },
                orderBy: { createdAt: 'desc' },
            });
            if (!verification) {
                return next(new AppError('Invalid or expired OTP', 401));
            }
            user = await prisma.user.findFirst({
                where: { email: emailStr, isDriver: true },
                include: {
                    driver: {
                        include: { driverDetails: true, driverStatus: true }
                    }
                }
            });
            if (!user?.driver) {
                return next(new AppError('Driver not found', 404));
            }
            await prisma.verification.deleteMany({ where: { identifier: emailStr } });
        } else {
            const phone = String(phoneNumber).replace(/\D/g, '').slice(-10);
            const otpRecord = await prisma.otp.findFirst({
                where: { phoneNumber: phone, otp, expiresAt: { gt: new Date() } },
                orderBy: { createdAt: 'desc' },
            });
            if (!otpRecord) {
                return next(new AppError('Invalid or expired OTP', 401));
            }
            user = await prisma.user.findFirst({
                where: { phoneNumber: phone, isDriver: true },
                include: {
                    driver: {
                        include: { driverDetails: true, driverStatus: true }
                    }
                }
            });
            if (!user?.driver) {
                return next(new AppError('Driver not found', 404));
            }
            await prisma.otp.delete({ where: { id: otpRecord.id } });
        }

        const driver = user.driver;
        const accessToken = generateAccessToken(driver.id);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token: accessToken,
            data: {
                driver: {
                    id: driver.id,
                    name: driver.name,
                    email: user.email,
                    phoneNumber: user.phoneNumber,
                    emailVerified: user.emailVerified,
                    phoneNumberVerified: user.phoneNumberVerified,
                    driverDetails: driver.driverDetails,
                    driverStatus: driver.driverStatus
                }
            }
        });
    } catch (error) {
        return next(new AppError('An error occurred during OTP verification', 500));
    }
};

/** @deprecated Use requestLoginOtp with body { phoneNumber } */
export const loginWithPhoneNumber = requestLoginOtp;
/** @deprecated Use verifyLoginOtp with body { phoneNumber, otp } */
export const verifyPhoneOTP = verifyLoginOtp;

// Profile phone verification (authenticated): add/change phone for logged-in driver
export const requestProfilePhoneOtp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.driver?.id) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const { phoneNumber } = req.body;
        const raw = phoneNumber && String(phoneNumber).replace(/\D/g, '');
        if (!raw || raw.length < 10) {
            return res.status(400).json({
                success: false,
                message: 'Valid phone number is required',
            });
        }
        const phone = raw.slice(-10);

        const driver = await prisma.driver.findUnique({
            where: { id: req.driver.id },
            include: { user: true },
        });
        if (!driver?.user) {
            return res.status(401).json({ success: false, message: 'Driver not found' });
        }
        const userId = driver.user.id;

        const existingUser = await prisma.user.findFirst({
            where: { phoneNumber: phone, id: { not: userId } },
        });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'This phone number is already linked to another account',
            });
        }

        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await prisma.otp.deleteMany({ where: { phoneNumber: phone } });
        await prisma.otp.create({ data: { phoneNumber: phone, otp, expiresAt } });
        try {
            await sendOtp(phone, otp);
        } catch (e) {
            console.error('Failed to send profile phone OTP:', e);
        }
        return res.status(200).json({
            success: true,
            message: 'OTP sent to your phone number',
        });
    } catch (error) {
        return next(new AppError('An error occurred while sending OTP', 500));
    }
};

export const verifyProfilePhoneOtp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.driver?.id) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const { phoneNumber, otp } = req.body;
        const raw = phoneNumber && String(phoneNumber).replace(/\D/g, '');
        if (!raw || raw.length < 10 || !otp || String(otp).trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and OTP are required',
            });
        }
        const phone = raw.slice(-10);

        const otpRecord = await prisma.otp.findFirst({
            where: { phoneNumber: phone, otp: String(otp).trim(), expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
        });
        if (!otpRecord) {
            return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });
        }

        const driver = await prisma.driver.findUnique({
            where: { id: req.driver.id },
            include: { user: true },
        });
        if (!driver?.user) {
            return res.status(401).json({ success: false, message: 'Driver not found' });
        }
        const userId = driver.user.id;

        await prisma.$transaction([
            prisma.otp.delete({ where: { id: otpRecord.id } }),
            prisma.user.update({
                where: { id: userId },
                data: { phoneNumber: phone, phoneNumberVerified: true },
            }),
        ]);

        return res.status(200).json({
            success: true,
            message: 'Phone number verified and updated',
            data: { phoneNumber: phone },
        });
    } catch (error) {
        return next(new AppError('An error occurred during phone verification', 500));
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
            include: {
                user: true, // REQUIRED: Get email/phone from User table
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

        if (!driver || !driver.user) {
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
                email: driver.user.email, // From User table
                phoneNumber: driver.user.phoneNumber, // From User table
                emailVerified: driver.user.emailVerified, // From User table
                phoneNumberVerified: driver.user.phoneNumberVerified, // From User table
                approvalStatus: driver.approvalStatus, // PENDING, APPROVED, REJECTED, SUSPENDED
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

    // Check if User exists (email is in User table now)
    let existingUser = await prisma.user.findUnique({
      where: { email: email as string },
      include: {
        driver: {
          include: {
            driverDetails: true
          }
        }
      }
    });

    let driver: any;
    
    if (!existingUser) {
      // Create User first (email/password are in User table)
      const newUser = await prisma.user.create({
        data: {
          email: email as string,
          name: name as string,
          password: '', // Empty password for OAuth users
          emailVerified: true, // Email is verified through Google
          phoneNumberVerified: false,
          isDriver: true,
        },
      });

      // Generate custom driver ID
      const customId = await generateUserId(prisma, false, true);

      // Then create Driver linked to User
      driver = await prisma.driver.create({
        data: {
          userId: newUser.id, // REQUIRED: Link to User
          name: name as string,
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
          user: true,
          driverDetails: true
        }
      });
    } else {
      // User exists, get or update driver
      if (!existingUser.isDriver) {
        // Update user to be a driver
        await prisma.user.update({
          where: { id: existingUser.id },
          data: { isDriver: true }
        });
      }

      if (!existingUser.driver) {
        // Create driver for existing user
        driver = await prisma.driver.create({
          data: {
            userId: existingUser.id, // REQUIRED: Link to User
            name: name as string,
            driverDetails: {
              create: {
                licenseNumber: `TEMP-${googleId}`,
                profileImage: picture as string,
                isAvailable: false,
                isVerified: false
              }
            }
          },
          include: {
            user: true,
            driverDetails: true
          }
        });
      } else {
        // Reload driver with user relation
        driver = await prisma.driver.findUnique({
          where: { id: existingUser.driver.id },
          include: {
            user: true,
            driverDetails: true
          }
        });
        
        if (!driver) {
          return res.status(500).json({
            success: false,
            message: 'Driver not found'
          });
        }
        
        // Update email verification in User table if needed
        if (!existingUser.emailVerified) {
          await prisma.user.update({
            where: { id: existingUser.id },
            data: { emailVerified: true }
          });
          if (driver.user) {
            driver.user.emailVerified = true;
          }
        }
      }
    }

    // Type guard: ensure driver has user
    if (!driver.user) {
      return res.status(500).json({
        success: false,
        message: 'Driver user relation missing'
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
          email: driver.user.email, // From User table
          emailVerified: driver.user.emailVerified, // From User table
          phoneNumberVerified: driver.user.phoneNumberVerified || false, // From User table
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
      // Find User by phoneNumber (phoneNumber is in User table now)
      const user = await prisma.user.findFirst({ 
        where: { phoneNumber, isDriver: true },
        include: { driver: true }
      });
      if (!user || !user.driver) {
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
          expiresAt
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
          expiresAt: {
            gt: new Date()
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
  
      if (!otpRecord) {
        return res.status(400).json({ error: 'Invalid OTP' });
      }
  
      // Check if the OTP has expired
      if (isAfter(new Date(), otpRecord.expiresAt)) {
        return res.status(400).json({ error: 'OTP has expired' });
      }
  
      // Find User by phoneNumber (phoneNumber and password are in User table now)
      const user = await prisma.user.findFirst({
        where: { phoneNumber, isDriver: true }
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update User password (password is in User table, not Driver)
      await prisma.user.update({
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