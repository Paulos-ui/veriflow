"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { Board, Mark, Move, Outcome } from "@/lib/arena/tictactoe";
import {
  BOARD_SIZE,
  HUMAN,
  MACHINE,
  applyMove,
  bestMove,
  emptyBoard,
  outcomeOf,
} from "@/lib/arena/tictactoe";

// =============================================================================
// The board.
//
// The opponent runs HERE, in the browser, out of lib/arena/tictactoe.ts — the
// same pure module the server replays the log with when the game is verified.
// That is the whole reason the engine has no I/O in it: one implementation, two
// places, so "the server agrees this game was played correctly" is a real check
// rather than a second implementation being asked to agree with the first.
//
// `bestMove` is exhaustive minimax, so it cannot be beaten. The honest framing
// is on the page: a draw is the best available result, and a submitted win is
// the interesting case precisely because the replay will not accept one.
//
// The grid is nine buttons, not a canvas: arrow-key and tab navigation, a real
// focus ring, an accessible name per cell, and a live region for the result.
// =============================================================================

const REPLY_MS = 220;

/** Column and row for a cell index, for the accessible name. */
function coordsOf(index: number): string {
  return `row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}`;
}

export function TicTacToe({
  onSubmit,
  busy,
}: {
  /** Hand the move log to the verifier. The parent owns the network call. */
  onSubmit: (moves: Move[]) => void;
  busy: boolean;
}) {
  const reduced = useReducedMotion();
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [moves, setMoves] = useState<Move[]>([]);
  const [thinking, setThinking] = useState(false);
  const reply = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (reply.current) clearTimeout(reply.current);
    };
  }, []);

  const outcome = outcomeOf(board);
  const over = outcome.kind !== "open";
  const winLine = outcome.kind === "win" ? outcome.line : null;

  const play = useCallback(
    (index: number) => {
      if (busy || thinking || over) return;
      const move: Move = { index, mark: HUMAN };
      const afterHuman = applyMove(board, move);
      if (!afterHuman) return;

      setBoard(afterHuman);
      setMoves((m) => [...m, move]);

      if (outcomeOf(afterHuman).kind !== "open") return;

      // The reply is sequenced rather than simultaneous so it is legible which
      // mark was yours. It is not a "thinking" animation — the search finishes
      // in under a millisecond and the label does not claim otherwise.
      setThinking(true);
      reply.current = setTimeout(() => {
        const index2 = bestMove(afterHuman, MACHINE);
        setThinking(false);
        if (index2 === null) return;
        const machineMove: Move = { index: index2, mark: MACHINE };
        const afterMachine = applyMove(afterHuman, machineMove);
        if (!afterMachine) return;
        setBoard(afterMachine);
        setMoves((m) => [...m, machineMove]);
      }, REPLY_MS);
    },
    [board, busy, over, thinking]
  );

  const reset = useCallback(() => {
    if (reply.current) clearTimeout(reply.current);
    setThinking(false);
    setBoard(emptyBoard());
    setMoves([]);
  }, []);

  /**
   * Submit a log with one extra move spliced onto a finished game.
   *
   * Not a gimmick and not hidden: it is the fastest way to see that verification
   * is doing work. The replay walks the log from an empty board and rejects the
   * move that was played after the game was already won, and the run records
   * `illegal` — which is the same path a forged log from anywhere else would
   * take.
   */
  const submitTampered = useCallback(() => {
    const free = board.findIndex((c) => c === null);
    const extra: Move = { index: free >= 0 ? free : 0, mark: HUMAN };
    onSubmit([...moves, extra]);
  }, [board, moves, onSubmit]);

  return (
    <div className="space-y-4">
      <p aria-live="polite" className="sr-only">
        {statusLine(outcome, thinking)}
      </p>

      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-start sm:gap-7">
        <div
          role="group"
          aria-label="Tic-tac-toe board. You play X and move first."
          className="grid shrink-0 grid-cols-3 gap-1.5"
        >
          {Array.from({ length: BOARD_SIZE }, (_, i) => {
            const cell = board[i];
            const inWin = winLine?.includes(i) ?? false;
            return (
              <button
                key={i}
                type="button"
                onClick={() => play(i)}
                disabled={cell !== null || over || thinking || busy}
                aria-label={
                  cell ? `${coordsOf(i)}, ${cell}` : `Play ${coordsOf(i)}`
                }
                className={cn(
                  "grid h-[68px] w-[68px] place-items-center rounded-card border font-display text-[30px] leading-none transition-colors duration-200",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
                  inWin
                    ? "border-verdigris/45 bg-verdigris/[0.09]"
                    : "border-hairline bg-surface/40",
                  cell === null && !over && !thinking && !busy && "hover:border-bone/25 hover:bg-raised/50",
                  cell === HUMAN ? "text-bone" : cell === MACHINE ? "text-signal" : "text-transparent"
                )}
              >
                {cell && (
                  <motion.span
                    initial={reduced ? false : { opacity: 0, scale: 0.82 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                  >
                    {cell}
                  </motion.span>
                )}
              </button>
            );
          })}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <Status kind={outcome.kind} winner={outcome.kind === "win" ? outcome.winner : null} thinking={thinking} />

          <MoveLog moves={moves} />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSubmit(moves)}
              disabled={!over || busy}
              className={cn(
                "min-h-[44px] rounded-seal border px-4 text-[13px] transition-colors duration-200",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
                over && !busy
                  ? "border-verdigris/40 bg-verdigris/[0.08] text-verdigris hover:bg-verdigris/[0.14]"
                  : "cursor-not-allowed border-hairline text-faint"
              )}
            >
              {busy ? "Verifying…" : "Verify this game"}
            </button>

            <button
              type="button"
              onClick={reset}
              disabled={busy || moves.length === 0}
              className={cn(
                "min-h-[44px] rounded-seal border border-hairline px-4 text-[13px] text-muted transition-colors duration-200",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
                busy || moves.length === 0 ? "cursor-not-allowed text-faint" : "hover:border-bone/25 hover:text-bone"
              )}
            >
              New game
            </button>
          </div>

          {over && (
            <div className="rounded-card border border-dashed border-hairline px-3.5 py-3">
              <p className="text-[12px] leading-relaxed text-muted">
                Or send a log that did not happen. One extra move is spliced onto the finished game
                before it is submitted; the replay walks it from an empty board and refuses it.
              </p>
              <button
                type="button"
                onClick={submitTampered}
                disabled={busy}
                className={cn(
                  "mt-2 min-h-[44px] rounded-seal border border-amber/35 px-3.5 text-[12.5px] text-amber transition-colors duration-200",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
                  busy ? "cursor-not-allowed opacity-60" : "hover:bg-amber/[0.08]"
                )}
              >
                Submit a tampered log
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function statusLine(outcome: Outcome, thinking: boolean): string {
  if (thinking) return "Replying.";
  if (outcome.kind === "win") return outcome.winner === HUMAN ? "You won." : "The machine won.";
  if (outcome.kind === "draw") return "Drawn.";
  return "Your move.";
}

function Status({
  kind,
  winner,
  thinking,
}: {
  kind: "win" | "draw" | "open";
  winner: Mark | null;
  thinking: boolean;
}) {
  if (kind === "win") {
    const humanWon = winner === HUMAN;
    return (
      <p className={cn("text-[14px] leading-relaxed", humanWon ? "text-amber" : "text-signal")}>
        {humanWon ? (
          <>
            You won — which the opponent&rsquo;s search should not allow. Verify it and the replay
            will say whether the log holds up.
          </>
        ) : (
          <>The machine won. Verify it and the replay will confirm every move in order.</>
        )}
      </p>
    );
  }

  if (kind === "draw") {
    return (
      <p className="text-[14px] leading-relaxed text-verdigris">
        Drawn — the best result available against perfect play.
      </p>
    );
  }

  return (
    <p className="text-[14px] leading-relaxed text-muted">
      {thinking ? "Replying…" : "You are X. Play a square."}
    </p>
  );
}

function MoveLog({ moves }: { moves: Move[] }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Move log</p>
      <p className="crypto mt-1 min-h-[18px] break-words text-[12px] text-muted">
        {moves.length ? moves.map((m) => `${m.mark}${m.index}`).join(" ") : "—"}
      </p>
      <p className="mt-1 text-[11.5px] text-faint">
        This is exactly what gets submitted. The board is re-derived from it server-side.
      </p>
    </div>
  );
}
