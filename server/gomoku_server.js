const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

// roomId -> { players: [ws, ws], board: [][], turn: 0, gameOver: false }
const rooms = new Map();

const GRID = 15;

function makeBoard() {
  return Array.from({ length: GRID }, () => Array(GRID).fill(0));
}

function broadcast(room, msg, exclude = null) {
  const data = JSON.stringify(msg);
  for (const p of room.players) {
    if (p && p !== exclude) p.send(data);
  }
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

wss.on('connection', ws => {
  ws.roomId = null;
  ws.playerIndex = -1;
  ws.on('message', data => {
    try {
      const msg = JSON.parse(data);
      handle(ws, msg);
    } catch (e) { console.error(e); }
  });
  ws.on('close', () => {
    if (ws.roomId) {
      const room = rooms.get(ws.roomId);
      if (room) {
        if (!room.gameOver) {
          const other = room.players[1 - ws.playerIndex];
          if (other) other.send(JSON.stringify({ type: 'opponent_left' }));
        }
        const other = room.players[1 - ws.playerIndex];
        if (other && other !== ws) {
          other.roomId = null;
          other.playerIndex = -1;
        }
        rooms.delete(ws.roomId);
      }
    }
  });
});

function handle(ws, msg) {
  if (msg.type === 'create') {
    const roomId = Math.random().toString(36).slice(2, 8).toUpperCase();
    const room = {
      roomId,
      players: [ws, null],
      board: makeBoard(),
      turn: 0,
      gameOver: false,
      history: []
    };
    ws.roomId = roomId;
    ws.playerIndex = 0;
    ws.send(JSON.stringify({ type: 'created', roomId, playerIndex: 0 }));
    rooms.set(roomId, room);
    console.log(`Room ${roomId} created`);
  }

  else if (msg.type === 'join') {
    const { roomId } = msg;
    const room = rooms.get(roomId?.toUpperCase());
    if (!room) {
      ws.send(JSON.stringify({ type: 'error', message: '房间不存在' }));
      return;
    }
    if (room.players[1]) {
      ws.send(JSON.stringify({ type: 'error', message: '房间已满' }));
      return;
    }
    room.players[1] = ws;
    ws.roomId = roomId.toUpperCase();
    ws.playerIndex = 1;
    ws.send(JSON.stringify({ type: 'joined', roomId: roomId.toUpperCase() }));
    room.players[0].send(JSON.stringify({ type: 'opponent_joined' }));
    console.log(`Player joined room ${roomId}`);
  }

  else if (msg.type === 'move') {
    const { r, c } = msg;
    const room = rooms.get(ws.roomId);
    if (!room || room.gameOver) return;
    const expectedTurn = room.turn % 2;
    if (ws.playerIndex !== expectedTurn) {
      ws.send(JSON.stringify({ type: 'not_your_turn' }));
      return;
    }
    if (r < 0 || r >= GRID || c < 0 || c >= GRID || room.board[r][c]) {
      ws.send(JSON.stringify({ type: 'invalid_move' }));
      return;
    }

    const player = ws.playerIndex + 1;
    room.board[r][c] = player;
    room.history.push([r, c]);
    room.turn++;

    const win = checkWin(room.board, r, c, player);

    const moveMsg = {
      type: 'move',
      r, c, player,
      nextTurn: (expectedTurn + 1) % 2,
      totalMoves: room.turn,
      ...(win ? { win: true, winCells: win, winner: player } : {}),
      ...(room.turn === GRID * GRID ? { draw: true } : {})
    };

    broadcast(room, moveMsg);
    if (win) room.gameOver = true;
    if (room.turn === GRID * GRID) room.gameOver = true;
  }

  else if (msg.type === 'reset') {
    const room = rooms.get(ws.roomId);
    if (!room) return;
    room.board = makeBoard();
    room.turn = 0;
    room.gameOver = false;
    room.history = [];
    broadcast(room, { type: 'reset' });
  }
}

console.log(`Gomoku server running on port ${PORT}`);
