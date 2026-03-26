const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const GRID = 15;

function makeBoard() {
  return Array.from({ length: GRID }, () => Array(GRID).fill(0));
}

function checkWin(board, r, c, player) {
  var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (var i = 0; i < dirs.length; i++) {
    var dr = dirs[i][0], dc = dirs[i][1];
    var cells = [[r, c]];
    for (var d = 1; d < 5; d++) {
      var nr = r + dr * d, nc = c + dc * d;
      if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID || board[nr][nc] !== player) break;
      cells.push([nr, nc]);
    }
    for (var d2 = 1; d2 < 5; d2++) {
      var nr2 = r - dr * d2, nc2 = c - dc * d2;
      if (nr2 < 0 || nr2 >= GRID || nc2 < 0 || nc2 >= GRID || board[nr2][nc2] !== player) break;
      cells.push([nr2, nc2]);
    }
    if (cells.length >= 5) return cells.slice(0, 5);
  }
  return null;
}

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css'
};

var httpServer = http.createServer(function(req, res) {
  var url = req.url.split('?')[0];
  if (url === '/' || url === '/index.html') url = '/online.html';
  var filePath = path.join(__dirname, url);
  fs.readFile(filePath, function(err, data) {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    var ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

var wss = new WebSocket.Server({ server: httpServer });
var rooms = new Map();

wss.on('connection', function(ws) {
  ws.roomId = null;
  ws.playerIndex = -1;
  ws.on('message', function(data) {
    try { handle(ws, JSON.parse(data)); } catch (e) {}
  });
  ws.on('close', function() {
    if (ws.roomId) {
      var room = rooms.get(ws.roomId);
      if (room) {
        var other = room.players[1 - ws.playerIndex];
        if (other && !room.gameOver) other.send(JSON.stringify({ type: 'opponent_left' }));
        if (other && other !== ws) { other.roomId = null; other.playerIndex = -1; }
        rooms.delete(ws.roomId);
      }
    }
  });
});

function broadcast(room, msg, exclude) {
  var data = JSON.stringify(msg);
  for (var i = 0; i < room.players.length; i++) {
    var p = room.players[i];
    if (p && p !== exclude && p.readyState === WebSocket.OPEN) p.send(data);
  }
}

function handle(ws, msg) {
  if (msg.type === 'create') {
    var roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    var room = { roomId: roomId, players: [ws, null], board: makeBoard(), turn: 0, gameOver: false, history: [] };
    ws.roomId = roomId;
    ws.playerIndex = 0;
    ws.send(JSON.stringify({ type: 'created', roomId: roomId, playerIndex: 0 }));
    rooms.set(roomId, room);
    console.log('Room ' + roomId + ' created');
  } else if (msg.type === 'join') {
    var room = rooms.get(msg.roomId ? msg.roomId.toUpperCase() : '');
    if (!room) { ws.send(JSON.stringify({ type: 'error', message: '房间不存在' })); return; }
    if (room.players[1]) { ws.send(JSON.stringify({ type: 'error', message: '房间已满' })); return; }
    room.players[1] = ws;
    ws.roomId = msg.roomId.toUpperCase();
    ws.playerIndex = 1;
    ws.send(JSON.stringify({ type: 'joined', roomId: msg.roomId.toUpperCase() }));
    room.players[0].send(JSON.stringify({ type: 'opponent_joined' }));
    console.log('Player joined ' + msg.roomId);
  } else if (msg.type === 'move') {
    var room = rooms.get(ws.roomId);
    if (!room || room.gameOver) return;
    if (ws.playerIndex !== room.turn % 2) { ws.send(JSON.stringify({ type: 'not_your_turn' })); return; }
    var r = msg.r, c = msg.c;
    if (r < 0 || r >= GRID || c < 0 || c >= GRID || room.board[r][c]) return;
    var player = ws.playerIndex + 1;
    room.board[r][c] = player;
    room.history.push([r, c]);
    room.turn++;
    var win = checkWin(room.board, r, c, player);
    var moveMsg = {
      type: 'move', r: r, c: c, player: player,
      nextTurn: room.turn % 2, totalMoves: room.turn
    };
    if (win) { moveMsg.win = true; moveMsg.winCells = win; moveMsg.winner = player; }
    if (room.turn === GRID * GRID) moveMsg.draw = true;
    broadcast(room, moveMsg);
    if (win || room.turn === GRID * GRID) room.gameOver = true;
  } else if (msg.type === 'reset') {
    var room2 = rooms.get(ws.roomId);
    if (!room2) return;
    room2.board = makeBoard();
    room2.turn = 0;
    room2.gameOver = false;
    room2.history = [];
    broadcast(room2, { type: 'reset' });
  }
}

httpServer.listen(PORT, '0.0.0.0', function() {
  console.log('Server running at http://0.0.0.0:' + PORT);
});
