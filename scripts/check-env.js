#!/usr/bin/env node

/**
 * Environment Check Script
 * Validates all required environment variables before starting the server
 */

const fs = require('fs');
const path = require('path');

const requiredEnvVars = {
  JWT_SECRET: {
    required: true,
    description: 'JWT secret key for token signing',
  },
  DATABASE_URL: {
    required: true,
    description: 'PostgreSQL database connection URL',
  },
  PORT: {
    required: false,
    description: 'Server port number',
    defaultValue: '3000',
  },
  REDIS_URL: {
    required: false,
    description: 'Redis connection URL',
    defaultValue: 'redis://localhost:6379',
  },
  NODE_ENV: {
    required: false,
    description: 'Node environment',
    defaultValue: 'development',
  },
};

function checkEnvironment() {
  console.log('\n🔍 Checking environment variables...\n');

  // Load .env file if it exists
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
      const match = line.match(/^([^=:#]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim().replace(/^["']|["']$/g, '');
        if (key && !key.startsWith('#')) {
          process.env[key] = value;
        }
      }
    });
    console.log('✅ Loaded .env file\n');
  } else {
    console.log('⚠️  .env file not found\n');
  }

  const errors = [];
  const warnings = [];

  for (const [key, config] of Object.entries(requiredEnvVars)) {
    const value = process.env[key];

    if (config.required && !value) {
      errors.push(`❌ ${key} is required: ${config.description}`);
    } else if (!value && config.defaultValue) {
      warnings.push(`⚠️  ${key} not set, will use default: ${config.defaultValue}`);
    } else if (value) {
      // Mask sensitive values
      const displayValue = key.includes('SECRET') || key.includes('PASSWORD') || key.includes('URL')
        ? (value.length > 20 ? value.substring(0, 10) + '...' : '***')
        : value;
      console.log(`✅ ${key}: ${displayValue}`);
    }
  }

  console.log('');

  if (warnings.length > 0) {
    console.warn('⚠️  Warnings:');
    warnings.forEach(warning => console.warn(`  ${warning}`));
    console.log('');
  }

  if (errors.length > 0) {
    console.error('❌ Missing required environment variables:');
    errors.forEach(error => console.error(`  ${error}`));
    console.log('\n💡 Create a .env file in the project root with the required variables.\n');
    process.exit(1);
  }

  // Additional validations
  if (process.env.DATABASE_URL) {
    if (!process.env.DATABASE_URL.startsWith('postgresql://') && 
        !process.env.DATABASE_URL.startsWith('postgres://')) {
      console.error('❌ DATABASE_URL must be a valid PostgreSQL connection string');
      process.exit(1);
    }
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.warn('⚠️  JWT_SECRET should be at least 32 characters long for security');
  }

  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error('❌ PORT must be a valid number between 1 and 65535');
      process.exit(1);
    }
  }

  console.log('✅ All environment checks passed!\n');
  return true;
}

if (require.main === module) {
  checkEnvironment();
}

module.exports = { checkEnvironment };

