// Test script to verify health check functionality
// Run: cd new-server-ts && node test-health-check.mjs

import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8080';
const FAILURES_TO_TEST = 5;

console.log(`Testing health check: will send ${FAILURES_TO_TEST} audio messages to trigger auto-shutdown...\n`);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('Connected to server');

  // Send audio messages (which will fail with "No active Gemini client")
  for (let i = 1; i <= FAILURES_TO_TEST; i++) {
    setTimeout(() => {
      console.log(`Sending audio message ${i}/${FAILURES_TO_TEST}`);
      ws.send(JSON.stringify({ type: 'audio', data: 'dGVzdCBhdWRpbw==' })); // base64 "test audio"
    }, i * 1000);
  }
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', msg);
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', () => {
  console.log('Connection closed');
});

// Timeout after 15 seconds
setTimeout(() => {
  console.log('Test timeout - closing connection');
  ws.close();
  process.exit(0);
}, 15000);