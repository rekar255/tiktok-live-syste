const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'TikTok Live controller server is running' });
});

wss.on('connection', (ws) => {
  console.log('Client connected via WebSocket');
  ws.send(JSON.stringify({ type: 'welcome', message: 'Connected to controller' }));

  ws.on('message', (rawMessage) => {
    console.log('Received:', rawMessage.toString());
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
