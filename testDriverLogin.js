const axios = require('axios');

// Test driver backend login
async function testDriverLogin() {
  console.log('🚗 Testing Driver Backend Login...\n');
  
  const driverBackendUrl = process.env.DRIVER_BACKEND_URL || 'http://localhost:3000';
  
  try {
    // Test 1: Login with valid data
    console.log('📋 Test 1: Login with valid email and password');
    const loginData = {
      email: 'test@example.com',
      password: 'testpassword123'
    };
    
    console.log('📤 Sending login request:', loginData);
    console.log('🌐 URL:', `${driverBackendUrl}/api/driver/login`);
    
    const response = await axios.post(`${driverBackendUrl}/api/driver/login`, loginData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Login successful!');
    console.log('Response:', response.data);
    
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    
    if (error.response) {
      console.log('📊 Response status:', error.response.status);
      console.log('📊 Response data:', error.response.data);
      console.log('📊 Response headers:', error.response.headers);
    }
    
    if (error.request) {
      console.log('📡 Request was made but no response received');
      console.log('Request:', error.request);
    }
  }
}

// Test 2: Check if driver backend is running
async function testDriverBackendHealth() {
  console.log('\n🏥 Testing Driver Backend Health...');
  
  const driverBackendUrl = process.env.DRIVER_BACKEND_URL || 'http://localhost:3000';
  
  try {
    const response = await axios.get(`${driverBackendUrl}/health`);
    console.log('✅ Driver backend is healthy:', response.data);
  } catch (error) {
    console.error('❌ Driver backend health check failed:', error.message);
  }
}

// Run tests
async function runTests() {
  await testDriverBackendHealth();
  await testDriverLogin();
}

runTests().catch(console.error);
