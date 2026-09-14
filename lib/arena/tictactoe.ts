import type { Finding } from "./events";

// =============================================================================
// The tic-tac-toe engine.
//
// This module decides who won. Nothing else in VeriFlow does, and in particular
// no model does — the verifier asks Groq to *describe* the result, then checks
// that description against what this code computed and reports the disagreement
// if there is one.
//
// That division is the whole reason the game is in the product. A game is a
// domain where ground truth is cheap and total: the rules are eight lines long,
// the state space is tiny, and a claim about the winner can be checked exactly.
// So it is the clearest possible demonstration of the pattern the AP Clerk case
// applies to money — the model proposes, deterministic code decides.
//
// Pure module. No credentials, no I/O, no node built-ins, so the board component
// in the browser and the verifier on the server run the identical rules. A second
// implementation for the client is exactly the kind of drift this avoids.
// =============================================================================

export type Mark = "X" | "O";
export type Cell = Mark | null;
export type Board = readonly Cell[];

export const BOARD_SIZE = 9;

export function emptyBoard(): Board {
  return Array.from({ length: BOARD_SIZE }, () => null);
}

/** Human is always X and always moves first. One less thing to get wrong. */
export const HUMAN: Mark = "X";
export const MACHINE: Mark = "O";

export interface Move {
  /** 0..8, reading the board left to right, top to bottom. */
  index: number;
  mark: Mark;
}

export type Line = readonly [number, number, number];

export const LINES: readonly Line[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // columns
  [0, 4, 8],
  [2, 4, 6], // diagonals
];

export type Outcome =
  | { kind: "win"; winner: Mark; line: Line }
  | { kind: "draw" }
  | { kind: "open" };

/**
 * The winner, if there is one. Checked before "draw" because a board can be
 * full AND won, and reporting that as a draw would be wrong.
 */
export function outcomeOf(board: Board): Outcome {
  for (const line of LINES) {
    const [a, b, c] = line;
    const mark = board[a];
    if (mark && board[b] === mark && board[c] === mark) {
      return { kind: "win", winner: mark, line };
    }
  }
  return board.every((cell) => cell !== null) ? { kind: "draw" } : { kind: "open" };
}

export function legalMoves(board: Board): number[] {
  const out: number[] = [];
  for (let i = 0; i < BOARD_SIZE; i++) if (board[i] === null) out.push(i);
  return out;
}

/** Whose turn it is, derived from the board rather than tracked separately. */
export function turnOf(board: Board): Mark {
  const xs = board.filter((c) => c === HUMAN).length;
  const os = board.filter((c) => c === MACHINE).length;
  return xs <= os ? HUMAN : MACHINE;
}

/** Returns a new board, or null if the move is not legal. Never mutates. */
export function applyMove(board: Board, move: Move): Board | null {
  if (!Number.isInteger(move.index) || move.index < 0 || move.index >= BOARD_SIZE) return null;
  if (board[move.index] !== null) return null;
  if (outcomeOf(board).kind !== "open") return null;
  if (turnOf(board) !== move.mark) return null;

  const next = [...board];
  next[move.index] = move.mark;
  return next;
}

// --- the opponent -------------------------------------------------------------

/**
 * Perfect play by exhaustive search, with ties broken by lowest index.
 *
 * Deterministic on purpose: the same board always produces the same reply, so a
 * verification can be re-run from the move log and reach the identical result.
 * A random tie-break would make the game unreproducible, and an unreproducible
 * event is not something you can meaningfully seal.
 *
 * The search space is at most 9! positions and the board is tiny, so there is no
 * depth limit and no heuristic — it simply plays correctly, which means a human
 * can draw it but never beat it.
 */
export function bestMove(board: Board, mark: Mark): number | null {
  if (outcomeOf(board).kind !== "open") return null;
  const moves = legalMoves(board);
  if (!moves.length) return null;

  let bestIndex = moves[0];
  let bestScore = -Infinity;

  for (const index of moves) {
    const next = [...board];
    next[index] = mark;
    const score = evaluate(next, mark, other(mark), 1);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function other(mark: Mark): Mark {
  return mark === "X" ? "O" : "X";
}

/**
 * Score a position from `me`'s point of view. Depth is subtracted from wins and
 * added to losses so the engine prefers winning sooner and losing later — which
 * is what makes it block an immediate threat instead of finding an equally
 * "drawn" line that lets the human win next turn.
 */
function evaluate(board: Board, me: Mark, turn: Mark, depth: number): number {
  const outcome = outcomeOf(board);
  if (outcome.kind === "win") return outcome.winner === me ? 10 - depth : depth - 10;
  if (outcome.kind === "draw") return 0;

  const moves = legalMoves(board);
  let best = turn === me ? -Infinity : Infinity;

  for (const index of moves) {
    const next = [...board];
    next[index] = turn;
    const score = evaluate(next, me, other(turn), depth + 1);
    best = turn === me ? Math.max(best, score) : Math.min(best, score);
  }
  return best;
}

// --- replay and validation ---------------------------------------------------

export interface Replay {
  /** The board the move log actually produces, as far as it was legal. */
  board: Board;
  outcome: Outcome;
  /** Moves that were accepted, in order. */
  accepted: Move[];
  /** Everything wrong with the log. Empty means it replays exactly. */
  findings: Finding[];
}

/**
 * Re-derive the game from its move log.
 *
 * The client sends a move log, and a client is untrusted input like any other —
 * so the final board is never taken on faith. It is recomputed here, move by
 * move, and any move that does not follow the rules becomes a finding instead of
 * silently landing on the board. A submitted "win" built from an illegal move
 * therefore verifies as an illegal game, not as a win.
 */
export function replay(moves: readonly Move[]): Replay {
  let board = emptyBoard();
  const accepted: Move[] = [];
  const findings: Finding[] = [];

  for (let i = 0; i < moves.length; i++) {
    const move = moves[i];
    const where = `move ${i + 1}`;

    if (outcomeOf(board).kind !== "open") {
      findings.push({
        code: "move_after_game_over",
        severity: "critical",
        message: "A move was played after the game had already been decided.",
        where,
      });
      continue;
    }
    if (!Number.isInteger(move.index) || move.index < 0 || move.index >= BOARD_SIZE) {
      findings.push({
        code: "move_off_board",
        severity: "critical",
        message: `Square ${String(move.index)} is not on the board.`,
        where,
      });
      continue;
    }
    if (board[move.index] !== null) {
      findings.push({
        code: "square_occupied",
        severity: "critical",
        message: `Square ${move.index} was already taken by ${board[move.index]}.`,
        where,
      });
      continue;
    }
    if (turnOf(board) !== move.mark) {
      findings.push({
        code: "out_of_turn",
        severity: "critical",
        message: `${move.mark} played when it was ${turnOf(board)}'s turn.`,
        where,
      });
      continue;
    }

    const next = applyMove(board, move);
    if (!next) {
      findings.push({
        code: "illegal_move",
        severity: "critical",
        message: "The move did not follow the rules of the game.",
        where,
      });
      continue;
    }
    board = next;
    accepted.push(move);
  }

  const outcome = outcomeOf(board);
  if (outcome.kind === "open" && !findings.length) {
    findings.push({
      code: "game_unfinished",
      severity: "warning",
      message: "The game has no winner yet and the board is not full.",
    });
  }

  return { board, outcome, accepted, findings };
}

/**
 * Was the machine's play actually optimal at every turn?
 *
 * An `info` finding, not a warning: a suboptimal reply is a bug in the opponent,
 * not a breach of the rules. It is checked anyway because the claim "you cannot
 * beat this opponent" should be something the record can support.
 */
export function auditMachinePlay(moves: readonly Move[]): Finding[] {
  const findings: Finding[] = [];
  let board = emptyBoard();

  for (const move of moves) {
    if (move.mark === MACHINE) {
      const ideal = bestMove(board, MACHINE);
      if (ideal !== null && ideal !== move.index) {
        const expected = evaluate(place(board, ideal, MACHINE), MACHINE, HUMAN, 1);
        const actual = evaluate(place(board, move.index, MACHINE), MACHINE, HUMAN, 1);
        if (actual < expected) {
          findings.push({
            code: "suboptimal_reply",
            severity: "info",
            message: `The opponent played square ${move.index} where square ${ideal} was stronger.`,
          });
        }
      }
    }
    const next = applyMove(board, move);
    if (!next) break;
    board = next;
  }
  return findings;
}

function place(board: Board, index: number, mark: Mark): Board {
  const next = [...board];
  next[index] = mark;
  return next;
}

/** One line stating what happened, for the verification record. */
export function describeOutcome(r: Replay): string {
  const played = r.accepted.length;
  switch (r.outcome.kind) {
    case "win":
      return `${r.outcome.winner} won on squares ${r.outcome.line.join("-")} after ${played} moves.`;
    case "draw":
      return `Drawn after ${played} moves with no line completed.`;
    case "open":
      return `Unfinished after ${played} moves.`;
  }
}
