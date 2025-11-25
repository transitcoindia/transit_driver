import { io, Socket } from 'socket.io-client';
import readline from 'readline';

import {
  API_GATEWAY_URL,
  API_GATEWAY_WS_URL,
  API_GATEWAY_PUBLIC_ORIGIN,
  SOCKET_IO_PATH,
  ENABLE_GATEWAY_SOCKET,
  NODE_ENV
} from '../config/env';

const formatError = (err: unknown): string => {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};

const resolveGatewayUrl = () => {
  if (API_GATEWAY_WS_URL) return API_GATEWAY_WS_URL;
  const normalized = API_GATEWAY_URL.replace(/^http/i, 'ws');
  return `${normalized}${SOCKET_IO_PATH}`;
};

export class DriverWebSocketClient {
  private socket: Socket | null = null;
  private driverId: string;
  private accessToken: string;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private connectionQueued = false;
  private static globalConnectionDelay = 0;

  constructor(driverId: string, accessToken: string) {
    this.driverId = driverId;
    this.accessToken = accessToken;

    if (!ENABLE_GATEWAY_SOCKET) {
      console.log('[Gateway WS] Disabled via ENABLE_GATEWAY_SOCKET flag.');
      return;
    }

    const gatewayUrl = resolveGatewayUrl();

    this.socket = io(gatewayUrl, {
      transports: NODE_ENV === 'production' ? ['websocket'] : ['websocket', 'polling'],
      upgrade: NODE_ENV !== 'production',
      forceNew: true,
      withCredentials: true,
      autoConnect: false,
      path: SOCKET_IO_PATH,
      timeout: 60000,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 8000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.8,
      extraHeaders: {
        Origin: API_GATEWAY_PUBLIC_ORIGIN || API_GATEWAY_URL,
        'User-Agent': 'DriverApp/1.0.0'
      },
      auth: {
        driverId: this.driverId,
        accessToken: this.accessToken
      }
    });

    this.registerEventHandlers();
    this.scheduleConnection();
  }

  private registerEventHandlers() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Connected to API Gateway WebSocket server');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.authenticate();
    });

    this.socket.on('authenticated', (response) => {
      console.log('🔐 Driver authenticated:', response);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('⚠️ Disconnected from API Gateway WebSocket server:', reason);
      this.isConnected = false;

      if (reason === 'io server disconnect') {
        this.socket?.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.warn('❌ Connection error:', formatError(error));
      this.reconnectAttempts++;

      const description = String((error as any)?.description || '');
      const message = `${formatError(error)} ${description}`.trim();

      if (message.includes('429')) {
        const backoffMs = 60000 + this.reconnectAttempts * 30000;
        console.warn(`Received 429. Backing off for ${backoffMs / 1000}s before retry.`);
        this.socket?.disconnect();
        setTimeout(() => {
          if (this.socket && !this.socket.connected) {
            console.log('Retrying gateway connection after backoff...');
            this.socket.connect();
          }
        }, backoffMs);
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Reconnected after', attemptNumber, 'attempt(s)');
      this.authenticate();
    });

    this.socket.on('reconnect_error', (error) => {
      console.error('Reconnection error:', formatError(error));
    });

    this.socket.on('reconnect_failed', () => {
      console.error('❗ Reconnection failed after', this.maxReconnectAttempts, 'attempts');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', formatError(error));
    });

    this.socket.on('newRideRequest', (rideData) => {
      console.log('🚘 New ride request:', rideData);
      this.promptAcceptOrReject(rideData.rideId);
    });

    this.socket.on('serverPing', (data) => {
      console.log('📡 Server ping:', data);
      this.socket?.emit('pong', { timestamp: Date.now() });
    });

    this.socket.on('connectionInfo', (data) => {
      console.log('ℹ️ Connection info:', data);
    });
  }

  private authenticate() {
    if (this.socket && this.isConnected) {
      console.log('Authenticating driver with gateway...');
      this.socket.emit('authenticate', {
        driverId: this.driverId,
        accessToken: this.accessToken
      });
    }
  }

  private promptAcceptOrReject(rideId: string) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`Accept ride ${rideId}? (y/n): `, (answer) => {
      if (answer.toLowerCase() === 'y') {
        this.acceptRide(rideId);
        console.log('Accepted ride:', rideId);
      } else {
        this.rejectRide(rideId);
        console.log('Rejected ride:', rideId);
      }
      rl.close();
    });
  }

  public async connect() {
    if (this.socket && !this.socket.connected) {
      await new Promise<void>((resolve) => {
        this.socket!.connect();
        this.socket!.once('connect', () => resolve());
      });
    }
  }

  public disconnect() {
    if (this.socket?.connected) {
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  public updateLocation(location: { latitude: number; longitude: number }) {
    if (this.isConnected && this.socket) {
      this.socket.emit('driverLocationUpdate', {
        driverId: this.driverId,
        location,
        timestamp: new Date().toISOString()
      });
    }
  }

  public acceptRide(rideId: string) {
    if (this.isConnected && this.socket) {
      this.socket.emit('acceptRide', {
        driverId: this.driverId,
        accessToken: this.accessToken,
        rideId,
        timestamp: new Date().toISOString()
      });
    }
  }

  public rejectRide(rideId: string) {
    if (this.isConnected && this.socket) {
      this.socket.emit('rejectRide', {
        driverId: this.driverId,
        rideId,
        timestamp: new Date().toISOString()
      });
    }
  }

  public on(event: string, callback: (data: any) => void) {
    this.socket?.on(event, callback);
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  public getSocketId(): string | undefined {
    return this.socket?.id;
  }

  private scheduleConnection() {
    if (!this.socket || this.connectionQueued) return;

    this.connectionQueued = true;
    DriverWebSocketClient.globalConnectionDelay += 2000;
    const delay = DriverWebSocketClient.globalConnectionDelay + Math.random() * 3000;

    console.log(`Scheduling gateway connection in ${(delay / 1000).toFixed(1)}s to avoid bursts...`);

    setTimeout(() => {
      this.connectionQueued = false;
      if (this.socket && !this.socket.connected) {
        this.socket.connect();
      }
    }, delay);
  }
}