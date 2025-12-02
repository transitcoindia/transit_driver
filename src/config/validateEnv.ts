/**
 * Environment variable validation
 * Validates all required environment variables on startup
 */

interface RequiredEnvVars {
  [key: string]: {
    required: boolean;
    description: string;
    defaultValue?: string;
  };
}

const requiredEnvVars: RequiredEnvVars = {
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
    description: 'Node environment (development, production, test)',
    defaultValue: 'development',
  },
};

export function validateEnvironment(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log('\n🔍 Validating environment variables...\n');

  for (const [key, config] of Object.entries(requiredEnvVars)) {
    const value = process.env[key];

    if (config.required && !value) {
      errors.push(`❌ ${key} is required: ${config.description}`);
    } else if (!value && config.defaultValue) {
      warnings.push(`⚠️  ${key} not set, using default: ${config.defaultValue}`);
      process.env[key] = config.defaultValue;
    } else if (value) {
      console.log(`✅ ${key} is set`);
    }
  }

  // Additional validations
  if (process.env.DATABASE_URL) {
    if (!process.env.DATABASE_URL.startsWith('postgresql://') && 
        !process.env.DATABASE_URL.startsWith('postgres://')) {
      errors.push('❌ DATABASE_URL must be a valid PostgreSQL connection string');
    }
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    warnings.push('⚠️  JWT_SECRET should be at least 32 characters long for security');
  }

  if (process.env.PORT) {
    const port = parseInt(process.env.PORT, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('❌ PORT must be a valid number between 1 and 65535');
    }
  }

  console.log('\n');

  if (warnings.length > 0) {
    console.warn('⚠️  Warnings:');
    warnings.forEach(warning => console.warn(`  ${warning}`));
    console.log('');
  }

  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(error => console.error(`  ${error}`));
    console.log('\n');
    return { valid: false, errors, warnings };
  }

  console.log('✅ All required environment variables are set\n');
  return { valid: true, errors: [], warnings };
}

export function printEnvironmentInfo(): void {
  console.log('📋 Environment Configuration:');
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   PORT: ${process.env.PORT || '3000'}`);
  console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✅ Set' : '❌ Missing'}`);
  console.log(`   REDIS_URL: ${process.env.REDIS_URL ? '✅ Set' : '⚠️  Using default'}`);
  console.log(`   JWT_SECRET: ${process.env.JWT_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log('');
}

