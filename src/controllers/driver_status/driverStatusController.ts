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
  } catch (error) {
    console.error('❌ Failed to activate subscription', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};


