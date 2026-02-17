import { isValidPhoneNumber } from 'libphonenumber-js';
import { z } from 'zod';

// Driver signup – at least one of email or phone. No password – login via OTP only.
export const driverSignupSchema = z.object({
    email: z.union([z.string().email("Valid email when provided"), z.literal("")]).optional(),
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    phoneNumber: z
        .string()
        .optional()
        .refine((phone) => !phone || phone.replace(/\D/g, "").length < 10 || isValidPhoneNumber("+91" + phone.replace(/\D/g, "").slice(-10)), {
            message: "Invalid phone number",
        }),
    referralCode: z.string().min(1).max(20).optional(),
}).refine((data) => {
    const hasEmail = data.email && String(data.email).trim().length > 0;
    const hasPhone = data.phoneNumber && String(data.phoneNumber).replace(/\D/g, "").length >= 10;
    return hasEmail || hasPhone;
}, {
    message: "At least one of email or phone number is required",
    path: ["email"],
});

// Vehicle information validation schema
// `vehicleType` is optional – when provided from the app (Auto/Bike/Car/SUV),
// we normalize it server-side and store it on the Vehicle.
export const driverVehicleInfoSchema = z.object({
    model: z.string().min(1, "Vehicle model is required"),
    brand: z.string().min(1, "Vehicle brand is required"),
    number: z.string().min(1, "Vehicle number is required"),
    year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
    fuelType: z.string().min(1, "Fuel type is required"),
    seatingCapacity: z.number().int().min(1).max(50),
    hasCNG: z.boolean().optional(),
    hasElectric: z.boolean().optional(),
    roofTop: z.boolean().optional(),
    insuranceStatus: z.boolean().default(false),
    insuranceExpiryDate: z.string().optional(),
    registrationExpiryDate: z.string().optional(),
    drivingExperience: z.number().int().min(0, "Driving experience cannot be negative"),
    vehicleType: z.string().optional(), // e.g. "auto", "suv", "sedan", "hatchback", "bike"
});

// Driver document upload validation schema
export const driverDocumentSchema = z.object({
    documentType: z.enum([
        "DRIVING_LICENSE",
        "VEHICLE_REGISTRATION",
        "INSURANCE"
    ]),
    documentNumber: z.string(),
    aadharNumber: z.string()
        .regex(/^\d{12}$/, "Aadhaar number must be 12 digits"),
    panNumber: z.string()
        .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "PAN number must be in valid format (e.g., ABCDE1234F)"),
    driverLicenseNumber: z.string(),
    rcNumber: z.string(),
    insuranceNumber: z.string(),
    expiryDate: z.string().refine((val) => {
        if (!val) return true;
        const date = new Date(val);
        return !isNaN(date.getTime()) && date > new Date();
    }, {
        message: "Expiry date must be in the future",
    }),
}).refine((data) => {
    // When document type is DRIVING_LICENSE, require driver license number
    if (data.documentType === "DRIVING_LICENSE" && !data.driverLicenseNumber) {
        return false;
    }
    // When document type is VEHICLE_REGISTRATION, require RC number
    if (data.documentType === "VEHICLE_REGISTRATION" && !data.rcNumber) {
        return false;
    }
    return true;
}, {
    message: "Required document number missing for the selected document type",
    path: ["documentNumber"],
});

// Document data for multiple document upload
export const multipleDocumentDataSchema = z.array(z.object({
    documentType: z.enum([
        "DRIVING_LICENSE",
        "VEHICLE_REGISTRATION",
        "INSURANCE"
    ]),
    documentNumber: z.string().optional(),
    driverLicenseNumber: z.string().optional(),
    rcNumber: z.string().optional(),
    expiryDate: z.string().optional(),
})).refine(items => {
    return items.every(item => {
        // When document type is DRIVING_LICENSE, require driver license number
        if (item.documentType === "DRIVING_LICENSE" && !item.driverLicenseNumber) {
            return false;
        }
        // When document type is VEHICLE_REGISTRATION, require RC number
        if (item.documentType === "VEHICLE_REGISTRATION" && !item.rcNumber) {
            return false;
        }
        return true;
    });
}, {
    message: "Required document fields missing for one or more documents",
    path: ["documentData"],
});

// Driver verification token validation
export const verificationTokenSchema = z.object({
    token: z.string().min(1, "Verification token is required"),
});

// Subscription activation validation schema
// Two modes:
// 1) Catalogue plan: pass planId, backend derives amount/duration/minutes
// 2) Custom: omit planId and pass amount/durationDays/includedMinutes directly
export const subscriptionActivateSchema = z.object({
    planId: z.string().min(1).optional(),
    amount: z.number().positive("Amount must be positive").optional(),
    paymentMode: z.string().min(1, "Payment mode is required"),
    transactionId: z.string().nullable().optional(),
    durationDays: z.number().int().min(1).max(365).optional().default(30),
    includedMinutes: z.number().int().min(1).optional(),
    razorpay_order_id: z.string().nullable().optional(),
    razorpay_payment_id: z.string().nullable().optional(),
    razorpay_signature: z.string().nullable().optional(),
}).refine(data => {
    return !!data.planId || typeof data.amount === 'number';
}, {
    message: "Either planId or amount must be provided",
    path: ["planId"],
}).refine(data => {
    if (data.paymentMode === 'razorpay') {
        return !!(data.razorpay_order_id && data.razorpay_payment_id && data.razorpay_signature);
    }
    if (data.paymentMode === 'wallet') {
        return true; // No Razorpay fields needed when paying with wallet only
    }
    return true;
}, {
    message: "Razorpay payment requires razorpay_order_id, razorpay_payment_id, razorpay_signature",
    path: ["razorpay_order_id"],
}); 