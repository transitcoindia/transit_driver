"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.sendResetEmailController = exports.googleAuth = exports.getUserDetails = exports.verifyPhoneOTP = exports.loginWithPhoneNumber = exports.loginWithEmail = exports.verifyDriverEmail = exports.verifyRegistrationOTP = exports.register = void 0;
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const prismaClient_1 = require("../../prismaClient");
const AppError_1 = __importDefault(require("../../utils/AppError"));
const emailService_1 = require("../../utils/emailService");
const jwtService_1 = require("../../utils/jwtService");
const driverValidation_1 = require("../../validator/driverValidation");
const otpService_1 = require("../../utils/otpService");
const google_auth_library_1 = require("google-auth-library");
const date_fns_1 = require("date-fns");
const generateUserId_1 = require("../../utils/generateUserId");
const client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID, undefined, // Client Secret is not used for 'postmessage' type
'postmessage' // This is required for mobile apps
);
const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};
const register = async (req, res, next) => {
    try {
        const validatedData = driverValidation_1.driverSignupSchema.parse(req.body);
        const { email, firstName, lastName, password, confirmPassword, phoneNumber } = validatedData;
        // Check if the email already exists in User table
        const existingUser = await prismaClient_1.prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return next(new AppError_1.default('Email already exists', 400));
        }
        if (password !== confirmPassword) {
            return next(new AppError_1.default('Passwords do not match', 400));
        }
        // Check if phone number already exists in User table
        if (phoneNumber) {
            const existingPhone = await prismaClient_1.prisma.user.findFirst({ where: { phoneNumber } });
            if (existingPhone) {
                return next(new AppError_1.default('Phone number already exists', 400));
            }
        }
        const hashedPassword = await bcrypt_1.default.hash(password, 10);
        // Generate custom user ID (D-001, D-002, etc.)
        const customId = await (0, generateUserId_1.generateUserId)(prismaClient_1.prisma, false, true);
        // First create User with isDriver flag
        const user = await prismaClient_1.prisma.user.create({
            data: {
                id: customId,
                email,
                name: `${firstName} ${lastName}`,
                password: hashedPassword,
                emailVerified: false,
                phoneNumber,
                phoneNumberVerified: false,
                isDriver: true, // Set driver flag
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
        // Then create Driver linked to User
        const driver = await prismaClient_1.prisma.driver.create({
            data: {
                userId: user.id, // Link to User
                name: `${firstName} ${lastName}`,
                email,
                phoneNumber,
                emailVerified: false,
                phoneNumberVerified: false,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        });
        const verificationToken = (0, jwtService_1.generateToken)(user.id);
        // Send verification email
        await (0, emailService_1.sendDriverVerificationEmail)(email, verificationToken);
        // Generate and send OTP for phone verification
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
        // Save OTP to database
        await prismaClient_1.prisma.otp.create({
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
    }
    catch (error) {
        // Comprehensive error logging (using both console.log and console.error for PM2)
        const errorLog = `=== REGISTRATION ERROR START ===
Error type: ${error?.constructor?.name}
Error message: ${error instanceof Error ? error.message : String(error)}
Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`;
        console.log(errorLog);
        console.error(errorLog);
        try {
            console.log('Error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        }
        catch (e) {
            console.log('Error object (stringified):', String(error));
        }
        if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
            const prismaLog = `Prisma error code: ${error.code}
Prisma error message: ${error.message}
Prisma error meta: ${JSON.stringify(error.meta)}`;
            console.log(prismaLog);
            console.error(prismaLog);
            if (error.code === 'P2002') {
                console.log('=== REGISTRATION ERROR END ===');
                return next(new AppError_1.default('Email or phone number already exists', 400));
            }
        }
        if (error instanceof AppError_1.default) {
            console.log('=== REGISTRATION ERROR END ===');
            return next(error);
        }
        // Check for Zod validation errors
        if (error && typeof error === 'object' && 'issues' in error) {
            const zodLog = `Zod validation error: ${JSON.stringify(error.issues, null, 2)}`;
            console.log(zodLog);
            console.error(zodLog);
            console.log('=== REGISTRATION ERROR END ===');
            return next(new AppError_1.default('Validation failed: ' + JSON.stringify(error.issues), 400));
        }
        console.log('=== REGISTRATION ERROR END ===');
        return next(new AppError_1.default('An error occurred during registration', 500));
    }
};
exports.register = register;
// Verify phone number during registration
const verifyRegistrationOTP = async (req, res, next) => {
    try {
        const { phoneNumber, otp } = req.body;
        // Find the most recent OTP for the phone number
        const otpRecord = await prismaClient_1.prisma.otp.findFirst({
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
            return next(new AppError_1.default('Invalid or expired OTP', 401));
        }
        // Find driver
        const driver = await prismaClient_1.prisma.driver.findUnique({
            where: { phoneNumber },
            include: {
                driverDetails: true,
                driverStatus: true
            }
        });
        if (!driver) {
            return next(new AppError_1.default('Driver not found', 404));
        }
        // Update User's phone verification status
        if (driver.userId) {
            await prismaClient_1.prisma.user.update({
                where: { id: driver.userId },
                data: { phoneNumberVerified: true }
            });
        }
        // Update driver's phone verification status
        await prismaClient_1.prisma.driver.update({
            where: { id: driver.id },
            data: { phoneNumberVerified: true }
        });
        // Delete used OTP
        await prismaClient_1.prisma.otp.delete({
            where: { id: otpRecord.id }
        });
        // Generate access token
        const accessToken = (0, jwtService_1.generateAccessToken)(driver.id);
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
    }
    catch (error) {
        return next(new AppError_1.default('An error occurred during OTP verification', 500));
    }
};
exports.verifyRegistrationOTP = verifyRegistrationOTP;
// Verify email
const verifyDriverEmail = async (req, res) => {
    const { token } = req.query;
    if (!token) {
        return res.redirect(`${process.env.FRONTEND_APP_URL}/unverified-email?success=false`);
    }
    try {
        // Verify the token and assert the type
        const decoded = (0, jwtService_1.verifyToken)(token);
        const userId = decoded.id;
        // Update User to set email as verified
        await prismaClient_1.prisma.user.update({
            where: { id: userId },
            data: { emailVerified: true },
        });
        // Also update Driver emailVerified to keep in sync
        const driver = await prismaClient_1.prisma.driver.findFirst({
            where: { userId: userId }
        });
        if (driver) {
            await prismaClient_1.prisma.driver.update({
                where: { id: driver.id },
                data: { emailVerified: true },
            });
        }
        // Redirect to frontend driver onboarding page
        return res.redirect(`${process.env.FRONTEND_APP_URL}/verified-email?success=true`);
    }
    catch (error) {
        console.error('Error during email verification:', error);
        return res.redirect(`${process.env.FRONTEND_APP_URL}/unverified-email?success=false`);
    }
};
exports.verifyDriverEmail = verifyDriverEmail;
// Email login
const loginWithEmail = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        // Find user by email (password is stored in User table)
        const user = await prismaClient_1.prisma.user.findUnique({
            where: { email },
            include: {
                driver: {
                    include: {
                        driverDetails: true,
                        driverStatus: true
                    }
                }
            }
        });
        if (!user || !user.isDriver || !user.driver) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }
        const driver = user.driver;
        if (user.emailVerified === false) {
            return res.status(401).json({
                success: false,
                message: 'Please verify your email'
            });
        }
        // Verify password from User table
        const isValidPassword = await bcrypt_1.default.compare(password, user.password);
        if (!isValidPassword) {
            return next(new AppError_1.default('Invalid email or password', 401));
        }
        // Generate access token using driver.id (keeping existing flow)
        const accessToken = (0, jwtService_1.generateAccessToken)(driver.id);
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
    }
    catch (error) {
        return next(new AppError_1.default('An error occurred during login', 500));
    }
};
exports.loginWithEmail = loginWithEmail;
// Request OTP for phone login
const loginWithPhoneNumber = async (req, res, next) => {
    try {
        const { phoneNumber } = req.body;
        // Find driver by phone number
        const driver = await prismaClient_1.prisma.driver.findUnique({
            where: { phoneNumber }
        });
        if (!driver) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone number'
            });
        }
        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
        // Save OTP to database
        await prismaClient_1.prisma.otp.create({
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
    }
    catch (error) {
        return next(new AppError_1.default('An error occurred while sending OTP', 500));
    }
};
exports.loginWithPhoneNumber = loginWithPhoneNumber;
// Verify OTP and login
const verifyPhoneOTP = async (req, res, next) => {
    try {
        const { phoneNumber, otp } = req.body;
        // Find the most recent OTP for the phone number
        const otpRecord = await prismaClient_1.prisma.otp.findFirst({
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
            return next(new AppError_1.default('Invalid or expired OTP', 401));
        }
        // Find driver
        const driver = await prismaClient_1.prisma.driver.findUnique({
            where: { phoneNumber },
            include: {
                driverDetails: true,
                driverStatus: true
            }
        });
        if (!driver) {
            return next(new AppError_1.default('Driver not found', 404));
        }
        // Generate access token
        const accessToken = (0, jwtService_1.generateAccessToken)(driver.id);
        // Delete used OTP
        await prismaClient_1.prisma.otp.delete({
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
    }
    catch (error) {
        return next(new AppError_1.default('An error occurred during OTP verification', 500));
    }
};
exports.verifyPhoneOTP = verifyPhoneOTP;
//user details
const getUserDetails = async (req, res, next) => {
    try {
        if (!req.driver?.id) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }
        const driver = await prismaClient_1.prisma.driver.findUnique({
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
    }
    catch (error) {
        return next(new AppError_1.default('Failed to fetch driver details', 500));
    }
};
exports.getUserDetails = getUserDetails;
const googleAuth = async (req, res, next) => {
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
        let driver = await prismaClient_1.prisma.driver.findUnique({
            where: { email: email },
            include: {
                driverDetails: true
            }
        });
        if (!driver) {
            // Create new driver if doesn't exist
            driver = await prismaClient_1.prisma.driver.create({
                data: {
                    email: email,
                    name: name,
                    password: '', // Empty password for OAuth users
                    phoneNumber: '', // Empty phone number initially
                    emailVerified: true, // Email is verified through Google
                    phoneNumberVerified: false,
                    driverDetails: {
                        create: {
                            licenseNumber: `TEMP-${googleId}`, // Temporary license number
                            profileImage: picture,
                            isAvailable: false,
                            isVerified: false
                        }
                    }
                },
                include: {
                    driverDetails: true
                }
            });
        }
        else if (!driver.emailVerified) {
            // Update email verification status if not verified
            driver = await prismaClient_1.prisma.driver.update({
                where: { id: driver.id },
                data: { emailVerified: true },
                include: {
                    driverDetails: true
                }
            });
        }
        // Generate access token
        const accessToken = (0, jwtService_1.generateAccessToken)(driver.id);
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
    }
    catch (error) {
        console.error('Google auth error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication failed'
        });
    }
};
exports.googleAuth = googleAuth;
const sendResetEmailController = async (req, res, next) => {
    try {
        const { phoneNumber } = req.body;
        if (!phoneNumber) {
            return res.status(400).json({
                status: "error",
                message: "phoneNumber is required"
            });
        }
        const user = await prismaClient_1.prisma.driver.findUnique({ where: { phoneNumber } });
        if (!user) {
            return next(new AppError_1.default('User not found', 404));
        }
        // Generate OTP for password reset
        const otp = generateOTP();
        // // Generate a reset token and set expiration time
        const expiresAt = (0, date_fns_1.addHours)(new Date(), 1); // Token expires in 1 hour
        await prismaClient_1.prisma.otp.create({
            data: {
                phoneNumber,
                otp,
                expiresAt,
                type: 'PASSWORD_RESET'
            }
        });
        // Send OTP via SMS
        await (0, otpService_1.sendOtp)(phoneNumber, otp);
        return res.status(200).json({
            message: 'Password reset OTP sent to your phone number',
            phoneNumber,
            otp
        });
    }
    catch (error) {
        console.error('Error sending reset email:', error);
        return next(new AppError_1.default('An error occurred while sending reset email', 500));
    }
};
exports.sendResetEmailController = sendResetEmailController;
const resetPassword = async (req, res, next) => {
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
        const otpRecord = await prismaClient_1.prisma.otp.findFirst({
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
        if ((0, date_fns_1.isAfter)(new Date(), otpRecord.expiresAt)) {
            return res.status(400).json({ error: 'OTP has expired' });
        }
        // Find the user
        const user = await prismaClient_1.prisma.driver.findUnique({
            where: { phoneNumber }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Hash the new password
        const hashedPassword = await bcrypt_1.default.hash(newPassword, 10);
        // Update user password and clear reset token
        await prismaClient_1.prisma.driver.update({
            where: { id: user.id },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpiresAt: null,
            },
        });
        // Delete the OTP record
        await prismaClient_1.prisma.otp.delete({
            where: { id: otpRecord.id },
        });
        return res.status(200).json({ message: 'Password reset successfully' });
    }
    catch (error) {
        console.error('Error resetting password:', error);
        return next(new AppError_1.default('An error occurred while resetting the password', 500));
    }
};
exports.resetPassword = resetPassword;
//# sourceMappingURL=authControllers.js.map