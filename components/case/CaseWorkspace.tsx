"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Case } from "@/lib/cases/model";
import type { Mandate } from "@/lib/mandate/model";
import type { AgentRole } from "@/lib/agents/roster";
import { announce, participatingRoles, refusedHop, timeline } from "@/lib/cases/view";
import { AgentRoster } from "./AgentRoster";
import { CaseLauncher, type InvoiceKey, type ApprovalKey } from "./CaseLauncher";
import { CaseSeal } from "./CaseSeal";
import { HopNode } from "./HopNode";
import { ProofPanel } from "./ProofPanel";
import { WhyBlocked } from "./WhyBlocked";
import { formatUsd } from "@/lib/utils";

// =============================================================================
// The case workspace.
//
// One case, six hops, three apps. Selecting a hop opens its proof; selecting a
// refused hop opens why it was blocked. The seal above reflects the case as a
// whole, so the operator's eye lands on state before it lands on text.
//
// State lives here rather than in a store because there is exactly one open
// case at a time and it is server-owned — the client never mutates a case, it
// asks the server to run one and renders what comes back.
// =============================================================================

type Phase = "idle" | "running" | "done" | "error";

export function CaseWorkspace({ mandates }: { mandates: Record<AgentRole, Mandate> }) {
  const [kase, setCase] = useState<Case | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const run = useCallback(async (invoiceKey: InvoiceKey, demoApproval: ApprovalKey) => {
    setPhase("running");
    setError(null);
    setSelected(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceKey, demoApproval }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? "The case could not be run.");
      setCase(body as Case);
      setPhase("done");
    } catch (e) {
      // An infrastructure failure is NOT a refusal and must never be dressed as
      // one — a refusal is the mandate working, this is the app not working.
      setError(e instanceof Error ? e.message : "The case could not be run.");
      setPhase("error");
    }
  }, []);

  const steps = useMemo(() => (kase ? timeline(kase) : []), [kase]);
  const blocked = useMemo(() => (kase ? refusedHop(kase) : null), [kase]);
  const active = useMemo(() => (kase ? participatingRoles(kase) : []), [kase]);

  // When a case lands, open the refusal if there is one, otherwise the last
  // sealed hop. The operator's first question is always "what happened" — this
  // answers it without a click.
  useEffect(() => {
    if (!kase) return;
    setSelected(blocked ? blocked.index : kase.hops.length - 1);
  }, [kase, blocked]);

  const openHop = selected !== null ? kase?.hops[selected] ?? null : null;

  return (
    <div className="space-y-7">
      {/* Screen readers get the outcome as a complete sentence, not a word. */}
      <p aria-live="polite" className="sr-only">
        {phase === "running"
          ? "Running the case across Gmail, Slack, and payment."
          : kase
            ? announce(kase)
            : ""}
      </p>

      <CaseLauncher onRun={run} busy={phase === "running"} />

      {phase === "error" && error && (
        <div role="alert" className="rounded-card border border-alert/40 bg-alert/[0.05] p-4">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-alert">
            Could not run
          </p>
          <p className="mt-1.5 text-[13px] text-bone">{error}</p>
          <p className="mt-1.5 text-[12px] text-muted">
            This is the app failing, not a mandate refusing. Nothing was attempted.
          </p>
        </div>
      )}

      {phase === "running" && <RunningSkeleton />}

      {kase && phase !== "running" && (
        <>
          <section
            aria-labelledby="case-heading"
            className="rounded-xl2 border border-hairline bg-surface/30 p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="case-heading" className="font-display text-[22px] leading-tight text-bone">
                {kase.title}
              </h2>
              <span className="crypto text-[11px] text-faint">{kase.id}</span>
            </div>

            {kase.invoice && (
              <p className="mt-1.5 text-[13px] text-muted">
                <span className="text-bone">{kase.invoice.vendor}</span>
                {" · "}
                <span className="crypto text-bone">
                  {formatUsd(kase.invoice.amountCents / 100)}
                </span>
                {" · due "}
                <span className="crypto">{kase.invoice.dueDate}</span>
                {" · ref "}
                <span className="crypto">{kase.invoice.reference}</span>
              </p>
            )}

            <div className="mt-5">
              <CaseSeal kase={kase} />
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
            <section aria-labelledby="timeline-heading">
              <h2
                id="timeline-heading"
                className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted"
              >
                Hops
              </h2>
              <ol className="mt-3">
                {steps.map((step, i) => (
                  <HopNode
                    key={step.kind}
                    step={step}
                    index={i}
                    isLast={i === steps.length - 1}
                    selected={step.hop !== null && step.hop.index === selected}
                    onSelect={() => step.hop && setSelected(step.hop.index)}
                  />
                ))}
              </ol>
            </section>

            <section aria-labelledby="evidence-heading" className="lg:sticky lg:top-24 lg:self-start">
              <h2
                id="evidence-heading"
                className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted"
              >
                {openHop?.status === "refused" ? "Why blocked" : "Proof"}
              </h2>
              <div className="mt-3">
                {openHop ? (
                  openHop.status === "refused" ? (
                    <WhyBlocked hop={openHop} />
                  ) : (
                    <ProofPanel hop={openHop} />
                  )
                ) : (
                  <p className="rounded-card border border-dashed border-hairline p-5 text-[13px] text-muted">
                    Select a hop to read its proof.
                  </p>
                )}
              </div>
            </section>
          </div>
        </>
      )}

      <AgentRoster mandates={mandates} active={active} />
    </div>
  );
}

/**
 * A stable skeleton rather than a spinner: the case takes a couple of seconds
 * and the layout is known, so reserving its shape avoids the jump when results
 * land (ui-ux-pro-max, Feedback/Loading Indicators; CLS).
 */
function RunningSkeleton() {
  return (
    <div aria-busy="true" className="rounded-xl2 border border-hairline bg-surface/30 p-5 sm:p-6">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-amber">
        Running — Gmail → Slack → pay
      </p>
      <div className="mt-4 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3.5">
            <span className="h-9 w-9 shrink-0 rounded-full border border-hairline" />
            <span
              className="h-9 flex-1 rounded-card border border-hairline bg-raised/30"
              style={{ opacity: 1 - i * 0.18 }}
            />
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-muted">
        Each hop is gated before it runs, then sealed against the hop before it.
      </p>
    </div>
  );
}
