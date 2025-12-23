"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificationTokenSchema = exports.multipleDocumentDataSchema = exports.driverDocumentSchema = exports.driverVehicleInfoSchema = exports.driverSignupSchema = void 0;
const libphonenumber_js_1 = require("libphonenumber-js");
const zod_1 = require("zod");
// Driver signup validation schema
exports.driverSignupSchema = zod_1.z.object({
    email: zod_1.z.string().email("Valid email is required"),
    firstName: zod_1.z.string().min(1, "First name is required"),
    lastName: zod_1.z.string().min(1, "Last name is required"),
    password: zod_1.z.string()
        .min(8, "Password must be at least 8 characters"),
    confirmPassword: zod_1.z.string(),
    phoneNumber: zod_1.z.string().refine((phone) => (0, libphonenumber_js_1.isValidPhoneNumber)("+91" + phone), {
        message: "Invalid phone number",
    }),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});
// Vehicle information validation schema
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
//# sourceMappingURL=driverValidation.js.map