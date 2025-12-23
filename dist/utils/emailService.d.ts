export declare const sendVerificationEmail: (email: string, token: string) => Promise<void>;
export declare const sendResetEmail: (email: string, token: string) => Promise<void>;
interface ContactFormData {
    email: string;
    name: string;
    message: string;
    mobile?: string;
}
export declare const sendContactEmail: (formData: ContactFormData) => Promise<{
    success: boolean;
} | undefined>;
interface Contact_adver_Data {
    firstName: string;
    lastName: string;
    email: string;
    message: string;
    phone?: string;
    country?: string;
    industry?: string;
    companyName?: string;
    companyWebsite?: string;
    interested: boolean;
}
export declare const sendContact_adver_Email: (formData: Contact_adver_Data) => Promise<{
    success: boolean;
} | undefined>;
export declare const sendDriverVerificationEmail: (email: string, token: string) => Promise<boolean>;
export declare const sendDriverApprovalEmail: (email: string, onboardingToken: string) => Promise<boolean>;
export declare const sendDriverRejectionEmail: (email: string, reason: string) => Promise<boolean>;
export declare const sendDriverDocumentsNotificationEmail: (driver: {
    id: string;
    name: string;
    userId: string;
}, userEmail: string, documents: Array<{
    documentType: string;
    documentUrl: string;
    documentNumber?: string;
}>) => Promise<boolean>;
interface GoaMilesRideData {
    fromLocationName: string;
    fromLocationLatitude: number;
    fromLocationLongitude: number;
    toLocationName: string;
    toLocationLatitude: number;
    toLocationLongitude: number;
    selectedDate: string;
    formattedTime?: string;
    formattedDate?: string;
    selectedTime: {
        hour: number;
        minute: number;
    };
    userName: string;
    userEmail: string;
    userPhone: string;
    userGender?: string;
    userDob?: string;
    userId: string;
}
export declare const sendGoaMilesRideEmail: (rideData: GoaMilesRideData) => Promise<{
    success: boolean;
    bookingRef: string;
}>;
interface ShankhContactFormData {
    name: string;
    email: string;
    message: string;
    mobile: string;
    domain?: string;
}
export declare const sendShankhContactEmails: (formData: ShankhContactFormData) => Promise<{
    success: boolean;
    companyEmailId: import("resend").CreateEmailResponse;
    userEmailId: import("resend").CreateEmailResponse;
}>;
export declare const sendShankhContactEmailsWithTextFallback: (formData: ShankhContactFormData) => Promise<{
    success: boolean;
    companyEmailId: import("resend").CreateEmailResponse;
    userEmailId: import("resend").CreateEmailResponse;
}>;
export {};
