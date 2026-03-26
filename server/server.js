const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const HTTP_PORT = process.env.HTTP_PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

const GRID = 15;

function makeBoard() {
  return Array.from({ length: GRID }, () => Array(GRID).fill(0));
}

function checkWin(board, r, c, player) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    let cells = [[r, c]];
    for (let d = 1; d < 5; d++) {
      const nr = r + dr * d, nc = c + dc * d;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID || board[nr][nc] !== player) break;
      cells.push([nr, nc]);
    }
    for (let d = 1; d < 5; d++) {
      const nr = r - dr * d, nc = c - dc * d;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID || board[nr][nc] !== player) break;
      cells.push([nr, nc]);
    }
    if (cells.length >= 5) return cells.slice(0, 5);
  }
  return null;
}

// HTTP server - serves static files
const httpServer = http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') url = '/online.html';
  const filePath = path.join(__dirname, url);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

// WebSocket server
const wss = new WebSocket.Server({ server: httpServer });

const rooms = new Map();

wss.on('connection', ws => {
  ws.roomId = null;
  ws.playerIndex = -1;
  ws.on('message', data => {
    try { handle(ws, JSON.parse(data)); } catch (e) {}
  });
  ws.on('close', () => {
    if (ws.roomId) {
      const room = rooms.get(ws.roomId);
      if (room) {
        const other = room.players[1 - ws.playerIndex];
        if (other && !room.gameOver) other.send(JSON.stringify({ type: 'opponent_left' }));
        if (other && other !== ws) { other.roomId = null; other.playerIndex = -1; }
        rooms.delete(ws.roomId);
      }
    }
  });
});

function broadcast(room, msg, exclude = null) {
  const data = JSON.stringify(msg);
  for (const p of room.players) {
    if (p && p !== exclude && p.readyState === WebSocket.OPEN) p.send(data);
  }
}

function handle(ws, msg) {
  if (msg.type === 'create') {
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    const room = { roomId, players: [ws, null], board: makeBoard(), turn: 0, gameOver: false };
    ws.roomId = roomId; ws.playerIndex = 0;
    ws.send(JSON.stringify({ type: 'created', roomId, playerIndex: 0 }));
    rooms.set(roomId, room);
    console.log(`Room ${roomId} created`);
  }
  else if (msg.type === 'join') {
    const room = rooms.get(msg.roomId?.toUpperCase());
    if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return; }
    if (room.players[1]) { ws.send(JSON.stringify({ type: 'error', message: '房间已满' })); return; }
    room.players[1] = ws; ws.roomId = msg.roomId.toUpperCase(); ws.playerIndex = 1;
    ws.send(JSON.stringify({ type: 'joined', roomId: msg.roomId.toUpperCase() }));
    room.players[0].send(JSON.stringify({ type: 'opponent_joined' }));
    console.log(`Player joined ${msg.roomId}`);
  }
  else if (msg.type === 'move') {
    const room = rooms.get(ws.roomId);
    if (!room || room.gameOver) return;
    if (ws.playerIndex !== room.turn % 2) { ws.send(JSON.stringify({ type: 'not_your_turn' })); return; }
    const { r, c } = msg;
    if (r < 0 || r >= GRID || c < 0 || c >= GRID || room.board[r][c]) return;
    const player = ws.playerIndex + 1;
    room.board[r][c] = player;
    room.history = room.history || [];
    room.history.push([r, c]);
    room.turn++;
    const win = checkWin(room.board, r, c, player);
    const moveMsg = {
      type: 'move', r, c, player, nextTurn: room.turn % 2, totalMoves: room.turn,
      ...(win ? { win: true, winCells: win, winner: player } : {}),
      ...(room.turn === GRID * GRID ? { draw: true } : {})
    };
    broadcast(room, moveMsg);
    if (win || room.turn === GRID * GRID) room.gameOver = true;
  }
  else if (msg.type === 'reset') {
    const room = rooms.get(ws.roomId);
    if (!room) return;
    room.board = makeBoard(); room.turn = 0; room.gameOver = false; room.history = [];
    broadcast(room, { type: 'reset' });
  }
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${HTTP_PORT}`);
});
