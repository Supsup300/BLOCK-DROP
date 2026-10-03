(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BlockDropEngine = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SIZE = 8;
  const COLORS = ["blue", "turquoise", "green", "yellow", "orange", "red", "violet"];

  const SHAPES = [
    { id: "dot", tier: "small", cells: [[0, 0]], weight: 10 },
    { id: "bar2h", tier: "small", cells: [[0, 0], [0, 1]], weight: 9 },
    { id: "bar2v", tier: "small", cells: [[0, 0], [1, 0]], weight: 9 },
    { id: "corner3a", tier: "small", cells: [[0, 0], [1, 0], [1, 1]], weight: 8 },
    { id: "corner3b", tier: "small", cells: [[0, 1], [1, 0], [1, 1]], weight: 8 },
    { id: "corner3c", tier: "small", cells: [[0, 0], [0, 1], [1, 0]], weight: 8 },
    { id: "corner3d", tier: "small", cells: [[0, 0], [0, 1], [1, 1]], weight: 8 },
    { id: "bar3h", tier: "medium", cells: [[0, 0], [0, 1], [0, 2]], weight: 8 },
    { id: "bar3v", tier: "medium", cells: [[0, 0], [1, 0], [2, 0]], weight: 8 },
    { id: "square2", tier: "medium", cells: [[0, 0], [0, 1], [1, 0], [1, 1]], weight: 8 },
    { id: "t4", tier: "medium", cells: [[0, 0], [0, 1], [0, 2], [1, 1]], weight: 6 },
    { id: "t4down", tier: "medium", cells: [[0, 1], [1, 0], [1, 1], [1, 2]], weight: 6 },
    { id: "z4", tier: "medium", cells: [[0, 0], [0, 1], [1, 1], [1, 2]], weight: 6 },
    { id: "s4", tier: "medium", cells: [[0, 1], [0, 2], [1, 0], [1, 1]], weight: 6 },
    { id: "l4", tier: "medium", cells: [[0, 0], [1, 0], [2, 0], [2, 1]], weight: 6 },
    { id: "l4r", tier: "medium", cells: [[0, 1], [1, 1], [2, 0], [2, 1]], weight: 6 },
    { id: "bar4h", tier: "large", cells: [[0, 0], [0, 1], [0, 2], [0, 3]], weight: 4 },
    { id: "bar4v", tier: "large", cells: [[0, 0], [1, 0], [2, 0], [3, 0]], weight: 4 },
    { id: "l5", tier: "large", cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]], weight: 3 },
    { id: "square3", tier: "large", cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]], weight: 1.2 }
  ].map((shape) => ({ ...shape, ...bounds(shape.cells) }));

  function bounds(cells) {
    return {
      rows: Math.max(...cells.map((cell) => cell[0])) + 1,
      cols: Math.max(...cells.map((cell) => cell[1])) + 1
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function shuffle(list, random) {
    const output = list.slice();
    for (let i = output.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [output[i], output[j]] = [output[j], output[i]];
    }
    return output;
  }

  function weightedChoice(list, random, density) {
    const weighted = list.map((shape) => {
      let value = shape.weight;
      if (density > .58 && shape.tier === "large") value *= .42;
      if (density > .68 && shape.tier === "small") value *= 1.45;
      if (density < .22 && shape.tier === "large") value *= 1.2;
      return [shape, value];
    });
    const total = weighted.reduce((sum, entry) => sum + entry[1], 0);
    let cursor = random() * total;
    for (const [shape, weight] of weighted) {
      cursor -= weight;
      if (cursor <= 0) return shape;
    }
    return weighted[weighted.length - 1][0];
  }

  function placementCount(board, shape) {
    let count = 0;
    for (let row = 0; row <= SIZE - shape.rows; row += 1) {
      for (let col = 0; col <= SIZE - shape.cols; col += 1) {
        if (shape.cells.every(([dr, dc]) => !board[(row + dr) * SIZE + col + dc])) count += 1;
      }
    }
    return count;
  }

  class PieceGenerator {
    constructor(random = Math.random) {
      this.random = random;
      this.sequence = 0;
    }

    generate(board, round = 0) {
      const density = board.filter(Boolean).length / (SIZE * SIZE);
      const buckets = density > .58
        ? ["small", "small", "medium"]
        : ["small", "medium", density < .46 && round >= 3 && this.random() < .32 ? "large" : "medium"];
      const colors = shuffle(COLORS, this.random);
      const pieces = shuffle(buckets, this.random).map((tier, index) => {
        let candidates = SHAPES.filter((shape) => shape.tier === tier &&
          (shape.id !== "square3" || (round >= 5 && density < .28)) &&
          (tier !== "large" || placementCount(board, shape) >= 3));
        if (!candidates.length) candidates = SHAPES.filter((shape) => shape.tier === "medium");
        const playable = candidates.filter((shape) => placementCount(board, shape) > 0);
        const guided = index === 0 || density < .42 || this.random() < .12;
        if (guided && playable.length) candidates = playable;
        else if (guided) {
          const rescue = SHAPES.filter((shape) => shape.tier === "small" && placementCount(board, shape) > 0);
          if (rescue.length) candidates = rescue;
        }
        const shape = weightedChoice(candidates, this.random, density);
        this.sequence += 1;
        return {
          uid: `r${round}-p${this.sequence}-${index}`,
          shapeId: shape.id,
          cells: shape.cells.map((cell) => cell.slice()),
          rows: shape.rows,
          cols: shape.cols,
          color: colors[index % colors.length],
          used: false
        };
      });
      return pieces;
    }
  }

  class GameEngine {
    constructor(state = null, options = {}) {
      this.random = options.random || Math.random;
      this.generator = new PieceGenerator(this.random);
      if (!state || !this.load(state)) this.newGame();
    }

    newGame() {
      this.board = Array(SIZE * SIZE).fill(null);
      this.score = 0;
      this.combo = 0;
      this.bestCombo = 1;
      this.round = 1;
      this.moves = 0;
      this.gameOver = false;
      this.usedSecondChance = false;
      this.bonuses = { eraser: 1, redraw: 1 };
      this.bonusProgress = { eraser: 0, redraw: 0 };
      this.bonusRefills = { eraser: 0, redraw: 0 };
      this.pieces = this.generator.generate(this.board, this.round);
      return this.getState();
    }

    load(state) {
      try {
        if (!state || !Array.isArray(state.board) || state.board.length !== SIZE * SIZE) return false;
        if (!Array.isArray(state.pieces) || state.pieces.length !== 3) return false;
        this.board = state.board.map((cell) => COLORS.includes(cell) ? cell : null);
        this.score = Number.isFinite(state.score) ? Math.max(0, Math.floor(state.score)) : 0;
        this.combo = Number.isFinite(state.combo) ? Math.max(0, Math.floor(state.combo)) : 0;
        this.bestCombo = Number.isFinite(state.bestCombo) ? Math.max(1, Math.floor(state.bestCombo)) : 1;
        this.round = Number.isFinite(state.round) ? Math.max(1, Math.floor(state.round)) : 1;
        this.moves = Number.isFinite(state.moves) ? Math.max(0, Math.floor(state.moves)) : 0;
        this.gameOver = Boolean(state.gameOver);
        this.usedSecondChance = Boolean(state.usedSecondChance);
        this.bonuses = {
          eraser: clamp(Number(state.bonuses?.eraser) || 0, 0, 1),
          redraw: clamp(Number(state.bonuses?.redraw) || 0, 0, 1)
        };
        this.bonusProgress = {
          eraser: clamp(Number(state.bonusProgress?.eraser) || 0, 0, 14),
          redraw: clamp(Number(state.bonusProgress?.redraw) || 0, 0, 11)
        };
        this.bonusRefills = {
          eraser: clamp(Number(state.bonusRefills?.eraser) || 0, 0, 1),
          redraw: clamp(Number(state.bonusRefills?.redraw) || 0, 0, 1)
        };
        this.pieces = state.pieces.map((piece, index) => this.sanitizePiece(piece, index));
        return this.pieces.every(Boolean);
      } catch (_error) {
        return false;
      }
    }

    sanitizePiece(piece, index) {
      const shape = SHAPES.find((candidate) => candidate.id === piece?.shapeId);
      if (!shape) return null;
      return {
        uid: typeof piece.uid === "string" ? piece.uid : `loaded-${index}`,
        shapeId: shape.id,
        cells: shape.cells.map((cell) => cell.slice()),
        rows: shape.rows,
        cols: shape.cols,
        color: COLORS.includes(piece.color) ? piece.color : COLORS[index % COLORS.length],
        used: Boolean(piece.used)
      };
    }

    index(row, col) {
      return row * SIZE + col;
    }

    canPlace(piece, row, col) {
      if (!piece || piece.used || !Number.isInteger(row) || !Number.isInteger(col)) return false;
      return piece.cells.every(([dr, dc]) => {
        const targetRow = row + dr;
        const targetCol = col + dc;
        return targetRow >= 0 && targetRow < SIZE && targetCol >= 0 && targetCol < SIZE && !this.board[this.index(targetRow, targetCol)];
      });
    }

    findPlacements(piece) {
      if (!piece || piece.used) return [];
      const placements = [];
      for (let row = 0; row <= SIZE - piece.rows; row += 1) {
        for (let col = 0; col <= SIZE - piece.cols; col += 1) {
          if (this.canPlace(piece, row, col)) placements.push({ row, col });
        }
      }
      return placements;
    }

    canAnyPlace() {
      return this.pieces.some((piece) => !piece.used && this.findPlacements(piece).length > 0);
    }

    detectCompletedLines(board = this.board) {
      const rows = [];
      const cols = [];
      for (let row = 0; row < SIZE; row += 1) {
        if (Array.from({ length: SIZE }, (_, col) => board[this.index(row, col)]).every(Boolean)) rows.push(row);
      }
      for (let col = 0; col < SIZE; col += 1) {
        if (Array.from({ length: SIZE }, (_, row) => board[this.index(row, col)]).every(Boolean)) cols.push(col);
      }
      return { rows, cols };
    }

    place(pieceUid, row, col) {
      if (this.gameOver) return { ok: false, reason: "game-over" };
      const piece = this.pieces.find((candidate) => candidate.uid === pieceUid);
      if (!piece) return { ok: false, reason: "unknown-piece" };
      if (!this.canPlace(piece, row, col)) return { ok: false, reason: "invalid-placement" };

      const scoreBefore = this.score;
      const placedCells = [];
      for (const [dr, dc] of piece.cells) {
        const targetRow = row + dr;
        const targetCol = col + dc;
        const targetIndex = this.index(targetRow, targetCol);
        this.board[targetIndex] = piece.color;
        placedCells.push(targetIndex);
      }
      piece.used = true;
      this.moves += 1;
      this.score += piece.cells.length * 2;

      const boardBeforeClear = this.board.slice();
      const completed = this.detectCompletedLines(boardBeforeClear);
      const cleared = new Set();
      completed.rows.forEach((completedRow) => {
        for (let targetCol = 0; targetCol < SIZE; targetCol += 1) cleared.add(this.index(completedRow, targetCol));
      });
      completed.cols.forEach((completedCol) => {
        for (let targetRow = 0; targetRow < SIZE; targetRow += 1) cleared.add(this.index(targetRow, completedCol));
      });

      const lineCount = completed.rows.length + completed.cols.length;
      const restoredBonuses = [];
      if (lineCount > 0) {
        this.combo += 1;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const clearPoints = cleared.size * 8 + lineCount * 70 + Math.max(0, lineCount - 1) * 110;
        this.score += clearPoints * this.combo;
        cleared.forEach((targetIndex) => { this.board[targetIndex] = null; });
        for (const [kind, threshold] of [["redraw", 12], ["eraser", 15]]) {
          this.bonusProgress[kind] += lineCount;
          if (this.bonusProgress[kind] >= threshold) {
            this.bonusProgress[kind] %= threshold;
            if (this.bonuses[kind] === 0 && this.bonusRefills[kind] === 0) {
              this.bonuses[kind] = 1;
              this.bonusRefills[kind] = 1;
              restoredBonuses.push(kind);
            }
          }
        }
      } else {
        this.combo = 0;
      }

      let newRound = false;
      if (this.pieces.every((candidate) => candidate.used)) {
        this.round += 1;
        this.pieces = this.generator.generate(this.board, this.round);
        newRound = true;
      }

      this.gameOver = !this.canAnyPlace();
      return {
        ok: true,
        piece,
        row,
        col,
        placedCells,
        boardBeforeClear,
        clearedCells: Array.from(cleared),
        rows: completed.rows,
        cols: completed.cols,
        lineCount,
        combo: this.combo,
        bestCombo: this.bestCombo,
        scoreBefore,
        scoreAfter: this.score,
        scoreDelta: this.score - scoreBefore,
        newRound,
        restoredBonuses,
        gameOver: this.gameOver
      };
    }

    redraw() {
      if (this.bonuses.redraw <= 0 || !this.board.some((cell) => !cell)) return { ok: false };
      const nextPieces = this.generator.generate(this.board, this.round + 1);
      if (!nextPieces.some((piece) => placementCount(this.board, piece) > 0)) return { ok: false };
      this.bonuses.redraw -= 1;
      this.round += 1;
      this.pieces = nextPieces;
      this.gameOver = false;
      return { ok: true, pieces: this.pieces, gameOver: this.gameOver };
    }

    eraseCells(indices) {
      if (this.bonuses.eraser <= 0 || !Array.isArray(indices)) return { ok: false };
      const unique = Array.from(new Set(indices)).filter((index) => Number.isInteger(index) && index >= 0 && index < SIZE * SIZE && this.board[index]).slice(0, 3);
      if (!unique.length) return { ok: false };
      if (this.gameOver) {
        const nextBoard = this.board.slice();
        unique.forEach((index) => { nextBoard[index] = null; });
        const rescued = this.pieces.some((piece) => !piece.used && placementCount(nextBoard, piece) > 0);
        if (!rescued) return { ok: false };
      }
      unique.forEach((index) => { this.board[index] = null; });
      this.bonuses.eraser -= 1;
      this.gameOver = false;
      return { ok: true, erasedCells: unique };
    }

    emergencyEraseCells() {
      if (!this.gameOver || this.bonuses.eraser <= 0) return [];
      let best = null;
      for (const piece of this.pieces) {
        if (piece.used) continue;
        for (let row = 0; row <= SIZE - piece.rows; row += 1) {
          for (let col = 0; col <= SIZE - piece.cols; col += 1) {
            const blocked = piece.cells.map(([dr, dc]) => this.index(row + dr, col + dc))
              .filter((index) => this.board[index]);
            if (blocked.length > 0 && blocked.length <= 3 && (!best || blocked.length < best.length)) {
              best = blocked;
            }
          }
        }
      }
      return best || [];
    }

    secondChance() {
      if (!this.gameOver || this.usedSecondChance) return { ok: false };
      this.usedSecondChance = true;
      const occupied = this.board.map((value, index) => value ? index : -1).filter((index) => index >= 0);
      const rowDensity = Array.from({ length: SIZE }, (_, row) => Array.from({ length: SIZE }, (_, col) => this.board[this.index(row, col)]).filter(Boolean).length);
      const colDensity = Array.from({ length: SIZE }, (_, col) => Array.from({ length: SIZE }, (_, row) => this.board[this.index(row, col)]).filter(Boolean).length);
      occupied.sort((a, b) => {
        const ar = Math.floor(a / SIZE), ac = a % SIZE;
        const br = Math.floor(b / SIZE), bc = b % SIZE;
        return (rowDensity[br] + colDensity[bc]) - (rowDensity[ar] + colDensity[ac]);
      });

      const removed = [];
      const minimum = Math.min(10, occupied.length);
      for (const index of occupied) {
        this.board[index] = null;
        removed.push(index);
        if (removed.length >= minimum && this.canAnyPlace()) break;
        if (removed.length >= 24) break;
      }
      this.gameOver = !this.canAnyPlace();
      if (this.gameOver) {
        this.board.fill(null);
        removed.length = 0;
        occupied.forEach((index) => removed.push(index));
        this.gameOver = false;
      }
      this.combo = 0;
      return { ok: true, removedCells: removed };
    }

    getState() {
      return {
        version: 1,
        board: this.board.slice(),
        score: this.score,
        combo: this.combo,
        bestCombo: this.bestCombo,
        round: this.round,
        moves: this.moves,
        gameOver: this.gameOver,
        usedSecondChance: this.usedSecondChance,
        bonuses: { ...this.bonuses },
        bonusProgress: { ...this.bonusProgress },
        bonusRefills: { ...this.bonusRefills },
        pieces: this.pieces.map((piece) => ({
          uid: piece.uid,
          shapeId: piece.shapeId,
          color: piece.color,
          used: piece.used
        }))
      };
    }
  }

  return { SIZE, COLORS, SHAPES, PieceGenerator, GameEngine };
});
