"use client";

import { useCallback, useRef, useState } from "react";
import type { Case } from "@/lib/cases/model";
import type { Move } from "@/lib/arena/tictactoe";

// =============================================================================
// One run, start to finish, for both Arena flows.
//
// The submission types are declared here rather than imported from
// lib/arena/verify.ts, which is `server-only` — the schema there is the
// authority on what is accepted, and this is the browser's description of what
// it intends to send. The server re-parses either way; nothing here is trusted.
//
// The in-flight lock is the double-click guard the spec asks for, and it is the
// SECOND of two. The first is the idempotency key derived from the event itself,
// which is what actually stops a duplicate issue from being opened — a lock in a
// browser tab cannot, since a second tab or a refresh defeats it. This one exists
// so a double-click does not fire two requests in the first place.
// =============================================================================

export type ArenaSubmission =
  | { kind: "game"; moves: Move[] }
  | { kind: "dataset"; filename: string; text: string };

export type RunPhase = "idle" | "running" | "done" | "error";

export interface ArenaRun {
  kase: Case | null;
  phase: RunPhase;
  error: string | null;
  busy: boolean;
  run: (submission: ArenaSubmission) => Promise<void>;
  clear: () => void;
}

export function useArenaRun(): ArenaRun {
  const [kase, setCase] = useState<Case | null>(null);
  const [phase, setPhase] = useState<RunPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(async (submission: ArenaSubmission) => {
    if (inFlight.current) return;
    inFlight.current = true;

    setPhase("running");
    setError(null);
    setCase(null);

    try {
      const res = await fetch("/api/arena/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      const body = await res.json().catch(() => null);

      // A refused or partial run comes back 200 with a case in it. Only a real
      // failure — a bad request, a crash — lands here.
      if (!res.ok) throw new Error(body?.error ?? "The run could not be completed.");

      setCase(body as Case);
      setPhase("done");
    } catch (e) {
      // An infrastructure failure is NOT a refusal and must never be dressed as
      // one. A refusal is the mandate working; this is the app not working.
      setError(e instanceof Error ? e.message : "The run could not be completed.");
      setPhase("error");
    } finally {
      inFlight.current = false;
    }
  }, []);

  const clear = useCallback(() => {
    setCase(null);
    setPhase("idle");
    setError(null);
  }, []);

  return { kase, phase, error, busy: phase === "running", run, clear };
}
