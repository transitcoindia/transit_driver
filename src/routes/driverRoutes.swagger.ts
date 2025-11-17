/**
 * @swagger
 * tags:
 *   name: Driver Authentication
 *   description: Driver authentication and registration endpoints
 */

/**
 * @swagger
 * /api/driver/register:
 *   post:
 *     summary: Register a new driver
 *     description: Creates a new driver account with email, password, and name.
 *     tags: [Driver Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: StrongPassword123
 *               phoneNumber:
 *                 type: string
 *                 example: "9876543210"
 *     responses:
 *       201:
 *         description: Driver registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Registration successful. Please verify your email.
 *       400:
 *         description: Invalid request or email already exists
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Email already exists
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/verify-registration-otp:
 *   post:
 *     summary: Verify registration OTP
 *     description: Verifies the OTP sent during driver registration.
 *     tags: [Driver Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: johndoe@example.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Email verified successfully
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Invalid or expired OTP
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/verify-email:
 *   get:
 *     summary: Verify driver email
 *     description: Verifies a driver's email using a token sent via email.
 *     tags: [Driver Authentication]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: JWT token received via email for verification
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired token
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/login/email:
 *   post:
 *     summary: Driver login with email
 *     description: Authenticates a driver using email and password.
 *     tags: [Driver Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: johndoe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: StrongPassword123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 driver:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Email not verified
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/login/phoneNumber:
 *   post:
 *     summary: Driver login with phone number
 *     description: Sends an OTP to the driver's phone number for authentication.
 *     tags: [Driver Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "9876543210"
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP sent to your phone number
 *       400:
 *         description: Invalid phone number
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/login/verify-otp:
 *   post:
 *     summary: Verify phone OTP for login
 *     description: Verifies the OTP sent to the driver's phone number and completes login.
 *     tags: [Driver Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - otp
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 example: "9876543210"
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Login successful
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Invalid or expired OTP
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/auth/google:
 *   post:
 *     summary: Google OAuth authentication
 *     description: Authenticates a driver using Google OAuth.
 *     tags: [Driver Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID token
 *     responses:
 *       200:
 *         description: Authentication successful
 *       401:
 *         description: Invalid token
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/password-reset/request-otp:
 *   post:
 *     summary: Request password reset OTP
 *     description: Sends a password reset OTP to the driver's email.
 *     tags: [Driver Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: johndoe@example.com
 *     responses:
 *       200:
 *         description: Reset OTP sent successfully
 *       404:
 *         description: Driver not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/password-reset/verify-otp:
 *   post:
 *     summary: Reset password with OTP
 *     description: Resets the driver's password using the OTP.
 *     tags: [Driver Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *               - newPassword
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: johndoe@example.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: NewPassword123
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       400:
 *         description: Invalid or expired OTP
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * tags:
 *   name: Driver Profile
 *   description: Driver profile and information endpoints
 */

/**
 * @swagger
 * /api/driver/profile:
 *   get:
 *     summary: Get driver profile
 *     description: Retrieves the authenticated driver's profile information.
 *     tags: [Driver Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 phoneNumber:
 *                   type: string
 *                 emailVerified:
 *                   type: boolean
 *                 phoneVerified:
 *                   type: boolean
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * tags:
 *   name: Driver Documents
 *   description: Driver document upload and vehicle information endpoints
 */

/**
 * @swagger
 * /api/driver/documents/vehicleInfo:
 *   post:
 *     summary: Submit vehicle information
 *     description: Driver submits details about their vehicle.
 *     tags: [Driver Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vehicleModel
 *               - vehicleBrand
 *               - vehicleNumber
 *               - vehicleYear
 *             properties:
 *               vehicleModel:
 *                 type: string
 *                 example: Camry
 *               vehicleBrand:
 *                 type: string
 *                 example: Toyota
 *               vehicleNumber:
 *                 type: string
 *                 example: KA01AB1234
 *               vehicleYear:
 *                 type: integer
 *                 example: 2020
 *               vehicleColor:
 *                 type: string
 *                 example: White
 *               seatingCapacity:
 *                 type: integer
 *                 example: 4
 *               fuelType:
 *                 type: string
 *                 example: Petrol
 *     responses:
 *       200:
 *         description: Vehicle information submitted successfully
 *       400:
 *         description: Invalid vehicle information
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/documents/upload:
 *   post:
 *     summary: Upload driver documents
 *     description: Upload required documents for driver verification (license, registration, insurance, etc.)
 *     tags: [Driver Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - documents
 *             properties:
 *               documents:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Multiple document files (images or PDFs, max 10MB each, up to 5 files)
 *               documentTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [DRIVING_LICENSE, VEHICLE_REGISTRATION, INSURANCE, AADHAR, PAN]
 *                 description: Types of documents being uploaded (must match the order of files)
 *     responses:
 *       200:
 *         description: Documents uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Documents uploaded successfully
 *                 uploadedFiles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       filename:
 *                         type: string
 *                       type:
 *                         type: string
 *                       url:
 *                         type: string
 *       400:
 *         description: Invalid file type or size
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * tags:
 *   name: Driver Rides
 *   description: Driver ride management endpoints
 */

/**
 * @swagger
 * /api/driver/rides_accepted:
 *   post:
 *     summary: Accept a ride request
 *     description: Driver accepts a ride request from a passenger.
 *     tags: [Driver Rides]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rideId
 *             properties:
 *               rideId:
 *                 type: string
 *                 example: ride_123456
 *               estimatedArrivalTime:
 *                 type: integer
 *                 description: Estimated time to reach pickup in minutes
 *                 example: 10
 *     responses:
 *       200:
 *         description: Ride accepted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ride accepted successfully
 *                 ride:
 *                   type: object
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Ride not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/start_ride:
 *   post:
 *     summary: Start a ride with verification code
 *     description: Driver starts a ride by entering the passenger's verification code.
 *     tags: [Driver Rides]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rideId
 *               - verificationCode
 *             properties:
 *               rideId:
 *                 type: string
 *                 example: ride_123456
 *               verificationCode:
 *                 type: string
 *                 example: "1234"
 *               startLocation:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                     example: 12.9716
 *                   longitude:
 *                     type: number
 *                     example: 77.5946
 *     responses:
 *       200:
 *         description: Ride started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ride started successfully
 *                 ride:
 *                   type: object
 *       400:
 *         description: Invalid verification code
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Ride not found
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /api/driver/end_ride:
 *   post:
 *     summary: End a ride
 *     description: Driver ends an ongoing ride and submits final details.
 *     tags: [Driver Rides]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rideId
 *             properties:
 *               rideId:
 *                 type: string
 *                 example: ride_123456
 *               endLocation:
 *                 type: object
 *                 properties:
 *                   latitude:
 *                     type: number
 *                     example: 12.9716
 *                   longitude:
 *                     type: number
 *                     example: 77.5946
 *               totalDistance:
 *                 type: number
 *                 description: Total distance traveled in kilometers
 *                 example: 15.5
 *               totalDuration:
 *                 type: number
 *                 description: Total duration in minutes
 *                 example: 45
 *     responses:
 *       200:
 *         description: Ride ended successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Ride ended successfully
 *                 ride:
 *                   type: object
 *                 fare:
 *                   type: object
 *                   properties:
 *                     baseFare:
 *                       type: number
 *                     totalFare:
 *                       type: number
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Ride not found
 *       500:
 *         description: Server error
 */


