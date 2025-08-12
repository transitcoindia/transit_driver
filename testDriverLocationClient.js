const WebSocket = require('ws');

const ws = new WebSocket('http://localhost:3000');

ws.on('open', function open() {
  // Send a location update every 5 seconds
  setInterval(() => {
    const latitude = 15.2993 + Math.random() * 0.01;
    const longitude = 74.124 + Math.random() * 0.01;
    ws.send(JSON.stringify({
      type: 'locationUpdate',
      driverId: 'test-driver-999',
      latitude,
      longitude
    }));
    console.log('Sent location:', latitude, longitude);
  }, 5000);
});

ws.on('message', function incoming(data) {
  console.log('Received:', data.toString());
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
}); 