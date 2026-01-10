/**
 * Comprehensive API Test Suite for Transit Driver Service
 * Tests all driver APIs including ride OTP, cancellation, and admin features
 * 
 * Run with: ts-node test-all-apis.ts
 */

import axios, { AxiosInstance } from 'axios';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Configuration
const DRIVER_API_URL = process.env.DRIVER_API_URL || 'http://localhost:3000';
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';
const DRIVER_BASE = `${DRIVER_API_URL}/api/driver`;
const BACKEND_BASE = `${BACKEND_API_URL}/api`;

// Create axios instances
const driverApi: AxiosInstance = axios.create({
  baseURL: DRIVER_BASE,
  headers: { 'Content-Type': 'application/json' },
  validateStatus: () => true,
});

const backendApi: AxiosInstance = axios.create({
  baseURL: BACKEND_BASE,
  headers: { 'Content-Type': 'application/json' },
  validateStatus: () => true,
});

// Test data storage
interface TestData {
  driver?: {
    id: string;
    userId: string;
    email: string;
    phoneNumber: string;
    token: string;
  };
  rider?: {
    id: string;
    email: string;
    phoneNumber: string;
    token: string;
  };
  admin?: {
    id: string;
    email: string;
    token: string;
  };
  vehicle?: { id: string };
  ride?: {
    id: string;
    rideCode: string;
    rideOtp?: string;
  };
}

const testData: TestData = {};
const results: Array<{ name: string; passed: boolean; error?: string; details?: any }> = [];

// Helper functions
function logResult(name: string, passed: boolean, error?: string, details?: any) {
  results.push({ name, passed, error, details });
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${name}`);
  if (error) console.log(`   Error: ${error}`);
  if (details && !passed) {
    console.log(`   Details: ${JSON.stringify(details, null, 2).substring(0, 300)}`);
  }
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Setup test data
async function setupTestData() {
  console.log('\n🔧 Setting up test data...\n');

  try {
    // Create test driver
    const driverEmail = `test.driver.${Date.now()}@test.com`;
    const driverPhone = `9876543${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const hashedPassword = await bcrypt.hash('Test123!@#', 10);

    const user = await prisma.user.create({
      data: {
        email: driverEmail,
        name: 'Test Driver',
        phoneNumber: driverPhone,
        password: hashedPassword,
        emailVerified: true,
        phoneNumberVerified: true,
        isDriver: true,
      },
    });

    const driver = await prisma.driver.create({
      data: {
        userId: user.id,
        name: 'Test Driver',
        email: driverEmail,
        phoneNumber: driverPhone,
        emailVerified: true,
        phoneNumberVerified: true,
        approvalStatus: 'APPROVED',
        accountActive: true,
        isVerified: true,
      },
    });

    // Generate token
    const jwt = require('jsonwebtoken');
    const jwtSecret = process.env.JWT_SECRET || 'test-secret-key-change-in-production';
    const driverToken = jwt.sign({ id: driver.id }, jwtSecret, { expiresIn: '30d' });

    testData.driver = {
      id: driver.id,
      userId: user.id,
      email: driverEmail,
      phoneNumber: driverPhone,
      token: driverToken,
    };

    // Create test rider
    const riderEmail = `test.rider.${Date.now()}@test.com`;
    const riderPhone = `9876543${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    const riderPassword = await bcrypt.hash('Test123!@#', 10);

    const rider = await prisma.user.create({
      data: {
        email: riderEmail,
        name: 'Test Rider',
        phoneNumber: riderPhone,
        password: riderPassword,
        emailVerified: true,
        phoneNumberVerified: true,
        isDriver: false,
      },
    });

    const riderToken = jwt.sign({ id: rider.id }, jwtSecret, { expiresIn: '30d' });

    testData.rider = {
      id: rider.id,
      email: riderEmail,
      phoneNumber: riderPhone,
      token: riderToken,
    };

    // Create admin user
    const adminEmail = `test.admin.${Date.now()}@test.com`;
    const adminPassword = await bcrypt.hash('Test123!@#', 10);

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'Test Admin',
        password: adminPassword,
        emailVerified: true,
        isAdmin: true,
      },
    });

    const adminToken = jwt.sign({ id: admin.id }, jwtSecret, { expiresIn: '30d' });

    testData.admin = {
      id: admin.id,
      email: adminEmail,
      token: adminToken,
    };

    // Create vehicle for driver
    const vehicle = await prisma.vehicle.create({
      data: {
        driverId: driver.id,
        make: 'Test Make',
        model: 'Test Model',
        year: 2020,
        licensePlate: `TEST-${Math.floor(Math.random() * 1000)}`,
        vehicleType: 'SEDAN',
        isAvailable: true,
      },
    });

    testData.vehicle = { id: vehicle.id };

    console.log('✅ Test data setup complete\n');
  } catch (error: any) {
    console.error('❌ Error setting up test data:', error.message);
    throw error;
  }
}

// Test functions
async function testDriverProfile() {
  try {
    const response = await driverApi.get('/profile', {
      headers: { Authorization: `Bearer ${testData.driver?.token}` },
    });
    logResult('GET /api/driver/profile', response.status === 200, response.status !== 200 ? `Status: ${response.status}` : undefined);
    return response.status === 200;
  } catch (error: any) {
    logResult('GET /api/driver/profile', false, error.message);
    return false;
  }
}

async function testRideAcceptanceWithOTP() {
  try {
    // First create a ride request (rider side)
    const rideRequest = await backendApi.post('/rider/request', {
      pickupLatitude: 28.6139,
      pickupLongitude: 77.2090,
      pickupAddress: 'Test Pickup Location',
      dropLatitude: 28.7041,
      dropLongitude: 77.1025,
      dropAddress: 'Test Drop Location',
    }, {
      headers: { Authorization: `Bearer ${testData.rider?.token}` },
    });

    if (rideRequest.status !== 200) {
      logResult('POST /api/rider/request (for OTP test)', false, `Status: ${rideRequest.status}`, rideRequest.data);
      return false;
    }

    const rideId = rideRequest.data?.data?.ride?.id;
    if (!rideId) {
      logResult('POST /api/rider/request (ride ID missing)', false, 'Ride ID not in response', rideRequest.data);
      return false;
    }

    testData.ride = { id: rideId, rideCode: rideRequest.data?.data?.ride?.rideCode || 'N/A' };

    // Assign driver to ride
    await prisma.ride.update({
      where: { id: rideId },
      data: { driverId: testData.driver?.id, status: 'pending' },
    });

    await sleep(500);

    // Driver accepts ride (should generate OTP)
    const acceptResponse = await driverApi.post(`/rides/${rideId}/accept`, {}, {
      headers: { Authorization: `Bearer ${testData.driver?.token}` },
    });

    const hasOtpGeneration = acceptResponse.status === 200;
    logResult('POST /api/driver/rides/:rideId/accept (OTP generation)', hasOtpGeneration, 
      hasOtpGeneration ? undefined : `Status: ${acceptResponse.status}`, acceptResponse.data);

    if (hasOtpGeneration) {
      // Check if OTP was generated in database
      const rideWithOtp = await prisma.ride.findUnique({
        where: { id: rideId },
      });

      if (!rideWithOtp) {
        logResult('Ride OTP generated in database', false, 'Ride not found after acceptance');
        return false;
      }

      const otpGenerated = !!(rideWithOtp as any)?.rideOtp && rideWithOtp.status === 'accepted';
      logResult('Ride OTP generated in database', otpGenerated, 
        otpGenerated ? undefined : 'OTP not found or status not accepted');

      if ((rideWithOtp as any)?.rideOtp) {
        testData.ride.rideOtp = (rideWithOtp as any).rideOtp;
        logResult('OTP retrieved from database', true, undefined, { otp: (rideWithOtp as any).rideOtp });
      }

      return otpGenerated;
    }

    return false;
  } catch (error: any) {
    logResult('Ride Acceptance with OTP', false, error.message);
    return false;
  }
}

async function testRiderCanViewOTP() {
  try {
    if (!testData.ride?.id) {
      logResult('GET /api/rider/:rideId (view OTP)', false, 'No ride ID available');
      return false;
    }

    const response = await backendApi.get(`/rider/${testData.ride.id}`, {
      headers: { Authorization: `Bearer ${testData.rider?.token}` },
    });

    const hasOtp = response.status === 200 && response.data?.data?.rideOtp;
    logResult('GET /api/rider/:rideId (rider can view OTP)', hasOtp,
      hasOtp ? undefined : `Status: ${response.status}, OTP: ${response.data?.data?.rideOtp || 'missing'}`,
      hasOtp ? { otp: response.data.data.rideOtp } : response.data);

    return hasOtp;
  } catch (error: any) {
    logResult('GET /api/rider/:rideId (view OTP)', false, error.message);
    return false;
  }
}

async function testStartRideWithOTP() {
  try {
    if (!testData.ride?.id || !testData.ride?.rideOtp) {
      logResult('POST /api/driver/rides/:rideId/start (with OTP)', false, 'Ride ID or OTP not available');
      return false;
    }

    // Test: Try starting without OTP (should fail)
    const noOtpResponse = await driverApi.post(`/rides/${testData.ride.id}/start`, {}, {
      headers: { Authorization: `Bearer ${testData.driver?.token}` },
    });

    const failsWithoutOtp = noOtpResponse.status === 400;
    logResult('POST /api/driver/rides/:rideId/start (without OTP - should fail)', failsWithoutOtp,
      failsWithoutOtp ? undefined : `Expected 400, got ${noOtpResponse.status}`);

    // Test: Try starting with wrong OTP (should fail)
    const wrongOtpResponse = await driverApi.post(`/rides/${testData.ride.id}/start`, { otp: '9999' }, {
      headers: { Authorization: `Bearer ${testData.driver?.token}` },
    });

    const failsWithWrongOtp = wrongOtpResponse.status === 400;
    logResult('POST /api/driver/rides/:rideId/start (wrong OTP - should fail)', failsWithWrongOtp,
      failsWithWrongOtp ? undefined : `Expected 400, got ${wrongOtpResponse.status}`);

    // Test: Start with correct OTP (should succeed)
    const correctOtpResponse = await driverApi.post(`/rides/${testData.ride.id}/start`, 
      { otp: testData.ride.rideOtp }, {
      headers: { Authorization: `Bearer ${testData.driver?.token}` },
    });

    const succeedsWithCorrectOtp = correctOtpResponse.status === 200;
    logResult('POST /api/driver/rides/:rideId/start (correct OTP - should succeed)', succeedsWithCorrectOtp,
      succeedsWithCorrectOtp ? undefined : `Status: ${correctOtpResponse.status}`, correctOtpResponse.data);

    if (succeedsWithCorrectOtp) {
      // Verify OTP was cleared
      const rideAfterStart = await prisma.ride.findUnique({
        where: { id: testData.ride.id },
      });

      if (!rideAfterStart) {
        logResult('OTP cleared after successful start', false, 'Ride not found after start');
        return false;
      }
      const otpCleared = !(rideAfterStart as any)?.rideOtp && rideAfterStart.status === 'in_progress';
      logResult('OTP cleared after successful start', otpCleared,
        otpCleared ? undefined : `OTP still present: ${(rideAfterStart as any)?.rideOtp}, Status: ${rideAfterStart?.status}`);
    }

    return failsWithoutOtp && failsWithWrongOtp && succeedsWithCorrectOtp;
  } catch (error: any) {
    logResult('Start Ride with OTP', false, error.message);
    return false;
  }
}

async function testDriverCancellation() {
  try {
    // Create a new ride for cancellation test
    const ride = await prisma.ride.create({
      data: {
        rideCode: `TEST-${Date.now()}`,
        status: 'accepted',
        pickupLatitude: 28.6139,
        pickupLongitude: 77.2090,
        pickupAddress: 'Test Pickup',
        dropLatitude: 28.7041,
        dropLongitude: 77.1025,
        dropAddress: 'Test Drop',
        driverId: testData.driver!.id,
        riderId: testData.rider!.id,
        // rideOtp will be set by the accept endpoint, not in creation
      },
    });

    const cancelResponse = await driverApi.post(`/rides/${ride.id}/cancel`, {
      cancellationReason: 'Driver emergency - need to cancel',
      cancellationFee: 25.0,
    }, {
      headers: { Authorization: `Bearer ${testData.driver?.token}` },
    });

    const cancelSucceeded = cancelResponse.status === 200;
    logResult('POST /api/driver/rides/:rideId/cancel', cancelSucceeded,
      cancelSucceeded ? undefined : `Status: ${cancelResponse.status}`, cancelResponse.data);

    if (cancelSucceeded) {
      // Verify cancellation data stored
      const cancelledRide = await prisma.ride.findUnique({
        where: { id: ride.id },
      });

      const rideData = cancelledRide as any;
      const allDataStored = cancelledRide?.status === 'cancelled' &&
        rideData.cancelledBy === 'driver' &&
        rideData.cancellationReason === 'Driver emergency - need to cancel' &&
        rideData.cancellationFee === 25.0 &&
        !!rideData.cancelledAt &&
        !!cancelledRide.endTime &&
        rideData.rideOtp === null;

      logResult('Driver cancellation - all data stored correctly', allDataStored,
        allDataStored ? undefined : `Missing data: ${JSON.stringify(cancelledRide)}`);

      return cancelSucceeded && allDataStored;
    }

    return false;
  } catch (error: any) {
    logResult('Driver Cancellation', false, error.message);
    return false;
  }
}

async function testRiderCancellation() {
  try {
    const ride = await prisma.ride.create({
      data: {
        rideCode: `TEST-${Date.now()}`,
        status: 'accepted',
        pickupLatitude: 28.6139,
        pickupLongitude: 77.2090,
        pickupAddress: 'Test Pickup',
        dropLatitude: 28.7041,
        dropLongitude: 77.1025,
        dropAddress: 'Test Drop',
        driverId: testData.driver!.id,
        riderId: testData.rider!.id,
        // rideOtp will be set by the accept endpoint, not in creation
      },
    });

    const cancelResponse = await backendApi.post(`/rider/${ride.id}/cancel`, {
      cancellationReason: 'Rider changed mind',
      cancellationFee: 10.0,
    }, {
      headers: { Authorization: `Bearer ${testData.rider?.token}` },
    });

    const cancelSucceeded = cancelResponse.status === 200;
    logResult('POST /api/rider/:rideId/cancel', cancelSucceeded,
      cancelSucceeded ? undefined : `Status: ${cancelResponse.status}`, cancelResponse.data);

    if (cancelSucceeded) {
      const cancelledRide = await prisma.ride.findUnique({
        where: { id: ride.id },
      });

      const rideData = cancelledRide as any;
      const allDataStored = cancelledRide?.status === 'cancelled' &&
        rideData.cancelledBy === 'rider' &&
        rideData.cancellationReason === 'Rider changed mind' &&
        rideData.cancellationFee === 10.0 &&
        !!rideData.cancelledAt &&
        !!cancelledRide.endTime &&
        rideData.rideOtp === null;

      logResult('Rider cancellation - all data stored correctly', allDataStored,
        allDataStored ? undefined : `Missing data: ${JSON.stringify(cancelledRide)}`);

      return cancelSucceeded && allDataStored;
    }

    return false;
  } catch (error: any) {
    logResult('Rider Cancellation', false, error.message);
    return false;
  }
}

async function testAdminDriverManagement() {
  try {
    // Test: Get all drivers
    const listResponse = await driverApi.get('/admin/list', {
      headers: { Authorization: `Bearer ${testData.admin?.token}` },
    });

    const listSucceeded = listResponse.status === 200 && Array.isArray(listResponse.data?.data?.drivers);
    logResult('GET /api/driver/admin/list', listSucceeded,
      listSucceeded ? undefined : `Status: ${listResponse.status}`);

    if (!listSucceeded || !listResponse.data?.data?.drivers?.length) {
      return false;
    }

    const driverId = testData.driver?.id;

    // Test: Update driver approval status
    const updateResponse = await driverApi.patch(`/admin/${driverId}/approval`, {
      approvalStatus: 'SUSPENDED',
    }, {
      headers: { Authorization: `Bearer ${testData.admin?.token}` },
    });

    const updateSucceeded = updateResponse.status === 200;
    logResult('PATCH /api/driver/admin/:driverId/approval (suspend)', updateSucceeded,
      updateSucceeded ? undefined : `Status: ${updateResponse.status}`, updateResponse.data);

    // Restore driver status
    if (updateSucceeded) {
      await driverApi.patch(`/admin/${driverId}/approval`, {
        approvalStatus: 'APPROVED',
      }, {
        headers: { Authorization: `Bearer ${testData.admin?.token}` },
      });
    }

    return listSucceeded && updateSucceeded;
  } catch (error: any) {
    logResult('Admin Driver Management', false, error.message);
    return false;
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test data...\n');
  try {
    if (testData.driver?.id) {
      await prisma.driver.deleteMany({ where: { id: testData.driver.id } });
    }
    if (testData.driver?.userId) {
      await prisma.user.deleteMany({ where: { id: testData.driver.userId } });
    }
    if (testData.rider?.id) {
      await prisma.user.deleteMany({ where: { id: testData.rider.id } });
    }
    if (testData.admin?.id) {
      await prisma.user.deleteMany({ where: { id: testData.admin.id } });
    }
    if (testData.vehicle?.id) {
      await prisma.vehicle.deleteMany({ where: { id: testData.vehicle.id } });
    }
    // Clean up test rides
    await prisma.ride.deleteMany({
      where: {
        OR: [
          { driverId: testData.driver?.id },
          { riderId: testData.rider?.id },
        ],
      },
    });
    console.log('✅ Cleanup complete\n');
  } catch (error: any) {
    console.error('⚠️ Cleanup error:', error.message);
  }
}

// Main test runner
async function runTests() {
  console.log('🚀 Starting Comprehensive API Tests\n');
  console.log(`Driver Service: ${DRIVER_API_URL}`);
  console.log(`Backend Service: ${BACKEND_API_URL}\n`);

  try {
    await setupTestData();

    // Run all tests
    await testDriverProfile();
    await testRideAcceptanceWithOTP();
    await testRiderCanViewOTP();
    await testStartRideWithOTP();
    await testDriverCancellation();
    await testRiderCancellation();
    await testAdminDriverManagement();

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    const passed = results.filter(r => r.passed).length;
    const total = results.length;
    const failed = total - passed;
    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.name}`);
        if (r.error) console.log(`    Error: ${r.error}`);
      });
    }

  } catch (error: any) {
    console.error('\n❌ Test execution failed:', error.message);
    console.error(error.stack);
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
}

// Run tests
runTests().catch(console.error);

