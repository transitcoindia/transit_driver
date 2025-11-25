import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    console.log(`🔄 Redis retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: false, // Don't queue commands when offline
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('ready', () => console.log('✅ Redis ready'));
redis.on('error', (err) => {
  console.error('❌ Redis error:', err.message);
  const errorCode = (err as NodeJS.ErrnoException).code;
  console.error('Redis error code:', errorCode ?? 'unknown');
});
redis.on('close', () => console.warn('⚠️ Redis connection closed'));
redis.on('reconnecting', () => console.log('🔄 Redis reconnecting...'));

// Attempt to connect on startup (optional - remove if you want lazy connect)
if (process.env.REDIS_AUTO_CONNECT !== 'false') {
  redis.connect().catch((err) => {
    console.warn('⚠️ Redis auto-connect failed (will connect on first use):', err.message);
  });
}

export default redis;