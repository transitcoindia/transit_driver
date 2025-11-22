import type { Request, Response } from 'express';

import redis from '../../clients/redis';

export const activateSubscription = async (req: Request, res: Response) => {
  try {
    const driverId = req.driver?.id;

    if (!driverId) {
      return res.status(401).json({
        success: false,
        message: 'Driver not authenticated',
      });
    }

    // Check Redis connection and connect if needed
    if (redis.status !== 'ready' && redis.status !== 'connect') {
      console.warn('⚠️ Redis not ready, attempting to connect...');
      try {
        await redis.connect();
      } catch (connectError: any) {
        console.error('❌ Failed to connect to Redis:', connectError);
        return res.status(503).json({
          success: false,
          message: 'Redis service unavailable. Please try again later.',
          error: process.env.NODE_ENV === 'development' ? connectError.message : undefined,
        });
      }
    }

    const durationMinutes = Number(req.body?.durationMinutes ?? 60);
    const subscriptionMs = Math.max(1, durationMinutes) * 60_000;
    const expiresAt = new Date(Date.now() + subscriptionMs);

    const key = `driver:${driverId}:status`;
    const payload = {
      status: 'available',
      updatedAt: new Date().toISOString(),
      subscriptionExpiry: expiresAt.toISOString(),
    };

    await redis.set(
      key,
      JSON.stringify(payload),
      'EX',
      Math.max(1, Math.floor(subscriptionMs / 1000)),
    );

    return res.status(200).json({
      success: true,
      data: {
        key,
        payload,
      },
    });
  } catch (error: any) {
    console.error('❌ Failed to activate subscription', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    
    // Provide more specific error messages
    if (error.message?.includes('ECONNREFUSED') || 
        error.message?.includes('Redis') || 
        error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        message: 'Redis service unavailable. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};


