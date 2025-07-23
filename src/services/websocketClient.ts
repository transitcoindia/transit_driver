import { io, Socket } from 'socket.io-client';
import readline from 'readline';

export class DriverWebSocketClient {
  private socket: Socket;
  private driverId: string;
  private accessToken: string;

  constructor(driverId: string, accessToken: string) {
    this.driverId = driverId;
    this.accessToken = accessToken;
    this.socket = io(process.env.API_GATEWAY_WS_URL || 'http://localhost:3005', {
      auth: { driverId: this.driverId, accessToken: this.accessToken }
    });
    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.socket.on('connect', () => {
      console.log('Connected to WebSocket server');
      this.socket.emit('authenticate', { driverId: this.driverId, accessToken: this.accessToken });
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

    this.socket.on('newRideRequest', (rideData) => {
      console.log('Received new ride request:', rideData);
      this.promptAcceptOrReject(rideData.rideId);
    });
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
      accessToken: this.accessToken, // send token here
      rideId,
      timestamp: new Date().toISOString()
    });
  }

  public rejectRide(rideId: string) {
    this.socket.emit('rejectRide', {
      driverId: this.driverId,
      rideId,
      timestamp: new Date().toISOString()
    });
  }

  public on(event: string, callback: (data: any) => void) {
    this.socket.on(event, callback);
  }
}