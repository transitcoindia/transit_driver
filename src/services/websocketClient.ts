import { io, Socket } from 'socket.io-client';
import readline from 'readline';

export class DriverWebSocketClient {
  private socket: Socket;
  private driverId: string;
  private accessToken: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor(driverId: string, accessToken: string) {
    this.driverId = driverId;
    this.accessToken = accessToken;
    
    // Connect to API Gateway WebSocket server
    const gatewayUrl = process.env.API_GATEWAY_WS_URL || process.env.API_GATEWAY_URL || 'http://localhost:3005';
    this.socket = io(gatewayUrl, {
      // In production, force pure WebSocket to avoid Cloudflare/host 429 on polling
      transports: process.env.NODE_ENV === 'production' ? ['websocket'] : ['websocket', 'polling'],
      upgrade: false,
      forceNew: true,
      withCredentials: true,
      autoConnect: false,
      path: '/socket.io/',
      timeout: 45000,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 4000,
      reconnectionDelayMax: 20000,
      randomizationFactor: 0.6,
      // Set explicit Origin for hosts that enforce WS origin checks
      extraHeaders: {
        Origin: process.env.API_GATEWAY_PUBLIC_ORIGIN || 'https://api-gateway-transit.onrender.com'
      },
      auth: { 
        driverId: this.driverId, 
        accessToken: this.accessToken 
      }
    });
    
    this.setupEventListeners();
    // Delay initial connect slightly to avoid burst connects during login
    setTimeout(() => this.socket.connect(), 500);
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
      // If the platform responds with 429, back off longer to respect rate limits
      const message = (error && (error as any).message) || '';
      if (typeof message === 'string' && message.includes('429')) {
        const backoffMs = 30000; // 30s cool-down on 429
        console.warn(` Received 429. Backing off for ${backoffMs / 1000}s before next attempt.`);
        setTimeout(() => {
          if (!this.socket.connected) {
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
}