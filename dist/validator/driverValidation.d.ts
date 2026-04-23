import { z } from 'zod';
export declare const driverSignupSchema: z.ZodObject<{
    email: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodLiteral<"">]>>;
    firstName: z.ZodString;
    lastName: z.ZodString;
    phoneNumber: z.ZodEffects<z.ZodString, string, string>;
    referralCode: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    phoneNumber: string;
    firstName: string;
    lastName: string;
    email?: string | undefined;
    referralCode?: string | undefined;
}, {
    phoneNumber: string;
    firstName: string;
    lastName: string;
    email?: string | undefined;
    referralCode?: string | undefined;
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
    vehicleType: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    number: string;
    model: string;
    drivingExperience: number;
    year: number;
    fuelType: string;
    seatingCapacity: number;
    insuranceStatus: boolean;
    brand: string;
    vehicleType?: string | undefined;
    hasCNG?: boolean | undefined;
    hasElectric?: boolean | undefined;
    roofTop?: boolean | undefined;
    insuranceExpiryDate?: string | undefined;
    registrationExpiryDate?: string | undefined;
}, {
    number: string;
    model: string;
    drivingExperience: number;
    year: number;
    fuelType: string;
    seatingCapacity: number;
    brand: string;
    vehicleType?: string | undefined;
    hasCNG?: boolean | undefined;
    hasElectric?: boolean | undefined;
    insuranceStatus?: boolean | undefined;
    roofTop?: boolean | undefined;
    insuranceExpiryDate?: string | undefined;
    registrationExpiryDate?: string | undefined;
}>;
export declare const driverDocumentSchema: z.ZodEffects<z.ZodObject<{
    documentType: z.ZodEnum<["DRIVING_LICENSE"]>;
    documentNumber: z.ZodString;
    aadharNumber: z.ZodString;
    panNumber: z.ZodOptional<z.ZodString>;
    driverLicenseNumber: z.ZodString;
    rcNumber: z.ZodOptional<z.ZodString>;
    insuranceNumber: z.ZodOptional<z.ZodString>;
    expiryDate: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    aadharNumber: string;
    documentType: "DRIVING_LICENSE";
    documentNumber: string;
    expiryDate: string;
    driverLicenseNumber: string;
    panNumber?: string | undefined;
    rcNumber?: string | undefined;
    insuranceNumber?: string | undefined;
}, {
    aadharNumber: string;
    documentType: "DRIVING_LICENSE";
    documentNumber: string;
    expiryDate: string;
    driverLicenseNumber: string;
    panNumber?: string | undefined;
    rcNumber?: string | undefined;
    insuranceNumber?: string | undefined;
}>, {
    aadharNumber: string;
    documentType: "DRIVING_LICENSE";
    documentNumber: string;
    expiryDate: string;
    driverLicenseNumber: string;
    panNumber?: string | undefined;
    rcNumber?: string | undefined;
    insuranceNumber?: string | undefined;
}, {
    aadharNumber: string;
    documentType: "DRIVING_LICENSE";
    documentNumber: string;
    expiryDate: string;
    driverLicenseNumber: string;
    panNumber?: string | undefined;
    rcNumber?: string | undefined;
    insuranceNumber?: string | undefined;
}>;
export declare const multipleDocumentDataSchema: z.ZodEffects<z.ZodArray<z.ZodObject<{
    documentType: z.ZodEnum<["DRIVING_LICENSE"]>;
    documentNumber: z.ZodOptional<z.ZodString>;
    driverLicenseNumber: z.ZodOptional<z.ZodString>;
    rcNumber: z.ZodOptional<z.ZodString>;
    expiryDate: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    documentType: "DRIVING_LICENSE";
    documentNumber?: string | undefined;
    expiryDate?: string | undefined;
    driverLicenseNumber?: string | undefined;
    rcNumber?: string | undefined;
}, {
    documentType: "DRIVING_LICENSE";
    documentNumber?: string | undefined;
    expiryDate?: string | undefined;
    driverLicenseNumber?: string | undefined;
    rcNumber?: string | undefined;
}>, "many">, {
    documentType: "DRIVING_LICENSE";
    documentNumber?: string | undefined;
    expiryDate?: string | undefined;
    driverLicenseNumber?: string | undefined;
    rcNumber?: string | undefined;
}[], {
    documentType: "DRIVING_LICENSE";
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
export declare const subscriptionActivateSchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    planId: z.ZodOptional<z.ZodString>;
    amount: z.ZodOptional<z.ZodNumber>;
    paymentMode: z.ZodString;
    transactionId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    durationDays: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    includedMinutes: z.ZodOptional<z.ZodNumber>;
    razorpay_order_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    razorpay_payment_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    razorpay_signature: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    paymentMode: string;
    durationDays: number;
    transactionId?: string | null | undefined;
    amount?: number | undefined;
    planId?: string | undefined;
    includedMinutes?: number | undefined;
    razorpay_order_id?: string | null | undefined;
    razorpay_payment_id?: string | null | undefined;
    razorpay_signature?: string | null | undefined;
}, {
    paymentMode: string;
    transactionId?: string | null | undefined;
    amount?: number | undefined;
    planId?: string | undefined;
    durationDays?: number | undefined;
    includedMinutes?: number | undefined;
    razorpay_order_id?: string | null | undefined;
    razorpay_payment_id?: string | null | undefined;
    razorpay_signature?: string | null | undefined;
}>, {
    paymentMode: string;
    durationDays: number;
    transactionId?: string | null | undefined;
    amount?: number | undefined;
    planId?: string | undefined;
    includedMinutes?: number | undefined;
    razorpay_order_id?: string | null | undefined;
    razorpay_payment_id?: string | null | undefined;
    razorpay_signature?: string | null | undefined;
}, {
    paymentMode: string;
    transactionId?: string | null | undefined;
    amount?: number | undefined;
    planId?: string | undefined;
    durationDays?: number | undefined;
    includedMinutes?: number | undefined;
    razorpay_order_id?: string | null | undefined;
    razorpay_payment_id?: string | null | undefined;
    razorpay_signature?: string | null | undefined;
}>, {
    paymentMode: string;
    durationDays: number;
    transactionId?: string | null | undefined;
    amount?: number | undefined;
    planId?: string | undefined;
    includedMinutes?: number | undefined;
    razorpay_order_id?: string | null | undefined;
    razorpay_payment_id?: string | null | undefined;
    razorpay_signature?: string | null | undefined;
}, {
    paymentMode: string;
    transactionId?: string | null | undefined;
    amount?: number | undefined;
    planId?: string | undefined;
    durationDays?: number | undefined;
    includedMinutes?: number | undefined;
    razorpay_order_id?: string | null | undefined;
    razorpay_payment_id?: string | null | undefined;
    razorpay_signature?: string | null | undefined;
}>;
