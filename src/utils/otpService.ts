import axios from 'axios';

/** Send custom SMS via Fast2SMS (route q = quick/promotional). Used for SOS alerts. */
export const sendSmsMessage = async (phoneNumber: string, message: string): Promise<boolean> => {
  const key = process.env.FAST2SMS_API_KEY;
  if (!key) {
    console.warn("[SMS] FAST2SMS_API_KEY not set, skipping SMS send");
    return false;
  }
  const normalized = phoneNumber.replace(/\D/g, "");
  if (normalized.length < 10) return false;
  try {
    const payload = {
      message,
      route: "q", // Quick SMS (random sender IDs)
      numbers: normalized,
    };
    const response = await axios.post("https://www.fast2sms.com/dev/bulkV2", payload, {
      headers: { Authorization: key, "Content-Type": "application/json" },
    });
    return response.data?.return === true;
  } catch (e) {
    console.error("[SMS] sendSmsMessage failed:", e);
    return false;
  }
};

export const sendOtp = async (phoneNumber: string, otp: string) => {
  try {
    // Prepare the payload
    const payload = {
      variables_values: otp,
      route: 'otp',
      numbers: phoneNumber,
      sender_id: 'TRANSIT',
    };

    // Make the axios POST request to Fast2SMS API
    const response = await axios.post('https://www.fast2sms.com/dev/bulkV2', payload, {
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
  } catch (error) {
    console.error("Error sending OTP:", error);
  }
};
