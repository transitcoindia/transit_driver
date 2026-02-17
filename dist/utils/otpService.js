"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOtp = exports.sendSmsMessage = void 0;
const axios_1 = __importDefault(require("axios"));
/** Send custom SMS via Fast2SMS (route q = quick/promotional). Used for SOS alerts. */
const sendSmsMessage = async (phoneNumber, message) => {
    const key = process.env.FAST2SMS_API_KEY;
    if (!key) {
        console.warn("[SMS] FAST2SMS_API_KEY not set, skipping SMS send");
        return false;
    }
    const normalized = phoneNumber.replace(/\D/g, "");
    if (normalized.length < 10)
        return false;
    try {
        const payload = {
            message,
            route: "q", // Quick SMS (random sender IDs)
            numbers: normalized,
        };
        const response = await axios_1.default.post("https://www.fast2sms.com/dev/bulkV2", payload, {
            headers: { Authorization: key, "Content-Type": "application/json" },
        });
        return response.data?.return === true;
    }
    catch (e) {
        console.error("[SMS] sendSmsMessage failed:", e);
        return false;
    }
};
exports.sendSmsMessage = sendSmsMessage;
const sendOtp = async (phoneNumber, otp) => {
    try {
        // Prepare the payload
        const payload = {
            variables_values: otp,
            route: 'otp',
            numbers: phoneNumber,
            sender_id: 'TRANSIT',
        };
        // Make the axios POST request to Fast2SMS API
        const response = await axios_1.default.post('https://www.fast2sms.com/dev/bulkV2', payload, {
            headers: {
                'Authorization': process.env.FAST2SMS_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        // Check the response and log if successful
        if (response.data.return === false) {
            //   console.log(`OTP sent successfully to ${phoneNumber}`);
            // } else {
            console.log(`Failed to send OTP: ${response.data.message}`);
        }
        return response.data;
    }
    catch (error) {
        console.error("Error sending OTP:", error);
    }
};
exports.sendOtp = sendOtp;
//# sourceMappingURL=otpService.js.map