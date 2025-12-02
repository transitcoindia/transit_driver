import { io, Socket } from 'socket.io-client';
import readline from 'readline';
import { API_GATEWAY_URL, API_GATEWAY_PUBLIC_ORIGIN } from '../config/env';

export class DriverWebSocketClient {
  private socket: Socket;
  private driverId: string;
  private accessToken: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private connectionQueue: boolean = false;
  private static globalConnectionDelay: number = 0;

  constructor(driverId: string, accessToken: string) {
    this.driverId = driverId;
    this.accessToken = accessToken;
    
    // Connect to API Gateway WebSocket server
    this.socket = io(API_GATEWAY_URL, {
      // In production, force pure WebSocket to avoid Cloudflare/host 429 on polling
      transports: process.env.NODE_ENV === 'production' ? ['websocket'] : ['websocket', 'polling'],
      upgrade: false,
      forceNew: true,
      withCredentials: true,
      autoConnect: false,
      path: '/socket.io/',
      timeout: 60000, // Increased timeout
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 8000, // Increased initial delay
      reconnectionDelayMax: 30000, // Increased max delay
      randomizationFactor: 0.8, // More randomization
      // Set explicit Origin for hosts that enforce WS origin checks
      extraHeaders: {
        Origin: API_GATEWAY_PUBLIC_ORIGIN || API_GATEWAY_URL,
        'User-Agent': 'DriverApp/1.0.0'
      },
      auth: { 
        driverId: this.driverId, 
        accessToken: this.accessToken 
      }
    });
    
    this.setupEventListeners();
    // Add staggered delay to prevent burst connections
    this.scheduleConnection();
  }

  private setupEventListeners() {
    this.socket.on('connect', () => {
      console.log(' Connected to API Gateway WebSocket server');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Authenticate immediately after connection
      this.authenticate();
    });

    this.socket.on('authenticated', (response) => {
      console.log(' Driver authenticated:', response);
    });

    this.socket.on('disconnect', (reason) => {
      console.log(' Disconnected from API Gateway WebSocket server:', reason);
      this.isConnected = false;
      
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        this.socket.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error(' Connection error:', error);
      this.reconnectAttempts++;
      
      // If the platform responds with 429, back off much longer to respect rate limits
      const message = (error && (error as any).message) || '';
      const description = (error && (error as any).description) || '';
      
      // Safely check for 429 errors - description might be an object, not a string
      const descriptionStr = typeof description === 'string' ? description : 
                            (description && typeof description === 'object' ? JSON.stringify(description) : '');
      
      if (
        (typeof message === 'string' && message.includes('429')) ||
        (typeof descriptionStr === 'string' && descriptionStr.includes('429')) ||
        (error && (error as any).type === 'TransportError' && typeof descriptionStr === 'string' && descriptionStr.includes('429'))
      ) {
        const backoffMs = 60000 + (this.reconnectAttempts * 30000); // 60s + 30s per attempt
        console.warn(` Received 429. Backing off for ${backoffMs / 1000}s before next attempt.`);
        
        // Disconnect and wait before reconnecting
        this.socket.disconnect();
        setTimeout(() => {
          if (!this.socket.connected) {
            console.log(` Attempting reconnection after ${backoffMs / 1000}s backoff...`);
            this.socket.connect();
          }
        }, backoffMs);
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(' Reconnected after', attemptNumber, 'attempts');
      this.authenticate();
    });

    this.socket.on('reconnect_error', (error) => {
      console.error(' Reconnection error:', error);
    });

    this.socket.on('reconnect_failed', () => {
      console.error(' Reconnection failed after', this.maxReconnectAttempts, 'attempts');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    this.socket.on('newRideRequest', (rideData) => {
      console.log('Received new ride request:', rideData);
      this.promptAcceptOrReject(rideData.rideId);
    });

    // Handle server ping to keep connection alive
    this.socket.on('serverPing', (data) => {
      console.log(' Server ping received:', data);
      // Respond with pong
      this.socket.emit('pong', { timestamp: Date.now() });
    });

    // Handle connection info
    this.socket.on('connectionInfo', (data) => {
      console.log(' Connection info:', data);
    });
  }

  private authenticate() {
    if (this.socket && this.isConnected) {
      console.log(' Authenticating driver...');
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
    if (!this.socket.connected) {
      await new Promise<void>((resolve) => {
        this.socket.connect();
        this.socket.once('connect', () => resolve());
      });
    }
  }

  public disconnect() {
    if (this.socket.connected) {
      this.socket.disconnect();
      this.isConnected = false;
    }
  }

  public updateLocation(location: { latitude: number; longitude: number }) {
    if (this.isConnected) {
      this.socket.emit('driverLocationUpdate', {
        driverId: this.driverId,
        location,
        timestamp: new Date().toISOString()
      });
    }
  }

  public acceptRide(rideId: string) {
    if (this.isConnected) {
      this.socket.emit('acceptRide', {
        driverId: this.driverId,
        accessToken: this.accessToken, // send token here
        rideId,
        timestamp: new Date().toISOString()
      });
    }
  }

  public rejectRide(rideId: string) {
    if (this.isConnected) {
      this.socket.emit('rejectRide', {
        driverId: this.driverId,
        rideId,
        timestamp: new Date().toISOString()
      });
    }
  }

  public on(event: string, callback: (data: any) => void) {
    this.socket.on(event, callback);
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  public getSocketId(): string | undefined {
    return this.socket.id;
  }

  private scheduleConnection() {
    if (this.connectionQueue) {
      return; // Already queued
    }
    
    this.connectionQueue = true;
    
    // Add global delay to prevent simultaneous connections
    DriverWebSocketClient.globalConnectionDelay += 2000; // 2 seconds between connections
    const delay = DriverWebSocketClient.globalConnectionDelay + Math.random() * 3000;
    
    console.log(` Scheduling connection in ${delay / 1000}s to avoid burst...`);
    
    setTimeout(() => {
      this.connectionQueue = false;
      if (!this.socket.connected) {
        this.socket.connect();
      }
    }, delay);
  }
}