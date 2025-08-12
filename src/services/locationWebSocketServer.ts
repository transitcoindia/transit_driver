import { Server as WebSocketServer } from 'ws';
import { Server as HTTPServer } from 'http';
import redis from '../redis';
import { getS2CellId } from '../s2';

export function initLocationWebSocketServer(httpServer: HTTPServer) {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.type === 'locationUpdate' && data.driverId && data.latitude && data.longitude) {
          const { driverId, latitude, longitude } = data;
          const cellId = getS2CellId(latitude, longitude, 15);
          await redis.set(`driver:location:${driverId}`, JSON.stringify({ latitude, longitude, timestamp: Date.now() }));
          await redis.sadd(`geo:cell:${cellId}`, driverId);
          await redis.publish('driver_location_updates', JSON.stringify({
            driverId, latitude, longitude, cellId, timestamp: Date.now()
          }));
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