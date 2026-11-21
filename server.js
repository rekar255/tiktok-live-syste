const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'TikTok Live controller server is running',
    clients: wss.clients.size
  });
});

// ناردنی فەرمان لە ڕێگەی HTTP POST بۆ هەموو کلاینتە بەستراوەکانی WebSocket
app.post('/command', (req, res) => {
  const { action, payload } = req.body || {};

  if (!action) {
    return res.status(400).json({ ok: false, error: 'Missing "action" field' });
  }

  const commandMessage = {
    type: 'command',
    action,
    payload: payload || {},
    timestamp: new Date().toISOString()
  };

  let sentCount = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(commandMessage));
      sentCount++;
    }
  });

  console.log(`[HTTP -> WS] Sent action "${action}" to ${sentCount} client(s)`);
  res.json({ ok: true, sentCount, command: commandMessage });
});

wss.on('connection', (ws) => {
  console.log('[WS] Client connected');

  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to TikTok Live controller'
  }));

  ws.on('message', (rawMessage) => {
    const text = rawMessage.toString();
    console.log('[WS] Raw message:', text);

    try {
      const data = JSON.parse(text);

      if (data.type === 'command' && data.action) {
        console.log(`[WS Command] Action: ${data.action}`, data.payload || '');

        ws.send(JSON.stringify({
          type: 'command_ack',
          action: data.action,
          status: 'received',
          timestamp: new Date().toISOString()
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'echo',
          received: data
        }));
      }
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON format'
      }));
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
