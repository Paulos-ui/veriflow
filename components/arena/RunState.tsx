"use client";

import type { ArenaRun } from "./useArenaRun";
import { RunReport } from "./RunReport";

// =============================================================================
// What a run looks like while it is happening, when it fails, and when it lands.
//
// Shared by both consoles so the failure copy cannot drift between them. The one
// sentence that matters is in the error block: an app failure is not a refusal.
// Blurring those two would let a broken deployment look like a working gate,
// which is the most expensive lie this interface could tell.
// =============================================================================

export function RunState({ run, steps }: { run: ArenaRun; steps: string }) {
  return (
    <>
      {run.phase === "error" && run.error && (
        <div role="alert" className="rounded-card border border-alert/40 bg-alert/[0.05] p-4">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-alert">
            Could not run
          </p>
          <p className="mt-1.5 text-[13px] text-bone">{run.error}</p>
          <p className="mt-1.5 text-[12px] text-muted">
            This is the app failing, not a mandate refusing. Nothing was attempted, and nothing was
            written to any of the four destinations.
          </p>
        </div>
      )}

      {run.phase === "running" && <RunningSkeleton steps={steps} />}

      {run.kase && run.phase !== "running" && <RunReport kase={run.kase} />}
    </>
  );
}

/**
 * A stable skeleton rather than a spinner: the shape of the result is known, so
 * reserving it avoids the jump when the report lands.
 */
function RunningSkeleton({ steps }: { steps: string }) {
  return (
    <div aria-busy="true" className="rounded-xl2 border border-hairline bg-surface/30 p-5 sm:p-6">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-amber">
        Running — {steps}
      </p>
      <div className="mt-4 space-y-3">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3.5">
            <span className="h-9 w-9 shrink-0 rounded-full border border-hairline" />
            <span
              className="h-9 flex-1 rounded-card border border-hairline bg-raised/30"
              style={{ opacity: 1 - i * 0.15 }}
            />
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-muted">
        Each hop is gated before it runs, then sealed against the hop before it. Nothing reaches an
        external app until its agent&rsquo;s mandate has allowed that exact call.
      </p>
    </div>
  );
}
