import { Server as WebSocketServer } from 'ws';
import { Server as HTTPServer } from 'http';
import redis from '../redis';
import { getS2CellId } from '../s2';

export function initLocationWebSocketServer(httpServer: HTTPServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws: any) => {
    ws.on('message', async (message: any) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'locationUpdate' && data.driverId && data.latitude && data.longitude) {
          const { driverId, latitude, longitude } = data;
          const cellId = getS2CellId(latitude, longitude, 15);

          // Resolve rideId: from payload or from Redis mapping
          let rideId: string | null = data.rideId || null;
          if (!rideId) {
            rideId = await redis.get(`driver:active_ride:${driverId}`);
          }

          const payload = {
            rideId: rideId || undefined,
            driverId,
            latitude,
            longitude,
            cellId,
            timestamp: Date.now()
          };

          // Persist per-driver last location (short TTL) and cell membership
          await redis.set(`driver:location:${driverId}`, JSON.stringify(payload), 'EX', 300);
          await redis.sadd(`geo:cell:${cellId}`, driverId);

          // If we know the ride, persist per-ride last location as well
          if (rideId) {
            await redis.set(`ride:lastLocation:${rideId}`, JSON.stringify(payload), 'EX', 7200);
          }

          // Publish to subscribers (API Gateway)
          await redis.publish('driver_location_updates', JSON.stringify(payload));

          ws.send(JSON.stringify({ type: 'locationAck', status: 'ok' }));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ws.send(JSON.stringify({ type: 'error', message }));
      }
    });
  });

  console.log('WebSocket server for driver location running (integrated with HTTP server)');
} 