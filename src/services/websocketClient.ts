import { io, Socket } from 'socket.io-client';

export class DriverWebSocketClient {
  private socket: Socket;
  private driverId: string;

  constructor(driverId: string) {
    this.driverId = driverId;
    this.socket = io('http://localhost:3005', {
      auth: {
        driverId: this.driverId
      }
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      this.socket.emit('authenticate', { driverId: this.driverId });
    });

    this.socket.on('authenticated', (response) => {
      console.log('Driver authenticated:', response);
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
    });

    this.socket.on('error', (error) => {
      console.error('WebSocket error:', error);
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
    }
  }

  public updateLocation(location: { latitude: number; longitude: number }) {
    this.socket.emit('driverLocationUpdate', {
      driverId: this.driverId,
      location,
      timestamp: new Date().toISOString()
    });
  }

  public acceptRide(rideId: string) {
    this.socket.emit('acceptRide', {
      driverId: this.driverId,
      rideId,
      timestamp: new Date().toISOString()
    });
  }

  public on(event: string, callback: (data: any) => void) {
    this.socket.on(event, callback);
  }
} 