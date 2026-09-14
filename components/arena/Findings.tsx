"use client";

import { cn } from "@/lib/utils";
import type { Finding, Severity, Verdict } from "@/lib/arena/events";
import { VERDICT_LABEL } from "@/lib/arena/events";

// =============================================================================
// Verdicts and findings — the two things every Arena surface has to render.
//
// Colour follows the design system's state semantics rather than a fresh
// palette: verdigris means settled, amber means unresolved, alert means
// something is wrong. A drawn game and a clean file are both verdigris because
// both are settled facts; an unfinished game is amber because it is genuinely
// still open; an illegal game and an unusable file are alert because in both
// cases the thing submitted does not hold up.
//
// The one rule this file exists to enforce: a verdict never appears without the
// findings that produced it being reachable. A bare "Anomalies found" badge is a
// verdict nobody can check, which is the exact posture this product argues
// against.
// =============================================================================

type Tone = "settled" | "open" | "wrong";

const VERDICT_TONE: Record<Verdict, Tone> = {
  x_won: "settled",
  o_won: "settled",
  drawn: "settled",
  unfinished: "open",
  illegal: "wrong",
  clean: "settled",
  minor: "settled",
  anomalous: "open",
  unusable: "wrong",
};

const TONE: Record<Tone, string> = {
  settled: "border-verdigris/35 bg-verdigris/[0.07] text-verdigris",
  open: "border-amber/35 bg-amber/[0.07] text-amber",
  wrong: "border-alert/40 bg-alert/[0.07] text-alert",
};

export function VerdictChip({ verdict, size = "md" }: { verdict: Verdict; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-seal border font-mono uppercase tracking-[0.14em]",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]",
        TONE[VERDICT_TONE[verdict]]
      )}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

const SEVERITY: Record<Severity, { rail: string; word: string }> = {
  info: { rail: "bg-faint", word: "text-faint" },
  warning: { rail: "bg-amber", word: "text-amber" },
  critical: { rail: "bg-alert", word: "text-alert" },
};

/**
 * Findings in the order the engine produced them, each with its severity and
 * the place it was found.
 *
 * No collapsing, no "show 3 more". A findings list that hides its tail trains
 * people to trust the summary instead of the evidence, and the summary is the
 * part written by a model.
 */
export function FindingList({ findings }: { findings: Finding[] }) {
  if (!findings.length) {
    return (
      <p className="rounded-card border border-dashed border-hairline px-4 py-3 text-[13px] text-muted">
        Nothing anomalous was found. Every check the engine ran came back clean.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5">
      {findings.map((f, i) => (
        <li
          key={`${f.code}-${i}`}
          className="flex items-start gap-3 rounded-card border border-hairline bg-surface/30 px-3.5 py-2.5"
        >
          <span
            aria-hidden
            className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", SEVERITY[f.severity].rail)}
          />
          <span className="min-w-0 flex-1">
            <span className="text-[13px] leading-relaxed text-bone">{f.message}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span
                className={cn(
                  "font-mono text-[10px] uppercase tracking-[0.16em]",
                  SEVERITY[f.severity].word
                )}
              >
                {f.severity}
              </span>
              {f.where && <span className="crypto text-[11px] text-faint">{f.where}</span>}
              <span className="crypto text-[11px] text-faint">{f.code}</span>
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
