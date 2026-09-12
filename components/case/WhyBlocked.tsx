"use client";

import { useEffect, useRef } from "react";
import type { Hop } from "@/lib/cases/model";
import { HOP_LABEL } from "@/lib/cases/model";
import { refusalHeading } from "@/lib/mandate/refusal";
import { ROSTER } from "@/lib/agents/roster";

// =============================================================================
// Why-blocked panel — MASTER.md §5.3.
//
// Order is fixed, because it is the order an operator needs it in:
//
//   1. the refusal in one plain sentence
//   2. the numbers, in mono, side by side
//   3. what would have to change for it to pass
//
// Never a bare error code, never a stack trace. The operator is deciding
// whether to widen a mandate; give them the comparison that decision needs.
//
// Tone (MASTER.md §7): this never apologises. A fail-closed refusal is the
// product working correctly, and the copy says so.
// =============================================================================

export function WhyBlocked({ hop }: { hop: Hop }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const refusal = hop.refusal;

  // Move focus to the explanation when a refusal opens, so a keyboard or
  // screen-reader operator lands on the reason rather than hunting for it.
  useEffect(() => {
    headingRef.current?.focus();
  }, [hop.index]);

  if (!refusal) return null;

  return (
    <section
      // role="alert" would interrupt; this is a panel the operator opened
      // deliberately, so it announces politely on arrival.
      aria-live="polite"
      className="rounded-card border border-alert/40 bg-alert/[0.04] p-4 sm:p-5"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden className="font-mono text-[13px] leading-none text-alert">
          ╳
        </span>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-alert">
          {refusalHeading(refusal.kind)}
        </span>
      </div>

      {/* 1 — the plain sentence */}
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-2.5 font-display text-[19px] leading-snug text-bone outline-none"
        style={{ textWrap: "balance" } as React.CSSProperties}
      >
        {refusal.message}
      </h3>

      <p className="mt-1.5 text-[12.5px] text-muted">
        Stopped at <span className="text-bone">{HOP_LABEL[hop.kind]}</span>, run by{" "}
        <span className="text-signal">{ROSTER[hop.role].name}</span>. The call never left the server.
      </p>

      {/* 2 — the numbers, side by side */}
      {refusal.evidence && (
        <dl className="mt-4 grid gap-px overflow-hidden rounded-seal border border-hairline bg-hairline sm:grid-cols-2">
          <div className="bg-ink/70 p-3">
            <dt className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
              {refusal.evidence.label}
            </dt>
            <dd className="crypto mt-1.5 text-[12.5px] text-verdigris">{refusal.evidence.allowed}</dd>
          </div>
          <div className="bg-ink/70 p-3">
            <dt className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
              Attempted
            </dt>
            <dd className="crypto mt-1.5 text-[12.5px] text-alert">{refusal.evidence.attempted}</dd>
          </div>
        </dl>
      )}

      {/* 3 — the recovery path */}
      {refusal.remedy && (
        <div className="mt-4 border-t border-alert/20 pt-3">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
            To let this through
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-bone">{refusal.remedy}</p>
        </div>
      )}

      <p className="mt-4 text-[12px] leading-relaxed text-faint">
        This refusal is sealed into the chain alongside the hops that passed. A blocked case is
        evidence, not an error — the mandate held.
      </p>
    </section>
  );
}
