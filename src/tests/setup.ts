// Jest setup file for test configuration
// This file runs before each test suite

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

// Mock external services if needed
// Example: Mock Redis connection
jest.mock('../redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
  },
}));

// Global test timeout
jest.setTimeout(10000);

