import { z } from 'zod';
export declare const driverSignupSchema: z.ZodEffects<z.ZodObject<{
    email: z.ZodString;
    firstName: z.ZodString;
    lastName: z.ZodString;
    password: z.ZodString;
    confirmPassword: z.ZodString;
    phoneNumber: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    phoneNumber: string;
    firstName: string;
    lastName: string;
    confirmPassword: string;
}, {
    email: string;
    password: string;
    phoneNumber: string;
    firstName: string;
    lastName: string;
    confirmPassword: string;
}>, {
    email: string;
    password: string;
    phoneNumber: string;
    firstName: string;
    lastName: string;
    confirmPassword: string;
}, {
    email: string;
    password: string;
    phoneNumber: string;
    firstName: string;
    lastName: string;
    confirmPassword: string;
}>;
export declare const driverVehicleInfoSchema: z.ZodObject<{
    model: z.ZodString;
    brand: z.ZodString;
    number: z.ZodString;
    year: z.ZodNumber;
    fuelType: z.ZodString;
    seatingCapacity: z.ZodNumber;
    hasCNG: z.ZodOptional<z.ZodBoolean>;
    hasElectric: z.ZodOptional<z.ZodBoolean>;
    roofTop: z.ZodOptional<z.ZodBoolean>;
    insuranceStatus: z.ZodDefault<z.ZodBoolean>;
    insuranceExpiryDate: z.ZodOptional<z.ZodString>;
    registrationExpiryDate: z.ZodOptional<z.ZodString>;
    drivingExperience: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    number: string;
    model: string;
    drivingExperience: number;
    brand: string;
    year: number;
    fuelType: string;
    seatingCapacity: number;
    insuranceStatus: boolean;
    hasCNG?: boolean | undefined;
    hasElectric?: boolean | undefined;
    roofTop?: boolean | undefined;
    insuranceExpiryDate?: string | undefined;
    registrationExpiryDate?: string | undefined;
}, {
    number: string;
    model: string;
    drivingExperience: number;
    brand: string;
    year: number;
    fuelType: string;
    seatingCapacity: number;
    hasCNG?: boolean | undefined;
    hasElectric?: boolean | undefined;
    roofTop?: boolean | undefined;
    insuranceStatus?: boolean | undefined;
    insuranceExpiryDate?: string | undefined;
    registrationExpiryDate?: string | undefined;
}>;
export declare const driverDocumentSchema: z.ZodEffects<z.ZodObject<{
    documentType: z.ZodEnum<["DRIVING_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE"]>;
    documentNumber: z.ZodString;
    aadharNumber: z.ZodString;
    panNumber: z.ZodString;
    driverLicenseNumber: z.ZodString;
    rcNumber: z.ZodString;
    insuranceNumber: z.ZodString;
    expiryDate: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    aadharNumber: string;
    panNumber: string;
    documentType: "DRIVING_LICENSE" | "VEHICLE_REGISTRATION" | "INSURANCE";
    documentNumber: string;
    expiryDate: string;
    driverLicenseNumber: string;
    rcNumber: string;
    insuranceNumber: string;
}, {
    aadharNumber: string;
    panNumber: string;
    documentType: "DRIVING_LICENSE" | "VEHICLE_REGISTRATION" | "INSURANCE";
    documentNumber: string;
    expiryDate: string;
    driverLicenseNumber: string;
    rcNumber: string;
    insuranceNumber: string;
}>, {
    aadharNumber: string;
    panNumber: string;
    documentType: "DRIVING_LICENSE" | "VEHICLE_REGISTRATION" | "INSURANCE";
    documentNumber: string;
    expiryDate: string;
    driverLicenseNumber: string;
    rcNumber: string;
    insuranceNumber: string;
}, {
    aadharNumber: string;
    panNumber: string;
    documentType: "DRIVING_LICENSE" | "VEHICLE_REGISTRATION" | "INSURANCE";
    documentNumber: string;
    expiryDate: string;
    driverLicenseNumber: string;
    rcNumber: string;
    insuranceNumber: string;
}>;
export declare const multipleDocumentDataSchema: z.ZodEffects<z.ZodArray<z.ZodObject<{
    documentType: z.ZodEnum<["DRIVING_LICENSE", "VEHICLE_REGISTRATION", "INSURANCE"]>;
    documentNumber: z.ZodOptional<z.ZodString>;
    driverLicenseNumber: z.ZodOptional<z.ZodString>;
    rcNumber: z.ZodOptional<z.ZodString>;
    expiryDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    documentType: "DRIVING_LICENSE" | "VEHICLE_REGISTRATION" | "INSURANCE";
    documentNumber?: string | undefined;
    expiryDate?: string | undefined;
    driverLicenseNumber?: string | undefined;
    rcNumber?: string | undefined;
}, {
    documentType: "DRIVING_LICENSE" | "VEHICLE_REGISTRATION" | "INSURANCE";
    documentNumber?: string | undefined;
    expiryDate?: string | undefined;
    driverLicenseNumber?: string | undefined;
    rcNumber?: string | undefined;
}>, "many">, {
    documentType: "DRIVING_LICENSE" | "VEHICLE_REGISTRATION" | "INSURANCE";
    documentNumber?: string | undefined;
    expiryDate?: string | undefined;
    driverLicenseNumber?: string | undefined;
    rcNumber?: string | undefined;
}[], {
    documentType: "DRIVING_LICENSE" | "VEHICLE_REGISTRATION" | "INSURANCE";
    documentNumber?: string | undefined;
    expiryDate?: string | undefined;
    driverLicenseNumber?: string | undefined;
    rcNumber?: string | undefined;
}[]>;
export declare const verificationTokenSchema: z.ZodObject<{
    token: z.ZodString;
}, "strip", z.ZodTypeAny, {
    token: string;
}, {
    token: string;
}>;
export declare const subscriptionActivateSchema: z.ZodObject<{
    amount: z.ZodNumber;
    paymentMode: z.ZodString;
    transactionId: z.ZodOptional<z.ZodString>;
    durationDays: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    paymentMode: string;
    amount: number;
    durationDays: number;
    transactionId?: string | undefined;
}, {
    paymentMode: string;
    amount: number;
    transactionId?: string | undefined;
    durationDays?: number | undefined;
}>;
