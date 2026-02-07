"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.sendResetEmailController = exports.googleAuth = exports.getUserDetails = exports.verifyProfilePhoneOtp = exports.requestProfilePhoneOtp = exports.verifyPhoneOTP = exports.loginWithPhoneNumber = exports.verifyLoginOtp = exports.requestLoginOtp = exports.verifyDriverEmail = exports.verifyRegistrationOTP = exports.resendRegistrationOtp = exports.register = void 0;
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
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
        let { email, firstName, lastName, phoneNumber } = validatedData;
        email = (email && email.trim()) || undefined;
        phoneNumber = (phoneNumber && phoneNumber.replace(/\D/g, "").slice(-10)) || undefined;
        if (!email && !phoneNumber) {
            return next(new AppError_1.default('At least one of email or phone number is required', 400));
        }
        // User table requires email – use placeholder when registering with phone only
        const normalizedEmail = email || `driver+91${phoneNumber}@driver.placeholder`;
        const normalizedPhone = phoneNumber || null;
        const existingEmail = await prismaClient_1.prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (existingEmail) {
            return next(new AppError_1.default('Email already exists', 400));
        }
        if (normalizedPhone) {
            const existingPhone = await prismaClient_1.prisma.user.findFirst({ where: { phoneNumber: normalizedPhone } });
            if (existingPhone) {
                return next(new AppError_1.default('Phone number already exists', 400));
            }
        }
        const hashedPassword = await bcrypt_1.default.hash((0, crypto_1.randomBytes)(32).toString('hex'), 10);
        const customId = await (0, generateUserId_1.generateUserId)(prismaClient_1.prisma, false, true);
        const user = await prismaClient_1.prisma.user.create({
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
        const driver = await prismaClient_1.prisma.driver.create({
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
        const channelsSent = [];
        if (user.phoneNumber) {
            await prismaClient_1.prisma.otp.create({
                data: { phoneNumber: user.phoneNumber, otp, expiresAt },
            });
            try {
                await (0, otpService_1.sendOtp)(user.phoneNumber, otp);
                channelsSent.push('phone');
            }
            catch (e) {
                console.error('Failed to send registration OTP via Fast2SMS:', e);
            }
        }
        if (email) {
            await prismaClient_1.prisma.verification.deleteMany({ where: { identifier: normalizedEmail } });
            await prismaClient_1.prisma.verification.create({
                data: {
                    identifier: normalizedEmail,
                    value: otp,
                    expiresAt,
                },
            });
            try {
                await (0, emailService_1.sendDriverOtpEmail)(normalizedEmail, otp, 'registration');
                channelsSent.push('email');
            }
            catch (e) {
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
// Resend registration OTP – send only to the channel requested (phone or email)
const resendRegistrationOtp = async (req, res, next) => {
    try {
        const { phoneNumber, email } = req.body;
        const byPhone = phoneNumber && String(phoneNumber).replace(/\D/g, '').length >= 10;
        const byEmail = email && String(email).trim().length > 0 && String(email).includes('@');
        if (byPhone && byEmail) {
            return next(new AppError_1.default('Send either phoneNumber or email, not both', 400));
        }
        if (!byPhone && !byEmail) {
            return next(new AppError_1.default('Either phone number or email is required', 400));
        }
        const user = await prismaClient_1.prisma.user.findFirst({
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
            await prismaClient_1.prisma.otp.deleteMany({ where: { phoneNumber: phone } });
            await prismaClient_1.prisma.otp.create({ data: { phoneNumber: phone, otp, expiresAt } });
            try {
                await (0, otpService_1.sendOtp)(phone, otp);
            }
            catch (e) {
                console.error('Failed to send registration OTP via Fast2SMS:', e);
            }
            return res.status(200).json({
                success: true,
                message: 'OTP sent again to your phone',
            });
        }
        else {
            if (user.emailVerified) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is already verified',
                });
            }
            const emailStr = String(email).trim();
            await prismaClient_1.prisma.verification.deleteMany({ where: { identifier: emailStr } });
            await prismaClient_1.prisma.verification.create({
                data: { identifier: emailStr, value: otp, expiresAt },
            });
            try {
                await (0, emailService_1.sendDriverOtpEmail)(emailStr, otp, 'registration');
            }
            catch (e) {
                console.error('Failed to send registration OTP via email:', e);
            }
            return res.status(200).json({
                success: true,
                message: 'OTP sent again to your email',
            });
        }
    }
    catch (error) {
        console.error('Error resending registration OTP:', error);
        return next(new AppError_1.default('Failed to resend OTP', 500));
    }
};
exports.resendRegistrationOtp = resendRegistrationOtp;
// Verify registration OTP – accept either phone or email; verify only that channel. Other channel can be verified later.
const verifyRegistrationOTP = async (req, res, next) => {
    try {
        const { phoneNumber, email, otp } = req.body;
        if (!otp) {
            return next(new AppError_1.default('OTP is required', 400));
        }
        const byPhone = phoneNumber && String(phoneNumber).replace(/\D/g, '').length >= 10;
        const byEmail = email && String(email).trim().length > 0 && String(email).includes('@');
        if (byPhone && byEmail) {
            return next(new AppError_1.default('Send either phoneNumber+otp or email+otp, not both', 400));
        }
        if (!byPhone && !byEmail) {
            return next(new AppError_1.default('Either phoneNumber or email is required', 400));
        }
        let user = null;
        const updateData = {};
        if (byPhone) {
            const phone = String(phoneNumber).replace(/\D/g, '').slice(-10);
            const otpRecord = await prismaClient_1.prisma.otp.findFirst({
                where: { phoneNumber: phone, otp, expiresAt: { gt: new Date() } },
                orderBy: { createdAt: 'desc' },
            });
            if (!otpRecord) {
                return next(new AppError_1.default('Invalid or expired OTP', 401));
            }
            user = await prismaClient_1.prisma.user.findFirst({
                where: { phoneNumber: phone, isDriver: true },
                include: { driver: { include: { driverDetails: true, driverStatus: true } } },
            });
            if (!user?.driver) {
                return next(new AppError_1.default('Driver not found', 404));
            }
            updateData.phoneNumberVerified = true;
            await prismaClient_1.prisma.otp.delete({ where: { id: otpRecord.id } });
        }
        else {
            const emailStr = String(email).trim();
            const verification = await prismaClient_1.prisma.verification.findFirst({
                where: { identifier: emailStr, value: otp, expiresAt: { gt: new Date() } },
                orderBy: { createdAt: 'desc' },
            });
            if (!verification) {
                return next(new AppError_1.default('Invalid or expired OTP', 401));
            }
            user = await prismaClient_1.prisma.user.findFirst({
                where: { email: emailStr, isDriver: true },
                include: { driver: { include: { driverDetails: true, driverStatus: true } } },
            });
            if (!user?.driver) {
                return next(new AppError_1.default('Driver not found', 404));
            }
            updateData.emailVerified = true;
            await prismaClient_1.prisma.verification.deleteMany({ where: { identifier: emailStr } });
        }
        await prismaClient_1.prisma.user.update({
            where: { id: user.id },
            data: updateData,
        });
        const accessToken = (0, jwtService_1.generateAccessToken)(user.driver.id);
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
        // No need to update Driver - email verification is handled in User table only
        // Redirect to frontend driver onboarding page
        return res.redirect(`${process.env.FRONTEND_APP_URL}/verified-email?success=true`);
    }
    catch (error) {
        console.error('Error during email verification:', error);
        return res.redirect(`${process.env.FRONTEND_APP_URL}/unverified-email?success=false`);
    }
};
exports.verifyDriverEmail = verifyDriverEmail;
// Driver login is OTP-only (no password). Request OTP by email or phone, then verify.
// Request OTP for driver login (email or phone)
const requestLoginOtp = async (req, res, next) => {
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
            const user = await prismaClient_1.prisma.user.findFirst({
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
            await prismaClient_1.prisma.verification.deleteMany({ where: { identifier: emailStr } });
            await prismaClient_1.prisma.verification.create({
                data: { identifier: emailStr, value: otp, expiresAt },
            });
            try {
                await (0, emailService_1.sendDriverOtpEmail)(emailStr, otp, 'login');
            }
            catch (e) {
                console.error('Failed to send login OTP via email:', e);
            }
            return res.status(200).json({
                success: true,
                message: 'OTP sent to your email',
            });
        }
        const phone = String(phoneNumber).replace(/\D/g, '').slice(-10);
        const user = await prismaClient_1.prisma.user.findFirst({
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
        await prismaClient_1.prisma.otp.deleteMany({ where: { phoneNumber: phone } });
        await prismaClient_1.prisma.otp.create({ data: { phoneNumber: phone, otp, expiresAt } });
        try {
            await (0, otpService_1.sendOtp)(phone, otp);
        }
        catch (e) {
            console.error('Failed to send login OTP via Fast2SMS:', e);
        }
        return res.status(200).json({
            success: true,
            message: 'OTP sent to your phone number',
        });
    }
    catch (error) {
        return next(new AppError_1.default('An error occurred while sending OTP', 500));
    }
};
exports.requestLoginOtp = requestLoginOtp;
// Verify OTP and login (email+otp or phoneNumber+otp)
const verifyLoginOtp = async (req, res, next) => {
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
        let user = null;
        if (byEmail) {
            const emailStr = String(email).trim();
            const verification = await prismaClient_1.prisma.verification.findFirst({
                where: { identifier: emailStr, value: otp, expiresAt: { gt: new Date() } },
                orderBy: { createdAt: 'desc' },
            });
            if (!verification) {
                return next(new AppError_1.default('Invalid or expired OTP', 401));
            }
            user = await prismaClient_1.prisma.user.findFirst({
                where: { email: emailStr, isDriver: true },
                include: {
                    driver: {
                        include: { driverDetails: true, driverStatus: true }
                    }
                }
            });
            if (!user?.driver) {
                return next(new AppError_1.default('Driver not found', 404));
            }
            await prismaClient_1.prisma.verification.deleteMany({ where: { identifier: emailStr } });
        }
        else {
            const phone = String(phoneNumber).replace(/\D/g, '').slice(-10);
            const otpRecord = await prismaClient_1.prisma.otp.findFirst({
                where: { phoneNumber: phone, otp, expiresAt: { gt: new Date() } },
                orderBy: { createdAt: 'desc' },
            });
            if (!otpRecord) {
                return next(new AppError_1.default('Invalid or expired OTP', 401));
            }
            user = await prismaClient_1.prisma.user.findFirst({
                where: { phoneNumber: phone, isDriver: true },
                include: {
                    driver: {
                        include: { driverDetails: true, driverStatus: true }
                    }
                }
            });
            if (!user?.driver) {
                return next(new AppError_1.default('Driver not found', 404));
            }
            await prismaClient_1.prisma.otp.delete({ where: { id: otpRecord.id } });
        }
        const driver = user.driver;
        const accessToken = (0, jwtService_1.generateAccessToken)(driver.id);
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
    }
    catch (error) {
        return next(new AppError_1.default('An error occurred during OTP verification', 500));
    }
};
exports.verifyLoginOtp = verifyLoginOtp;
/** @deprecated Use requestLoginOtp with body { phoneNumber } */
exports.loginWithPhoneNumber = exports.requestLoginOtp;
/** @deprecated Use verifyLoginOtp with body { phoneNumber, otp } */
exports.verifyPhoneOTP = exports.verifyLoginOtp;
// Profile phone verification (authenticated): add/change phone for logged-in driver
const requestProfilePhoneOtp = async (req, res, next) => {
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
        const driver = await prismaClient_1.prisma.driver.findUnique({
            where: { id: req.driver.id },
            include: { user: true },
        });
        if (!driver?.user) {
            return res.status(401).json({ success: false, message: 'Driver not found' });
        }
        const userId = driver.user.id;
        const existingUser = await prismaClient_1.prisma.user.findFirst({
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
        await prismaClient_1.prisma.otp.deleteMany({ where: { phoneNumber: phone } });
        await prismaClient_1.prisma.otp.create({ data: { phoneNumber: phone, otp, expiresAt } });
        try {
            await (0, otpService_1.sendOtp)(phone, otp);
        }
        catch (e) {
            console.error('Failed to send profile phone OTP:', e);
        }
        return res.status(200).json({
            success: true,
            message: 'OTP sent to your phone number',
        });
    }
    catch (error) {
        return next(new AppError_1.default('An error occurred while sending OTP', 500));
    }
};
exports.requestProfilePhoneOtp = requestProfilePhoneOtp;
const verifyProfilePhoneOtp = async (req, res, next) => {
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
        const otpRecord = await prismaClient_1.prisma.otp.findFirst({
            where: { phoneNumber: phone, otp: String(otp).trim(), expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
        });
        if (!otpRecord) {
            return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });
        }
        const driver = await prismaClient_1.prisma.driver.findUnique({
            where: { id: req.driver.id },
            include: { user: true },
        });
        if (!driver?.user) {
            return res.status(401).json({ success: false, message: 'Driver not found' });
        }
        const userId = driver.user.id;
        await prismaClient_1.prisma.$transaction([
            prismaClient_1.prisma.otp.delete({ where: { id: otpRecord.id } }),
            prismaClient_1.prisma.user.update({
                where: { id: userId },
                data: { phoneNumber: phone, phoneNumberVerified: true },
            }),
        ]);
        return res.status(200).json({
            success: true,
            message: 'Phone number verified and updated',
            data: { phoneNumber: phone },
        });
    }
    catch (error) {
        return next(new AppError_1.default('An error occurred during phone verification', 500));
    }
};
exports.verifyProfilePhoneOtp = verifyProfilePhoneOtp;
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
                },
                driverLocation: {
                    select: { isOnline: true, isAvailable: true }
                },
                vehicle: { take: 1, select: { vehicleType: true } }
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
        const loc = driver.driverLocation;
        const isOnline = loc?.isOnline === true;
        const isAvailable = driver.driverDetails?.isAvailable === true;
        // Map vehicle type for subscription filtering: sedan/suv/hatchback -> CAR, bike -> BIKE, auto -> AUTO
        const rawVehicleType = driver.vehicle?.[0]?.vehicleType?.toLowerCase?.();
        let vehicleTypeForPlans = null;
        if (rawVehicleType) {
            if (rawVehicleType === 'bike')
                vehicleTypeForPlans = 'BIKE';
            else if (rawVehicleType === 'auto')
                vehicleTypeForPlans = 'AUTO';
            else if (['sedan', 'suv', 'hatchback', 'car'].includes(rawVehicleType))
                vehicleTypeForPlans = 'CAR';
        }
        // Merge Driver.averageRating/totalRatings (updated when riders rate) into driverDetails for ratings display
        const driverDetails = driver.driverDetails ? {
            ...driver.driverDetails,
            rating: driver.averageRating ?? driver.driverDetails?.rating ?? 0,
            totalRides: driver.totalRatings ?? driver.driverDetails?.totalRides ?? 0,
        } : {
            rating: driver.averageRating ?? 0,
            totalRides: driver.totalRatings ?? 0,
        };
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
                driverDetails,
                isOnline,
                isAvailable,
                vehicleType: vehicleTypeForPlans
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
        // Check if User exists (email is in User table now)
        let existingUser = await prismaClient_1.prisma.user.findUnique({
            where: { email: email },
            include: {
                driver: {
                    include: {
                        driverDetails: true
                    }
                }
            }
        });
        let driver;
        if (!existingUser) {
            // Create User first (email/password are in User table)
            const newUser = await prismaClient_1.prisma.user.create({
                data: {
                    email: email,
                    name: name,
                    password: '', // Empty password for OAuth users
                    emailVerified: true, // Email is verified through Google
                    phoneNumberVerified: false,
                    isDriver: true,
                },
            });
            // Generate custom driver ID
            const customId = await (0, generateUserId_1.generateUserId)(prismaClient_1.prisma, false, true);
            // Then create Driver linked to User
            driver = await prismaClient_1.prisma.driver.create({
                data: {
                    userId: newUser.id, // REQUIRED: Link to User
                    name: name,
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
                    user: true,
                    driverDetails: true
                }
            });
        }
        else {
            // User exists, get or update driver
            if (!existingUser.isDriver) {
                // Update user to be a driver
                await prismaClient_1.prisma.user.update({
                    where: { id: existingUser.id },
                    data: { isDriver: true }
                });
            }
            if (!existingUser.driver) {
                // Create driver for existing user
                driver = await prismaClient_1.prisma.driver.create({
                    data: {
                        userId: existingUser.id, // REQUIRED: Link to User
                        name: name,
                        driverDetails: {
                            create: {
                                licenseNumber: `TEMP-${googleId}`,
                                profileImage: picture,
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
            }
            else {
                // Reload driver with user relation
                driver = await prismaClient_1.prisma.driver.findUnique({
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
                    await prismaClient_1.prisma.user.update({
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
        const accessToken = (0, jwtService_1.generateAccessToken)(driver.id);
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
        // Find User by phoneNumber (phoneNumber is in User table now)
        const user = await prismaClient_1.prisma.user.findFirst({
            where: { phoneNumber, isDriver: true },
            include: { driver: true }
        });
        if (!user || !user.driver) {
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
                expiresAt
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
        if ((0, date_fns_1.isAfter)(new Date(), otpRecord.expiresAt)) {
            return res.status(400).json({ error: 'OTP has expired' });
        }
        // Find User by phoneNumber (phoneNumber and password are in User table now)
        const user = await prismaClient_1.prisma.user.findFirst({
            where: { phoneNumber, isDriver: true }
        });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Hash the new password
        const hashedPassword = await bcrypt_1.default.hash(newPassword, 10);
        // Update User password (password is in User table, not Driver)
        await prismaClient_1.prisma.user.update({
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