"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.subscriptionActivateSchema = exports.verificationTokenSchema = exports.multipleDocumentDataSchema = exports.driverDocumentSchema = exports.driverVehicleInfoSchema = exports.driverSignupSchema = void 0;
const libphonenumber_js_1 = require("libphonenumber-js");
const zod_1 = require("zod");
// Driver signup – at least one of email or phone. No password – login via OTP only.
exports.driverSignupSchema = zod_1.z.object({
    email: zod_1.z.union([zod_1.z.string().email("Valid email when provided"), zod_1.z.literal("")]).optional(),
    firstName: zod_1.z.string().min(1, "First name is required"),
    lastName: zod_1.z.string().min(1, "Last name is required"),
    phoneNumber: zod_1.z
        .string()
        .optional()
        .refine((phone) => !phone || phone.replace(/\D/g, "").length < 10 || (0, libphonenumber_js_1.isValidPhoneNumber)("+91" + phone.replace(/\D/g, "").slice(-10)), {
        message: "Invalid phone number",
    }),
    referralCode: zod_1.z.string().min(1).max(20).optional(),
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
exports.driverVehicleInfoSchema = zod_1.z.object({
    model: zod_1.z.string().min(1, "Vehicle model is required"),
    brand: zod_1.z.string().min(1, "Vehicle brand is required"),
    number: zod_1.z.string().min(1, "Vehicle number is required"),
    year: zod_1.z.number().int().min(1900).max(new Date().getFullYear() + 1),
    fuelType: zod_1.z.string().min(1, "Fuel type is required"),
    seatingCapacity: zod_1.z.number().int().min(1).max(50),
    hasCNG: zod_1.z.boolean().optional(),
    hasElectric: zod_1.z.boolean().optional(),
    roofTop: zod_1.z.boolean().optional(),
    insuranceStatus: zod_1.z.boolean().default(false),
    insuranceExpiryDate: zod_1.z.string().optional(),
    registrationExpiryDate: zod_1.z.string().optional(),
    drivingExperience: zod_1.z.number().int().min(0, "Driving experience cannot be negative"),
    vehicleType: zod_1.z.string().optional(), // e.g. "auto", "suv", "sedan", "hatchback", "bike"
});
// Driver document upload validation schema
exports.driverDocumentSchema = zod_1.z.object({
    documentType: zod_1.z.enum([
        "DRIVING_LICENSE",
        "VEHICLE_REGISTRATION",
        "INSURANCE"
    ]),
    documentNumber: zod_1.z.string(),
    aadharNumber: zod_1.z.string()
        .regex(/^\d{12}$/, "Aadhaar number must be 12 digits"),
    panNumber: zod_1.z.string()
        .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "PAN number must be in valid format (e.g., ABCDE1234F)"),
    driverLicenseNumber: zod_1.z.string(),
    rcNumber: zod_1.z.string(),
    insuranceNumber: zod_1.z.string(),
    expiryDate: zod_1.z.string().refine((val) => {
        if (!val)
            return true;
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
exports.multipleDocumentDataSchema = zod_1.z.array(zod_1.z.object({
    documentType: zod_1.z.enum([
        "DRIVING_LICENSE",
        "VEHICLE_REGISTRATION",
        "INSURANCE"
    ]),
    documentNumber: zod_1.z.string().optional(),
    driverLicenseNumber: zod_1.z.string().optional(),
    rcNumber: zod_1.z.string().optional(),
    expiryDate: zod_1.z.string().optional(),
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
exports.verificationTokenSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, "Verification token is required"),
});
// Subscription activation validation schema
// Two modes:
// 1) Catalogue plan: pass planId, backend derives amount/duration/minutes
// 2) Custom: omit planId and pass amount/durationDays/includedMinutes directly
exports.subscriptionActivateSchema = zod_1.z.object({
    planId: zod_1.z.string().min(1).optional(),
    amount: zod_1.z.number().positive("Amount must be positive").optional(),
    paymentMode: zod_1.z.string().min(1, "Payment mode is required"),
    transactionId: zod_1.z.string().nullable().optional(),
    durationDays: zod_1.z.number().int().min(1).max(365).optional().default(30),
    includedMinutes: zod_1.z.number().int().min(1).optional(),
    razorpay_order_id: zod_1.z.string().nullable().optional(),
    razorpay_payment_id: zod_1.z.string().nullable().optional(),
    razorpay_signature: zod_1.z.string().nullable().optional(),
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
//# sourceMappingURL=driverValidation.js.map