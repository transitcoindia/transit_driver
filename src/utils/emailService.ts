import { Resend } from 'resend';

// Conditionally initialize Resend only if API key is present
let resend: Resend | null = null;
if (process.env.RESEND_API_KEY) {
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn('⚠️  RESEND_API_KEY is not set. Email functionality will be disabled.');
}

// Helper function to check if Resend is available
const ensureResend = () => {
  if (!resend) {
    throw new Error('Resend is not configured. Please set RESEND_API_KEY in your environment variables.');
  }
  return resend;
};

export const sendVerificationEmail = async (email: string, token: string) => {
  const url = `${process.env.BACKEND_URL}/api/auth/verify-email?token=${token}`;

  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return;
    }
    await resend.emails.send({
      from: 'Transit <noreply@transitco.in>',
      to: email,
      subject: 'Email Verification',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Verify Your Email Address</h2>
          <p>Thank you for signing up with Transit! Please verify your email address to complete your registration.</p>
          <div style="margin: 25px 0;">
            <a href="${url}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify Email Address</a>
          </div>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p>${url}</p>
          <p>This link will expire in 24 hours.</p>
          <p>If you did not sign up for a Transit account, please ignore this email.</p>
          <p>Best regards,<br>The Transit Team</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Error sending verification email:', error);
  }
};

export const sendResetEmail = async (email: string, token: string) => {
  const url = `${process.env.FRONTEND_APP_URL}/resetPassword?token=${token}`;
  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return;
    }
    await resend.emails.send({
      from: 'Transit <noreply@transitco.in>',
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>Hello,</p>
          <p>We received a request to reset your password for your Transit account. To complete the process, please click the button below:</p>
          <div style="margin: 25px 0;">
            <a href="${url}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
          </div>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p>${url}</p>
          <p>This link will expire in 24 hours. If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
          <p>Best regards,<br>The Transit Team</p>
        </div>
      `,
    });
  } catch (error) {
    console.error('Error sending reset email:', error);
  }
};

interface ContactFormData {
  email: string;
  name: string;
  message: string;
  mobile?: string;
}

export const sendContactEmail = async (formData: ContactFormData) => {
  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return { success: false };
    }
    // Send confirmation email to the user
    await resend.emails.send({
      from: 'Transit <noreply@transitco.in>',
      to: formData.email,
      subject: 'We received your message',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Thank you for contacting us, ${formData.name}!</h2>
          <p>We've received your message and will get back to you as soon as possible.</p>
          <p>Here's a copy of your message:</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Message:</strong> ${formData.message}</p>
          </div>
          <p>If you need immediate assistance, please call us at our support number.</p>
          <p>Best regards,<br>The Transit Team</p>
        </div>
      `,
    });

    // Send notification email to admin
    await resend.emails.send({
      from: 'Transit Contact Form <noreply@transitco.in>',
      to: process.env.ADMIN_EMAIL || 'transitco.team@gmail.com',
      subject: 'New Contact Form Submission',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Contact Form Submission</h2>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Name:</strong> ${formData.name}</p>
            <p><strong>Email:</strong> ${formData.email}</p>
            <p><strong>Mobile:</strong> ${formData.mobile || 'Not provided'}</p>
            <p><strong>Message:</strong> ${formData.message}</p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error) {
    console.error('Error sending contact confirmation email:', error);
  }
};

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

export const sendContact_adver_Email = async (formData: Contact_adver_Data) => {
  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return { success: false };
    }
    const fullName = `${formData.firstName} ${formData.lastName}`;

    // Send confirmation email to the user
    await resend.emails.send({
      from: 'Transit <noreply@transitco.in>',
      to: formData.email,
      subject: 'We received your message',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Thank you for contacting us, ${fullName}!</h2>
          <p>We've received your message and will get back to you as soon as possible.</p>
          <p>Here's a copy of your message:</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Message:</strong> ${formData.message}</p>
          </div>
          <p>If you need immediate assistance, please call us at our support number.</p>
          <p>Best regards,<br>The Transit Team</p>
        </div>
      `,
    });

    // Send notification email to admin with all form data
    await resend.emails.send({
      from: 'Transit Contact Form <noreply@transitco.in>',
      to: process.env.ADMIN_EMAIL || 'transitco.team@gmail.com',
      subject: `New Contact Form Submission from ${fullName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>New Contact Form Submission</h2>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Contact Information</h3>
            <p><strong>Name:</strong> ${fullName}</p>
            <p><strong>Email:</strong> ${formData.email}</p>
            <p><strong>Phone:</strong> ${formData.phone || 'Not provided'}</p>
            ${formData.country ? `<p><strong>Country:</strong> ${formData.country}</p>` : ''}
            
            <h3>Company Information</h3>
            <p><strong>Company:</strong> ${formData.companyName || 'Not provided'}</p>
            ${formData.companyWebsite ? `<p><strong>Website:</strong> ${formData.companyWebsite}</p>` : ''}
            ${formData.industry ? `<p><strong>Industry:</strong> ${formData.industry}</p>` : ''}
            
            <h3>Message</h3>
            <p>${formData.message}</p>
            
            <p><strong>Interested in services:</strong> ${formData.interested ? 'Yes' : 'No'}</p>
          </div>
        </div>
      `,
      replyTo: formData.email,
    });

    return { success: true };
  } catch (error) {
    console.error('Error sending contact confirmation email:', error);
  }
};

export const sendDriverVerificationEmail = async (email: string, token: string) => {
  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return false;
    }
    const verificationUrl = `${process.env.BACKEND_URL}/api/driver/verify-email?token=${token}`;

    await resend.emails.send({
      from: 'Transit Team <driver@transitco.in>',
      to: email,
      subject: 'Verify your email for Transit Driver account',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to Transit Driver Program!</h2>
          <p>Thank you for signing up to become a driver with Transit. Please verify your email to continue with the onboarding process.</p>
          <div style="margin: 25px 0;">
            <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify Email Address</a>
          </div>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p>${verificationUrl}</p>
          <p>This link will expire in 24 hours.</p>
          <p>If you did not sign up for a Transit driver account, please ignore this email.</p>
          <p>Best regards,<br>The Transit Team</p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error('Error sending driver verification email:', error);
    return false;
  }
};

export const sendDriverApprovalEmail = async (email: string, onboardingToken: string) => {
  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return false;
    }
    const onboardingUrl = `${process.env.FRONTEND_APP_URL}/driver/onboarding?token=${onboardingToken}`;

    await resend.emails.send({
      from: 'Transit Team <driver@transitco.in>',
      to: email,
      subject: 'Your Transit Driver Application is Approved!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Congratulations!</h2>
          <p>We're pleased to inform you that your application to become a Transit driver has been approved.</p>
          <p>You're now ready to complete the final step of your onboarding process.</p>
          <div style="margin: 25px 0;">
            <a href="${onboardingUrl}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Complete Onboarding</a>
          </div>
          <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
          <p>${onboardingUrl}</p>
          <p>This link will expire in 7 days.</p>
          <p>Welcome to the Transit team! We're excited to have you on board.</p>
          <p>Best regards,<br>The Transit Team</p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error('Error sending driver approval email:', error);
    return false;
  }
};

export const sendDriverRejectionEmail = async (email: string, reason: string) => {
  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return false;
    }
    await resend.emails.send({
      from: 'Transit Team <driver@transitco.in>',
      to: email,
      subject: 'Update on Your Transit Driver Application',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Application Update</h2>
          <p>Thank you for your interest in becoming a Transit driver.</p>
          <p>After careful review of your application, we regret to inform you that we are unable to approve your application at this time.</p>
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <p><strong>Reason:</strong> ${reason}</p>
          </div>
          <p>You are welcome to update your application and reapply in the future.</p>
          <p>If you have any questions or need further clarification, please contact our support team.</p>
          <p>Best regards,<br>The Transit Team</p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error('Error sending driver rejection email:', error);
    return false;
  }
};

export const sendDriverDocumentsNotificationEmail = async (
  driver: { id: string; name: string; userId: string },
  userEmail: string,
  documents: Array<{ documentType: string; documentUrl: string; documentNumber?: string }>
) => {
  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return false;
    }
    // Generate secure tokens for approve/reject actions
    const approveToken = generateSecureToken({ action: 'approve', driverId: driver.id });
    const rejectToken = generateSecureToken({ action: 'reject', driverId: driver.id });

    // Create approval and rejection URLs
    const approveUrl = `${process.env.BACKEND_URL}/api/driver/admin/approve?token=${approveToken}`;
    const rejectUrl = `${process.env.BACKEND_URL}/api/driver/admin/reject?token=${rejectToken}`;

    // Create document list HTML
    const documentsHtml = documents.map(doc => `
      <div style="margin-bottom: 15px;">
        <p><strong>Document Type:</strong> ${doc.documentType}</p>
        ${doc.documentNumber ? `<p><strong>Document Number:</strong> ${doc.documentNumber}</p>` : ''}
        <p><strong>Document Link:</strong> <a href="${doc.documentUrl}" target="_blank">View Document</a></p>
      </div>
    `).join('');

    await resend.emails.send({
      from: 'Transit Driver Verification <driver@transitco.in>',
      to: process.env.ADMIN_EMAIL || 'transitco.team@gmail.com',
      subject: `Driver Verification Required: ${driver.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Driver Application Ready for Review</h2>
          <p>A new driver has completed their document submission and is ready for review.</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 15px 0;">
            <h3>Driver Information</h3>
            <p><strong>Name:</strong> ${driver.name}</p>
            <p><strong>Email:</strong> ${userEmail}</p>
            <p><strong>Driver ID:</strong> ${driver.id}</p>
            
            <h3>Submitted Documents</h3>
            ${documentsHtml}
          </div>
          
          <p>Please review the documents and take appropriate action:</p>
          
          <div style="display: flex; margin: 25px 0; gap: 15px;">
            <a href="${approveUrl}" style="background-color: #4CAF50; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Approve Driver</a>
            <a href="${rejectUrl}" style="background-color: #F44336; color: white; padding: 12px 20px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reject Driver</a>
          </div>
          
          <p>Note: These links will expire after 7 days. If you need to review the documents again, please visit the admin portal.</p>
        </div>
      `,
    });

    return true;
  } catch (error) {
    console.error('Error sending driver documents notification email:', error);
    return false;
  }
};

// Helper function to generate secure tokens for admin actions
function generateSecureToken(payload: any): string {
  const jwt = require('jsonwebtoken');
  // Create a token that expires in 7 days
  return jwt.sign(
    payload,
    process.env.JWT_SECRET as string,
    { expiresIn: '7d' }
  );
}

//goaMilesRide
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

export const sendGoaMilesRideEmail = async (rideData: GoaMilesRideData) => {
  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return { success: false };
    }
    const {
      fromLocationName,
      fromLocationLatitude,
      fromLocationLongitude,
      toLocationName,
      toLocationLatitude,
      toLocationLongitude,
      selectedDate,
      selectedTime,
      userName,
      userEmail,
      userPhone,
      userGender,
      userDob,
      userId
    } = rideData;

    const formattedTime = `${selectedTime.hour.toString().padStart(2, '0')}:${selectedTime.minute.toString().padStart(2, '0')}`;
    const formattedDate = new Date(selectedDate).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Generate a unique booking reference
    const bookingRef = `GM-${Date.now().toString().slice(-6)}-${userId.slice(-4)}`;

    // Send confirmation email to the user
    await resend.emails.send({
      from: 'Transit <noreply@transitco.in>',
      to: userEmail,
      subject: 'Your Goa Miles Ride Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
          <h2 style="color: #333;">Your Goa Miles Ride Request</h2>
          <p>Hello ${userName},</p>
          <p>We've received your ride request with the following details:</p>
          
          <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px;">
            <h3 style="margin-top: 0;">Booking Reference: ${bookingRef}</h3>
            <p><strong>From:</strong> ${fromLocationName} (${fromLocationLatitude}, ${fromLocationLongitude})</p>
            <p><strong>To:</strong> ${toLocationName} (${toLocationLatitude}, ${toLocationLongitude})</p>
            <p><strong>Date:</strong> ${formattedDate}</p>
            <p><strong>Time:</strong> ${formattedTime}</p>
          </div>
          
          <p>We'll process your request and get back to you shortly.</p>
          <p>Thank you for using our service!</p>
          <p>Best regards,<br>The Transit Team</p>
        </div>
      `,
    });

    // Send notification email to admin with all details
    await resend.emails.send({
      from: 'Transit Goa Miles <goamiles@transitco.in>',
      to: [
        process.env.ADMIN_EMAIL || 'transitco.team@gmail.com',
        'jysona.bhagat@goamiles.com',
        'pradesh.borkar@goamiles.com'
      ],
      subject: `New Goa Miles Ride Request (${bookingRef})`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333;">New Goa Miles Ride Request</h2>
        <p><strong>Booking Reference:</strong> ${bookingRef}</p>
        
        <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px;">
        <h3 style="margin-top: 0;">User Information</h3>
        <p><strong>User ID:</strong> ${userId}</p>
        <p><strong>Name:</strong> ${userName}</p>
        <p><strong>Email:</strong> ${userEmail}</p>
        <p><strong>Phone:</strong> ${userPhone}</p>
        <p><strong>Gender:</strong> ${userGender}</p>
        <p><strong>Date of Birth:</strong> ${userDob}</p>
        </div>
        
        <div style="margin: 20px 0; padding: 15px; background-color: #f9f9f9; border-radius: 5px;">
        <h3 style="margin-top: 0;">Ride Details</h3>
        <p><strong>From:</strong> ${fromLocationName} (${fromLocationLatitude}, ${fromLocationLongitude})</p>
        <p><strong>To:</strong> ${toLocationName} (${toLocationLatitude}, ${toLocationLongitude})</p>
        <p><strong>Date:</strong> ${formattedDate}</p>
        <p><strong>Time:</strong> ${formattedTime}</p>
        </div>
      </div>
      `,
      replyTo: userEmail,
    });

    return { success: true, bookingRef };
  } catch (error) {
    console.error('Error sending Goa Miles ride email:', error);
    throw new Error('Failed to send Goa Miles ride email');
  }
};

interface ShankhContactFormData {
  name: string;
  email: string;
  message: string;
  mobile: string;
  domain?: string;
}

export const sendShankhContactEmails = async (formData: ShankhContactFormData) => {
  const { name, email, message, mobile, domain } = formData;

  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return { success: false };
    }
    // Email to company
    const companyEmailResponse = await resend.emails.send({
      from: 'Shankh Technologies <noreply@shankhtech.com>',
      to: ['info@shankhtech.com'],
      subject: `New Contact Form Submission from ${name}${domain ? ` - ${domain}` : ''}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1D3244; border-bottom: 2px solid #1D3244; padding-bottom: 10px;">
            New Contact Form Submission
          </h2>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1D3244; margin-top: 0;">Contact Details:</h3>
            
            <div style="margin-bottom: 15px;">
              <strong style="color: #6D7179;">Name:</strong>
              <span style="margin-left: 10px;">${name}</span>
            </div>
            
            <div style="margin-bottom: 15px;">
              <strong style="color: #6D7179;">Email:</strong>
              <span style="margin-left: 10px;">${email}</span>
            </div>
            
            <div style="margin-bottom: 15px;">
              <strong style="color: #6D7179;">Mobile:</strong>
              <span style="margin-left: 10px;">${mobile}</span>
            </div>
            
            ${domain ? `
            <div style="margin-bottom: 15px;">
              <strong style="color: #6D7179;">Service Domain:</strong>
              <span style="margin-left: 10px; background-color: #1D3244; color: white; padding: 4px 8px; border-radius: 4px; font-size: 14px;">${domain}</span>
            </div>
            ` : ''}
          </div>
          
          <div style="background-color: #fff; border: 1px solid #e9ecef; padding: 20px; border-radius: 8px;">
            <h3 style="color: #1D3244; margin-top: 0;">Message:</h3>
            <p style="line-height: 1.6; color: #333; white-space: pre-wrap;">${message}</p>
          </div>
          
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef; color: #6c757d; font-size: 14px;">
            <p>This email was sent from the ShankhTech contact form on ${new Date().toLocaleString()}.</p>
          </div>
        </div>
      `,
    });

    // Confirmation email to user
    const userEmailResponse = await resend.emails.send({
      from: 'Shankh Technologies <noreply@shankhtech.com>',
      to: [email],
      subject: 'Thank you for contacting ShankhTech - We\'ll be in touch soon!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1D3244; margin-bottom: 10px;">ShankhTech</h1>
            <div style="width: 50px; height: 3px; background-color: #1D3244; margin: 0 auto;"></div>
          </div>
          
          <h2 style="color: #1D3244;">Thank you for reaching out!</h2>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            Hi ${name},
          </p>
          
          <p style="color: #333; line-height: 1.6; font-size: 16px;">
            We've received your message and appreciate you taking the time to contact us. 
            Our team will review your inquiry and get back to you within 24-48 hours.
          </p>
          
          <div style="background-color: #f8f9fa; border-left: 4px solid #1D3244; padding: 20px; margin: 30px 0;">
            <h3 style="color: #1D3244; margin-top: 0;">Your Message Summary:</h3>
            <p style="color: #6D7179; margin-bottom: 10px;"><strong>Name:</strong> ${name}</p>
            <p style="color: #6D7179; margin-bottom: 10px;"><strong>Email:</strong> ${email}</p>
            <p style="color: #6D7179; margin-bottom: 10px;"><strong>Mobile:</strong> ${mobile}</p>
            ${domain ? `<p style="color: #6D7179; margin-bottom: 10px;"><strong>Service Domain:</strong> <span style="background-color: #1D3244; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${domain}</span></p>` : ''}
            <div style="margin-top: 15px;">
              <strong style="color: #6D7179;">Message:</strong>
              <p style="color: #333; margin-top: 5px; white-space: pre-wrap;">${message}</p>
            </div>
          </div>
          
          <div style="background-color: #1D3244; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 30px 0;">
            <h3 style="margin-top: 0; color: white;">Need Immediate Assistance?</h3>
            <p style="margin-bottom: 0;">
              Call us at: <strong>+91-9999-4998-25</strong><br>
              Email us at: <strong>info@shankhtech.com</strong>
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef;">
            <p style="color: #6c757d; font-size: 14px; margin-bottom: 10px;">
              Best regards,<br>
              <strong>The ShankhTech Team</strong>
            </p>
            
            <div style="margin-top: 20px;">
              <a href="https://shankhtech.com" style="color: #1D3244; text-decoration: none; margin: 0 10px;">Website</a>
              <span style="color: #ccc;">|</span>
              <a href="mailto:info@shankhtech.com" style="color: #1D3244; text-decoration: none; margin: 0 10px;">Email</a>
            </div>
          </div>
        </div>
      `,
    });

    return {
      success: true,
      companyEmailId: companyEmailResponse,
      userEmailId: userEmailResponse,
    };
  } catch (error) {
    console.error('Error sending ShankhTech contact emails:', error);
    throw new Error('Failed to send ShankhTech confirmation emails');
  }
};

export const sendShankhContactEmailsWithTextFallback = async (formData: ShankhContactFormData) => {
  const { name, email, message, mobile, domain } = formData;

  try {
    if (!resend) {
      console.warn('⚠️  Email not sent: RESEND_API_KEY is not configured');
      return { success: false };
    }
    // Email to company with text fallback
    const companyEmailResponse = await resend.emails.send({
      from: 'Transit <noreply@transitco.in>',
      to: ['info@shankhtech.com'],
      subject: `New Contact Form Submission from ${name}${domain ? ` - ${domain}` : ''}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1D3244; border-bottom: 2px solid #1D3244; padding-bottom: 10px;">
            New Contact Form Submission
          </h2>
          <!-- HTML content -->
        </div>
      `,
      text: `
        New Contact Form Submission

        Contact Details:
        Name: ${name}
        Email: ${email}
        Mobile: ${mobile}${domain ? `\nService Domain: ${domain}` : ''}

        Message:
        ${message}

        This email was sent from the ShankhTech contact form on ${new Date().toLocaleString()}.
      `,
    });

    // Confirmation email to user with text fallback
    const userEmailResponse = await resend.emails.send({
      from: 'Transit <noreply@transitco.in>',
      to: [email],
      subject: 'Thank you for contacting ShankhTech - We\'ll be in touch soon!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <!-- HTML content -->
        </div>
      `,
      text: `
        ShankhTech - Thank you for reaching out!

        Hi ${name},

        We've received your message and appreciate you taking the time to contact us. Our team will review your inquiry and get back to you within 24-48 hours.

        Your Message Summary:
        Name: ${name}
        Email: ${email}
        Mobile: ${mobile}${domain ? `\nService Domain: ${domain}` : ''}
        Message: ${message}

        Need Immediate Assistance?
        Call us at: +91-9999-4998-25
        Email us at: info@shankhtech.com

        Best regards,
        The ShankhTech Team

        Website: https://shankhtech.com
        Email: info@shankhtech.com
      `,
    });

    return {
      success: true,
      companyEmailId: companyEmailResponse,
      userEmailId: userEmailResponse,
    };
  } catch (error) {
    console.error('Error sending ShankhTech contact emails with text fallback:', error);
    throw new Error('Failed to send ShankhTech confirmation emails');
  }
};
