const WebSocket = require('ws');

const ws = new WebSocket('https://transit-driver.onrender.com');

ws.on('open', function open() {
  // Send a location update every 5 seconds
  setInterval(() => {
    const latitude = 77.62084;
    const longitude = 13.12286;
    ws.send(JSON.stringify({
      type: 'locationUpdate',
      driverId: 'test-driver-nitesh',
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