import { DriverWebSocketClient } from '../services/websocketClient';

interface RideRequestData {
    rideId: string;
    riderId: string;
    pickup: {
        latitude: number;
        longitude: number;
    };
    dropoff: {
        latitude: number;
        longitude: number;
    };
}

async function testDriverConnection() {
    console.log('Initializing driver test...');
    
    // Create a new driver client
    const driverClient = new DriverWebSocketClient('driver123');
    
    try {
        // Connect to the WebSocket server
        await driverClient.connect();
        console.log('Driver connected successfully');

        // Set up location updates
        setInterval(() => {
            const location = {
                latitude: 19.0760 + (Math.random() * 0.01),
                longitude: 72.8777 + (Math.random() * 0.01)
            };
            driverClient.updateLocation(location);
            console.log('Location updated:', location);
        }, 5000);

        // Listen for new ride requests
        driverClient.on('newRideRequest', (data: RideRequestData) => {
            console.log('Received new ride request:', data);
            
            // Simulate accepting the ride after a delay
            setTimeout(() => {
                driverClient.acceptRide(data.rideId);
                console.log('Accepted ride:', data.rideId);
            }, 2000);
        });

        // Keep the process running
        process.on('SIGINT', () => {
            console.log('Disconnecting driver...');
            driverClient.disconnect();
            process.exit();
        });

    } catch (error) {
        console.error('Error in driver test:', error);
        process.exit(1);
    }
}

// Run the test
testDriverConnection(); 