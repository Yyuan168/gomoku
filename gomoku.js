/**
 * Gomoku (Five in a Row) Game
 * Board: 15x15 grid
 * Players: Black (1) and White (2)
 * Win condition: 5 consecutive pieces in any direction
 */

const BOARD_SIZE = 15;
const CELL_SIZE = 40;          // pixels between grid lines
const PADDING = 20;             // margin around the board
const PIECE_RADIUS = 17;

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const playerInfoEl = document.getElementById("player-info");
const currentPlayerText = document.getElementById("current-player-text");
const resultOverlay = document.getElementById("result-overlay");
const resultText = document.getElementById("result-text");
const restartBtn = document.getElementById("restart-btn");
const playAgainBtn = document.getElementById("play-again-btn");

// 0 = empty, 1 = black, 2 = white
let board = [];
let currentPlayer = 1; // 1 = black, 2 = white
let gameOver = false;

function initBoard() {
  board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0));
  currentPlayer = 1;
  gameOver = false;
  resultOverlay.classList.add("hidden");
  updatePlayerInfo();
  drawBoard();
}

function updatePlayerInfo() {
  const pieceEl = playerInfoEl.querySelector(".piece");
  if (currentPlayer === 1) {
    pieceEl.className = "piece black-piece";
    currentPlayerText.textContent = "黑棋行棋";
  } else {
    pieceEl.className = "piece white-piece";
    currentPlayerText.textContent = "白棋行棋";
  }
}

/* ─── Drawing ─────────────────────────────────────────── */

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Background
  ctx.fillStyle = "#deb887";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = "#8b4513";
  ctx.lineWidth = 1;

  for (let i = 0; i < BOARD_SIZE; i++) {
    const x = PADDING + i * CELL_SIZE;
    const y = PADDING + i * CELL_SIZE;

    // Vertical
    ctx.beginPath();
    ctx.moveTo(x, PADDING);
    ctx.lineTo(x, PADDING + (BOARD_SIZE - 1) * CELL_SIZE);
    ctx.stroke();

    // Horizontal
    ctx.beginPath();
    ctx.moveTo(PADDING, y);
    ctx.lineTo(PADDING + (BOARD_SIZE - 1) * CELL_SIZE, y);
    ctx.stroke();
  }

  // Star points (standard gomoku/go board dots)
  const stars = [3, 7, 11];
  ctx.fillStyle = "#8b4513";
  for (const r of stars) {
    for (const c of stars) {
      const cx = PADDING + c * CELL_SIZE;
      const cy = PADDING + r * CELL_SIZE;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw pieces
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] !== 0) {
        drawPiece(r, c, board[r][c]);
      }
    }
  }
}

function drawPiece(row, col, player) {
  const cx = PADDING + col * CELL_SIZE;
  const cy = PADDING + row * CELL_SIZE;

  ctx.beginPath();
  ctx.arc(cx, cy, PIECE_RADIUS, 0, Math.PI * 2);

  if (player === 1) {
    // Black piece with highlight
    const grad = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, PIECE_RADIUS);
    grad.addColorStop(0, "#888");
    grad.addColorStop(1, "#000");
    ctx.fillStyle = grad;
  } else {
    // White piece with highlight
    const grad = ctx.createRadialGradient(cx - 5, cy - 5, 2, cx, cy, PIECE_RADIUS);
    grad.addColorStop(0, "#fff");
    grad.addColorStop(1, "#bbb");
    ctx.fillStyle = grad;
  }

  ctx.fill();
  ctx.strokeStyle = player === 1 ? "#333" : "#999";
  ctx.lineWidth = 1;
  ctx.stroke();
}

/* ─── Game Logic ──────────────────────────────────────── */

function checkWin(row, col, player) {
  const directions = [
    [0, 1],   // horizontal
    [1, 0],   // vertical
    [1, 1],   // diagonal ↘
    [1, -1],  // diagonal ↙
  ];

  for (const [dr, dc] of directions) {
    let count = 1;

    // Count in positive direction
    for (let i = 1; i < 5; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== player) break;
      count++;
    }

    // Count in negative direction
    for (let i = 1; i < 5; i++) {
      const r = row - dr * i;
      const c = col - dc * i;
      if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE || board[r][c] !== player) break;
      count++;
    }

    if (count >= 5) return true;
  }
  return false;
}

function isBoardFull() {
  return board.every(row => row.every(cell => cell !== 0));
}

/* ─── Input Handling ──────────────────────────────────── */

canvas.addEventListener("click", (e) => {
  if (gameOver) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  // Convert pixel position to nearest grid intersection
  const col = Math.round((x - PADDING) / CELL_SIZE);
  const row = Math.round((y - PADDING) / CELL_SIZE);

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return;
  if (board[row][col] !== 0) return;

  board[row][col] = currentPlayer;
  drawBoard();

  if (checkWin(row, col, currentPlayer)) {
    gameOver = true;
    const winner = currentPlayer === 1 ? "黑棋" : "白棋";
    resultText.textContent = `🎉 ${winner} 获胜！`;
    resultOverlay.classList.remove("hidden");
    return;
  }

  if (isBoardFull()) {
    gameOver = true;
    resultText.textContent = "平局！";
    resultOverlay.classList.remove("hidden");
    return;
  }

  currentPlayer = currentPlayer === 1 ? 2 : 1;
  updatePlayerInfo();
});

/* ─── Cursor ──────────────────────────────────────────── */

canvas.addEventListener("mousemove", (e) => {
  if (gameOver) {
    canvas.style.cursor = "default";
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  const col = Math.round((x - PADDING) / CELL_SIZE);
  const row = Math.round((y - PADDING) / CELL_SIZE);

  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE || board[row][col] !== 0) {
    canvas.style.cursor = "default";
  } else {
    canvas.style.cursor = "pointer";
  }
});

/* ─── Controls ────────────────────────────────────────── */

restartBtn.addEventListener("click", initBoard);
playAgainBtn.addEventListener("click", initBoard);

/* ─── Start ───────────────────────────────────────────── */
initBoard();
