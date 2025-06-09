import axios from 'axios';

export const sendOtp = async (phoneNumber: string, otp: string) => {
  try {
    // Prepare the payload
    const payload = {
      variables_values: otp,
      route: 'otp',
      numbers: phoneNumber,
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

