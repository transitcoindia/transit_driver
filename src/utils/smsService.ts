export const sendSMS = async (phoneNumber: string, message: string): Promise<boolean> => {
    try {
        // TODO: Integrate with actual SMS provider (e.g., Twilio, MessageBird)
        console.log(`[MOCK SMS] Sending to ${phoneNumber}: ${message}`);
        return true;
    } catch (error) {
        console.error('Error sending SMS:', error);
        return false;
    }
}; 