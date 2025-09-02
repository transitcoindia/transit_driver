import express from 'express';
import redis from '../redis';
import { getS2CellId } from '../s2';
import { CHANNELS, DRIVER_LOCATION_TTL_SECONDS, RIDE_LAST_LOCATION_TTL_SECONDS } from '../config/env';

export const s2LocationIngest = express.Router();
export const s2LocationIngestPublic = express.Router();

// Authenticated ingest (expects authenticate middleware when mounted)
s2LocationIngest.post('/location', async (req, res) => {
  try {
    const { driverId, latitude, longitude, rideId } = req.body || {};
    if (!driverId || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'driverId, latitude, longitude are required' });
    }

    const cellId = getS2CellId(latitude, longitude, 15);
    const payload = {
      rideId: rideId || (await redis.get(`driver:active_ride:${driverId}`)) || undefined,
      driverId,
      latitude,
      longitude,
      cellId,
      timestamp: Date.now()
    };

    await redis.set(`driver:location:${driverId}`, JSON.stringify(payload), 'EX', DRIVER_LOCATION_TTL_SECONDS);
    await redis.sadd(`geo:cell:${cellId}`, driverId);
    if (payload.rideId) {
      await redis.set(`ride:lastLocation:${payload.rideId}`, JSON.stringify(payload), 'EX', RIDE_LAST_LOCATION_TTL_SECONDS);
    }
    await redis.publish(CHANNELS.DRIVER_LOCATION_UPDATES, JSON.stringify(payload));

    return res.json({ success: true, payload });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to ingest location', details: err.message });
  }
});

// Public testing ingest (no auth)
s2LocationIngestPublic.post('/location', async (req, res) => {
  try {
    const { driverId, latitude, longitude, rideId } = req.body || {};
    if (!driverId || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'driverId, latitude, longitude are required' });
    }

    const cellId = getS2CellId(latitude, longitude, 15);
    const payload = {
      rideId,
      driverId,
      latitude,
      longitude,
      cellId,
      timestamp: Date.now()
    };

    await redis.set(`driver:location:${driverId}`, JSON.stringify(payload), 'EX', DRIVER_LOCATION_TTL_SECONDS);
    await redis.sadd(`geo:cell:${cellId}`, driverId);
    if (rideId) {
      await redis.set(`ride:lastLocation:${rideId}`, JSON.stringify(payload), 'EX', RIDE_LAST_LOCATION_TTL_SECONDS);
    }
    await redis.publish(CHANNELS.DRIVER_LOCATION_UPDATES, JSON.stringify(payload));

    return res.json({ success: true, payload });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to ingest location', details: err.message });
  }
});


