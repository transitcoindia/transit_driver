/** Send custom SMS via Fast2SMS (route q = quick/promotional). Used for SOS alerts. */
export declare const sendSmsMessage: (phoneNumber: string, message: string) => Promise<boolean>;
export declare const sendOtp: (phoneNumber: string, otp: string) => Promise<any>;
