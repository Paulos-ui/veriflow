"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ACTION_TYPES } from "@/lib/arena/events";
import type { IntegrationReport, IntegrationStatus } from "@/lib/arena/events";

// =============================================================================
// The integration board — what this deployment can actually reach, shown BEFORE
// anybody presses run.
//
// The alternative is worse in every direction: let somebody play a game, watch
// the run, and then discover that three of the four destinations were never
// wired up. That reads as breakage even though it is configuration, and it
// wastes the one moment of attention a first visit gets.
//
// So the board states the shortfall up front, names the variable that fixes it,
// and shows the single destination each agent may write to. A deployment with
// nothing configured is still a working demo: the verification is real, the plan
// is real, and the four rows say exactly why nothing left the building.
// =============================================================================

export function useIntegrations(): { report: IntegrationReport | null; failed: boolean } {
  const [report, setReport] = useState<IntegrationReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/arena/integrations")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("unavailable"))))
      .then((body: IntegrationReport) => {
        if (live) setReport(body);
      })
      .catch(() => {
        // Not fatal: the board is a courtesy, and the run reports the same facts
        // per action anyway. Better an honest gap than a board full of guesses.
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return { report, failed };
}

export function IntegrationBoard({ report, failed }: { report: IntegrationReport | null; failed: boolean }) {
  if (failed) {
    return (
      <p className="rounded-card border border-hairline bg-surface/30 px-4 py-3 text-[12.5px] text-muted">
        Could not read the integration status. Each action still reports its own state when a run
        finishes.
      </p>
    );
  }

  if (!report) {
    return (
      <div aria-busy="true" className="grid gap-2 sm:grid-cols-2">
        {ACTION_TYPES.map((t) => (
          <span key={t} className="h-[76px] rounded-card border border-hairline bg-surface/20" />
        ))}
      </div>
    );
  }

  const live = report.integrations.filter((i) => i.configured).length;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
          Destinations
        </h2>
        <p className="text-[12px] text-muted">
          <span className={live ? "text-verdigris" : "text-amber"}>{live}</span> of 4 connected
          {report.reasoning.configured ? " · reasoning live" : " · reasoning deterministic"}
        </p>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {report.integrations.map((i) => (
          <IntegrationRow key={i.type} integration={i} />
        ))}
      </ul>

      {report.reasoning.hint && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-muted">{report.reasoning.hint}</p>
      )}
    </div>
  );
}

function IntegrationRow({ integration: i }: { integration: IntegrationStatus }) {
  return (
    <li
      className={cn(
        "rounded-card border px-3.5 py-3",
        i.configured ? "border-verdigris/25 bg-verdigris/[0.04]" : "border-hairline bg-surface/30"
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-[14px] leading-none text-bone">{i.app}</span>
        <span
          className={cn(
            "shrink-0 font-mono text-[10px] uppercase tracking-[0.14em]",
            i.configured ? "text-verdigris" : "text-amber"
          )}
        >
          {i.configured ? "Connected" : "Not configured"}
        </span>
      </div>

      <p className="mt-1.5 text-[12px] text-muted">
        <span className="text-signal">{i.agent}</span> · {i.action.toLowerCase()}
      </p>

      {i.configured ? (
        <p className="crypto mt-1.5 truncate text-[11px] text-faint" title={i.target}>
          → {i.target}
        </p>
      ) : (
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted">{i.hint}</p>
      )}
    </li>
  );
}
