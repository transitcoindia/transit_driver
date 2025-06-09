import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { generateOTP, verifyOTP } from '../utils/otpService';
import { sendSMS } from '../utils/smsService';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// ... existing code ...

export const requestOTP = async (req: Request, res: Response) => {
    try {
        const { phoneNumber } = req.body;

        const driver = await prisma.driver.findUnique({
            where: { phoneNumber }
        });

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await prisma.driver.update({
            where: { id: driver.id },
            data: {
                otp,
                otpExpiry
            }
        });

        // Send OTP via SMS
        const message = `Your OTP for login is: ${otp}. Valid for 10 minutes.`;
        await sendSMS(phoneNumber, message);

        res.status(200).json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Error requesting OTP:', error);
        res.status(500).json({ message: 'Error requesting OTP' });
    }
};

export const verifyOTPLogin = async (req: Request, res: Response) => {
    try {
        const { phoneNumber, otp } = req.body;

        const driver = await prisma.driver.findUnique({
            where: { phoneNumber }
        });

        if (!driver) {
            return res.status(404).json({ message: 'Driver not found' });
        }

        if (!driver.otp || !driver.otpExpiry) {
            return res.status(400).json({ message: 'No OTP requested' });
        }

        if (new Date() > driver.otpExpiry) {
            return res.status(400).json({ message: 'OTP expired' });
        }

        if (!verifyOTP(driver.otp, otp)) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // Clear OTP after successful verification
        await prisma.driver.update({
            where: { id: driver.id },
            data: {
                otp: null,
                otpExpiry: null
            }
        });

        const token = jwt.sign(
            { driverId: driver.id },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.status(200).json({
            message: 'Login successful',
            token,
            driver: {
                id: driver.id,
                email: driver.email,
                phoneNumber: driver.phoneNumber,
                firstName: driver.firstName,
                lastName: driver.lastName,
                isVerified: driver.isVerified,
                isActive: driver.isActive
            }
        });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ message: 'Error verifying OTP' });
    }
}; 