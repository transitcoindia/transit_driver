import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const redisUrl = process.env.REDIS_URL;

// Make Redis optional - driver service should continue to work without it
let redis: Redis | null = null;

if (redisUrl) {
  try {
    redis = new Redis(redisUrl, {
      retryStrategy: (times: number) => {
        if (times > 100) {
          console.error(
            "❌ Redis connection failed after 100 attempts. Continuing without Redis."
          );
          return null;
        }
        const delay = Math.min(times * 50, 2000);
        if (times % 10 === 0) {
          console.log(
            `🔄 Redis (driver) reconnecting (attempt ${times}) in ${delay}ms...`
          );
        }
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: false,
      connectTimeout: 10000,
      lazyConnect: true,
      keepAlive: 30000,
    });

    redis.on("connect", () => {
      console.log("✅ Redis (driver) connected");
    });

    redis.on("ready", () => {
      console.log("✅ Redis (driver) ready");
    });

    redis.on("error", (error: Error) => {
      if (error.message.includes("ENOTFOUND")) {
        if (Math.random() < 0.01) {
          console.error(
            "❌ Redis (driver) DNS error. Service will continue without Redis."
          );
        }
        return;
      }

      if (error.message.includes("ECONNRESET")) {
        if (Math.random() < 0.1) {
          console.log("⚠️ Redis (driver) connection reset");
        }
      } else if (error.message.includes("ECONNREFUSED")) {
        console.error(
          "❌ Redis (driver) connection refused - continuing without Redis"
        );
      } else if (error.message.includes("ETIMEDOUT")) {
        if (Math.random() < 0.1) {
          console.log("⚠️ Redis (driver) connection timeout");
        }
      }
    });

    redis.on("close", () => {
      // Expected if Redis is unavailable; no noisy logs
    });

    redis.on("reconnecting", () => {
      // Handled via retryStrategy
    });

    redis.on("end", () => {
      // Suppress end messages
    });

    // Try connecting, but don't block the app if it fails
    redis.connect().catch((err) => {
      console.warn(
        "⚠️ Redis (driver) initial connection failed. Service will continue without Redis."
      );
      console.warn(`   Error: ${err.message}`);
      redis = null;
    });
  } catch (error: any) {
    console.warn(
      "⚠️ Redis (driver) initialization failed. Service will continue without Redis."
    );
    console.warn(`   Error: ${error.message}`);
    redis = null;
  }
} else {
  console.warn("⚠️ REDIS_URL not set. Driver service will run without Redis.");
}

const redisWrapper = {
  get: async (key: string) => {
    if (!redis) return null;
    try {
      return await redis.get(key);
    } catch (e) {
      console.warn(
        `Redis (driver) get failed for key ${key}:`,
        (e as Error).message
      );
      return null;
    }
  },
  set: async (
    key: string,
    value: string,
    mode?: string,
    duration?: number
  ) => {
    if (!redis) return "OK";
    try {
      if (mode && duration) {
        return await redis.set(key, value, mode as any, duration);
      }
      return await redis.set(key, value);
    } catch (e) {
      console.warn(
        `Redis (driver) set failed for key ${key}:`,
        (e as Error).message
      );
      return "OK";
    }
  },
  del: async (key: string) => {
    if (!redis) return 0;
    try {
      return await redis.del(key);
    } catch (e) {
      console.warn(
        `Redis (driver) del failed for key ${key}:`,
        (e as Error).message
      );
      return 0;
    }
  },
  client: redis,
  isConnected: () => redis !== null && redis.status === "ready",
};

export default redisWrapper as any;

