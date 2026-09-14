"use client";

import { useCallback } from "react";
import type { Move } from "@/lib/arena/tictactoe";
import { IntegrationBoard, useIntegrations } from "./IntegrationBoard";
import { RunState } from "./RunState";
import { TicTacToe } from "./TicTacToe";
import { useArenaRun } from "./useArenaRun";

// =============================================================================
// The Arena console: play a game, then make the system prove what happened.
//
// The game is the cheap part. The point of it is that a move log is a claim
// anybody can forge in a second — nine numbers in a text field — which makes it
// the clearest possible thing to put a verification pipeline behind. Whatever is
// submitted here gets replayed from an empty board by code that never saw the
// browser, and only then does anything reach an external app.
// =============================================================================

export function ArenaConsole() {
  const run = useArenaRun();
  const { report, failed } = useIntegrations();

  const submit = useCallback(
    (moves: Move[]) => {
      void run.run({ kind: "game", moves });
    },
    [run]
  );

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="board-heading"
        className="rounded-xl2 border border-hairline bg-surface/30 p-5 sm:p-6"
      >
        <h2 id="board-heading" className="font-display text-[20px] leading-tight text-bone">
          Play a game
        </h2>
        <p className="mt-1.5 max-w-[60ch] text-[13px] leading-relaxed text-muted">
          You are X and move first. The opponent searches every remaining position, so it cannot be
          beaten — a draw is the best result on offer. When the game ends, submit the log and the
          server replays it move by move before deciding what, if anything, to do about it.
        </p>

        <div className="mt-5">
          <TicTacToe onSubmit={submit} busy={run.busy} />
        </div>
      </section>

      <IntegrationBoard report={report} failed={failed} />

      <RunState run={run} steps="observe → verify → plan → four writes → seal" />
    </div>
  );
}
