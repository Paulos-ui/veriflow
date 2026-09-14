"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Case } from "@/lib/cases/model";
import { announce, refusedHop, timeline } from "@/lib/cases/view";
import type { ActionOutcome, ActionType, ArenaDossier } from "@/lib/arena/events";
import { ACTION_APP, ACTION_LABEL, ACTION_TYPES, actionTally } from "@/lib/arena/events";
import { CaseSeal } from "@/components/case/CaseSeal";
import { HopNode } from "@/components/case/HopNode";
import { ProofPanel } from "@/components/case/ProofPanel";
import { WhyBlocked } from "@/components/case/WhyBlocked";
import { FindingList, VerdictChip } from "./Findings";
import { ColumnTable } from "./ColumnTable";

// =============================================================================
// The run report — what happened, in the order somebody needs it.
//
//   1. the verdict, and the evidence behind it
//   2. what the run decided to do about it, and why
//   3. what each of the four apps actually confirmed
//   4. the sealed chain, hop by hop
//
// One component for both Arena flows. A game and a spreadsheet produce the same
// Verification, so giving them two report components would eventually give them
// two different ideas of what a confirmed write looks like — and the whole claim
// here is that there is one pipeline and one audit trail.
//
// The ordering is deliberate and it is not the flattering one. The verdict comes
// from deterministic code and leads; the model's account sits below it, marked,
// and never above the findings it is describing.
// =============================================================================

export function RunReport({ kase }: { kase: Case }) {
  const dossier = kase.arena ?? null;
  const steps = useMemo(() => timeline(kase), [kase]);
  const blocked = useMemo(() => refusedHop(kase), [kase]);
  const [selected, setSelected] = useState<number | null>(null);

  // Open the halting refusal if there is one, otherwise the last sealed hop.
  // The operator's first question is always "what happened"; this answers it
  // without a click.
  useEffect(() => {
    setSelected(blocked ? blocked.index : kase.hops.length - 1);
  }, [kase, blocked]);

  const openHop = selected !== null ? kase.hops[selected] ?? null : null;

  return (
    <div className="space-y-7">
      <p aria-live="polite" className="sr-only">
        {announce(kase)}
      </p>

      <section
        aria-labelledby="run-heading"
        className="rounded-xl2 border border-hairline bg-surface/30 p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="run-heading" className="font-display text-[22px] leading-tight text-bone">
            {kase.title}
          </h2>
          <span className="crypto text-[11px] text-faint">{kase.id}</span>
        </div>

        {dossier && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <VerdictChip verdict={dossier.verification.verdict} />
            <span className="text-[13px] text-muted">{dossier.verification.outcome}</span>
          </div>
        )}

        <p className="mt-3 text-[13px] leading-relaxed text-muted">{announce(kase)}</p>

        <div className="mt-5">
          <CaseSeal kase={kase} />
        </div>
      </section>

      {dossier && <Evidence dossier={dossier} />}
      {dossier && <Account dossier={dossier} />}
      {dossier && <Reach dossier={dossier} />}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <section aria-labelledby="run-timeline-heading">
          <h2
            id="run-timeline-heading"
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

        <section aria-labelledby="run-evidence-heading" className="lg:sticky lg:top-24 lg:self-start">
          <h2
            id="run-evidence-heading"
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

      <p className="text-[12.5px] text-muted">
        This run is on the{" "}
        <Link href="/activity" className="text-bone underline decoration-hairline underline-offset-4 hover:decoration-bone">
          activity ledger
        </Link>
        . Its hops are hashed in order, so a later edit to any one of them stops matching the
        record.
      </p>
    </div>
  );
}

// --- 1 · the evidence ---------------------------------------------------------

function Evidence({ dossier }: { dossier: ArenaDossier }) {
  const { verification, columns } = dossier;
  return (
    <section aria-labelledby="findings-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="findings-heading"
          className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted"
        >
          Findings
        </h2>
        <span className="crypto text-[11px] text-faint">
          subject {verification.subjectHash.slice(0, 12)}…{verification.subjectHash.slice(-6)}
        </span>
      </div>

      <FindingList findings={verification.findings} />

      {columns && columns.length > 0 && <ColumnTable columns={columns} />}
    </section>
  );
}

// --- 2 · the model's account --------------------------------------------------

function Account({ dossier }: { dossier: ArenaDossier }) {
  const n = dossier.verification.narration;
  const plan = dossier.plan;
  if (!n) return null;

  const disagreed = !n.agreedWithEngine;

  return (
    <section aria-labelledby="account-heading" className="space-y-3">
      <h2
        id="account-heading"
        className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted"
      >
        Account
      </h2>

      <blockquote
        className={cn(
          "rounded-card border-l-2 border border-hairline bg-surface/30 px-4 py-3.5",
          disagreed ? "border-l-amber" : "border-l-hairline"
        )}
      >
        <p className="text-[14px] leading-relaxed text-bone">{n.text}</p>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-faint">
          <span className="font-mono uppercase tracking-[0.14em]">
            {n.method === "model" ? "Written by a model" : "Written by the fallback"}
          </span>
          {n.model && <span className="crypto">{n.model}</span>}
        </p>
      </blockquote>

      {disagreed && (
        <p className="rounded-card border border-amber/30 bg-amber/[0.05] px-4 py-3 text-[12.5px] leading-relaxed text-amber">
          The model read this as{" "}
          <span className="font-medium">{n.claimed ?? "something it would not name"}</span>. The
          engine disagreed, and the engine&rsquo;s verdict is the one recorded, sealed and sent. The
          account is kept because a disagreement is information about the model.
        </p>
      )}

      <div className="rounded-card border border-hairline bg-surface/30 px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Plan</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-bone">{plan.rationale}</p>
        <p className="mt-1.5 text-[11.5px] text-faint">
          {plan.method === "model"
            ? "Chosen by the model, then narrowed to what the mandates already allow. It can decline an action; it cannot add one."
            : "Chosen by the deterministic planner."}
        </p>
      </div>
    </section>
  );
}

// --- 3 · what the apps confirmed ----------------------------------------------

const STATUS: Record<ActionOutcome["status"], { word: string; cls: string; glyph: string }> = {
  succeeded: { word: "Confirmed", cls: "text-verdigris", glyph: "●" },
  refused: { word: "Refused", cls: "text-alert", glyph: "◑" },
  skipped: { word: "Not done", cls: "text-muted", glyph: "–" },
};

/**
 * Labels for the identifiers the four adapters hand back. Anything unlisted
 * renders under its own key rather than being dropped — a ref we forgot to name
 * is still evidence, and hiding it to keep the row tidy would be the wrong
 * trade every time.
 */
const REF_LABEL: Record<string, string> = {
  repo: "Repository",
  issue: "Issue",
  url: "Link",
  chat: "Chat",
  message: "Message",
  database: "Database",
  page: "Page",
  unmapped: "Unmapped fields",
  cluster: "Cluster",
  signature: "Signature",
  address: "Signer",
};

function Reach({ dossier }: { dossier: ArenaDossier }) {
  const { confirmed, attempted } = actionTally(dossier);
  const by = new Map<ActionType, ActionOutcome>(dossier.outcomes.map((o) => [o.type, o]));

  return (
    <section aria-labelledby="reach-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="reach-heading"
          className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted"
        >
          Actions
        </h2>
        <p className="text-[12px] text-muted">
          <span className={confirmed === attempted ? "text-verdigris" : "text-amber"}>
            {confirmed}
          </span>{" "}
          of {attempted} attempted {attempted === 1 ? "action" : "actions"} confirmed by the app
          itself
        </p>
      </div>

      <ul className="space-y-2">
        {ACTION_TYPES.map((type) => {
          const o = by.get(type);
          if (!o) return null;
          const s = STATUS[o.status];
          const refs = Object.entries(o.refs);

          return (
            <li
              key={type}
              className={cn(
                "rounded-card border px-4 py-3",
                o.status === "succeeded"
                  ? "border-verdigris/25 bg-verdigris/[0.04]"
                  : o.status === "refused"
                    ? "border-alert/30 bg-alert/[0.04]"
                    : "border-hairline bg-surface/25"
              )}
            >
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span aria-hidden className={cn("font-mono text-[11px] leading-none", s.cls)}>
                  {s.glyph}
                </span>
                <span className="font-display text-[15px] leading-none text-bone">
                  {ACTION_APP[type]}
                </span>
                <span className={cn("font-mono text-[10px] uppercase tracking-[0.14em]", s.cls)}>
                  {s.word}
                </span>
                <span className="text-[11.5px] text-faint">{ACTION_LABEL[type].toLowerCase()}</span>
              </div>

              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{o.note}</p>

              {o.refusal?.remedy && (
                <p className="mt-1.5 text-[12px] leading-relaxed text-amber">{o.refusal.remedy}</p>
              )}

              {refs.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {refs.map(([k, v]) => (
                    <li key={k} className="min-w-0 text-[11.5px]">
                      <span className="text-faint">{REF_LABEL[k] ?? k}: </span>
                      {/^https?:\/\//.test(v) ? (
                        <a
                          href={v}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="crypto text-verdigris underline decoration-verdigris/30 underline-offset-4 hover:decoration-verdigris"
                        >
                          {v.length > 56 ? `${v.slice(0, 56)}…` : v}
                        </a>
                      ) : (
                        <span className="crypto text-bone">{v}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
