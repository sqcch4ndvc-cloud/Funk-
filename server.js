// Funk – einfacher Chat-Server (WebSocket-Relay mit Räumen)
// Kostenlos hostbar, z. B. auf Render.com

const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_HISTORY = 50; // Anzahl gespeicherter Nachrichten pro Raum

// Einfacher HTTP-Server, u. a. damit Render den Dienst erreichen kann
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Funk Chat-Server läuft.\n');
});

const wss = new WebSocket.Server({ server });

// roomName -> { clients: Set<WebSocket>, history: Array }
const rooms = new Map();

function getRoom(name) {
  if (!rooms.has(name)) {
    rooms.set(name, { clients: new Set(), history: [] });
  }
  return rooms.get(name);
}

function broadcast(roomName, data, exceptWs) {
  const room = rooms.get(roomName);
  if (!room) return;
  const payload = JSON.stringify(data);
  for (const client of room.clients) {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const roomName = (url.searchParams.get('room') || 'allgemein').toLowerCase().slice(0, 40);
  const userName = (url.searchParams.get('name') || 'Anonym').slice(0, 20);
  const userId = (url.searchParams.get('id') || Math.random().toString(36).slice(2)).slice(0, 20);

  ws.userName = userName;

  const room = getRoom(roomName);
  room.clients.add(ws);

  // Bisherigen Verlauf an den neuen Client schicken
  ws.send(JSON.stringify({ type: 'history', messages: room.history }));

  // Alle anderen im Raum informieren
  broadcast(roomName, { type: 'join', name: userName, time: Date.now() }, ws);

  ws.on('message', (raw) => {
    let data;
    try { data = JSON.parse(raw.toString()); } catch (e) { return; }

    if (data.type === 'msg' && typeof data.text === 'string' && data.text.trim()) {
      const out = {
        type: 'msg',
        name: userName,
        id: userId,
        text: data.text.slice(0, 2000),
        time: Date.now()
      };
      room.history.push(out);
      if (room.history.length > MAX_HISTORY) room.history.shift();
      broadcast(roomName, out, ws); // an alle außer den Absender (der zeigt seine Nachricht sofort selbst an)
    }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    broadcast(roomName, { type: 'leave', name: userName, time: Date.now() }, ws);
  });
});

server.listen(PORT, () => {
  console.log('Funk Chat-Server hört auf Port ' + PORT);
});
