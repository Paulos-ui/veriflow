"use client";

import { useRef, useState } from "react";
import { useScroll, useMotionValueEvent } from "framer-motion";
import { AuthorityRing } from "@/components/seal/AuthorityRing";
import { HOP_ORDER, type HopKind } from "@/lib/cases/model";
import { agentFor, type AgentRole } from "@/lib/agents/roster";

// =============================================================================
// CaseWalkthrough — one real case crossing three apps, advanced by scroll.
//
// This is the *second* driver of the same primitive: in the live workspace the
// ring narrows as hops verify, and here scroll stands in for the run. A judge
// who reads this page and then runs a case sees identical physics, which is the
// point — the marketing surface is not a separate invention.
//
// The card is a faithful reduction of the real timeline: same glyph vocabulary
// (MASTER.md §5.2), same agent names, same tool names. If a tool is renamed in
// the roster, this page names it wrongly and that is a bug — deliberately, so
// the copy stays tied to the system.
// =============================================================================

interface Step {
  label: string;
  role: AgentRole;
  /** What actually happens, in domain language. */
  action: string;
  /** The tool that runs, or null for hops that touch nothing external. */
  tool: string | null;
  /** The app crossed at this hop, for the "three apps" claim. */
  app: "Gmail" | "Slack" | "Stripe" | null;
}

// Keyed by HopKind, ordered by HOP_ORDER below. Two guarantees fall out of that:
// a hop added to the model without copy here is a type error, and the narrative
// can never present the hops in an order the state machine does not use.
const STEP: Record<HopKind, Step> = {
  ingest: {
    label: "Ingest",
    role: "mail.reader",
    action: "Finds the invoice from an allowlisted sender and pulls the attachment.",
    tool: "gmail.find_invoice",
    app: "Gmail",
  },
  plan: {
    label: "Plan",
    role: "orchestrator",
    action:
      "Extracts vendor, amount and due date, then proposes a payment. Holds no app tokens, so it can only ask.",
    tool: null,
    app: null,
  },
  gate: {
    label: "Human gate",
    role: "comms.poster",
    action:
      "Posts the proposal to the one approval channel and waits for a human. Silence stops the chain.",
    tool: "slack.await_approval",
    app: "Slack",
  },
  pay: {
    label: "Pay",
    role: "pay.clerk",
    action:
      "Pays only if the vendor is allowlisted, the amount is under the cap, and the approval is on record. All three, or nothing.",
    tool: "pay.charge",
    app: "Stripe",
  },
  notify: {
    label: "Notify",
    role: "comms.poster",
    action: "Posts the receipt and its proof back to the same channel.",
    tool: "slack.post_proof",
    app: "Slack",
  },
  proof: {
    label: "Proof",
    role: "orchestrator",
    action:
      "Seals the chain. Every hop carries the hash of the one before it, so a rewritten step breaks the rest.",
    tool: null,
    app: null,
  },
};

const STEPS = HOP_ORDER.map((kind) => ({ kind, ...STEP[kind] }));

export function CaseWalkthrough() {
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: track,
    // A hop verifies as it passes the reader's eye, not as the section's edge
    // crosses the fold.
    offset: ["start center", "end center"],
  });

  /** Hops completed. 0 = nothing run yet, 6 = sealed. */
  const [done, setDone] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.max(0, Math.min(STEPS.length, Math.floor(p * (STEPS.length + 1))));
    setDone((cur) => (cur === next ? cur : next));
  });

  const complete = done === STEPS.length;

  return (
    <section ref={track} aria-labelledby="case-heading" className="py-20 md:py-28">
      <p className="eyebrow mb-3">One case, three apps</p>
      <h2
        id="case-heading"
        className="max-w-2xl font-display text-[clamp(1.9rem,4vw,2.9rem)] leading-[1.1] text-bone"
      >
        An invoice arrives. Four agents move it — and{" "}
        <span className="text-verdigris">none of them can do the others&rsquo; job</span>.
      </h2>

      <div className="mt-9 rounded-card border border-hairline bg-surface">
        {/* Card head: the state readout, pinned from md up so the ring stays in
            view while the hops it summarises scroll past underneath. The card
            itself is never pinned — six rows plus a header would overflow a
            short viewport, and clipped evidence is worse than no animation. */}
        <div className="z-10 flex items-center gap-4 rounded-t-card border-b border-hairline bg-surface px-5 py-4 sm:px-6 md:sticky md:top-0">
          <AuthorityRing
            narrowing={done / STEPS.length}
            state={complete ? "verified" : "awaiting"}
            boundRules={Math.min(4, done)}
            totalRules={4}
            size={52}
          />
          <div className="min-w-0">
            <p className="crypto text-[12px] text-muted">
              case · Aurora Systems · $4,820.00
            </p>
            <p
              className={`text-[14px] ${complete ? "text-verdigris" : "text-amber"}`}
            >
              {complete
                ? "Completed — chain sealed"
                : done === 0
                      ? "Awaiting first hop"
                      : `Running — ${done} of ${STEPS.length} hops verified`}
                </p>
              </div>
              <span
                className={`crypto ml-auto shrink-0 rounded-sm border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${
                  complete
                    ? "border-verdigris/40 bg-verdigris/10 text-verdigris"
                    : "border-amber/40 bg-amber/10 text-amber"
                }`}
              >
                {complete ? "sealed" : "open"}
              </span>
            </div>

            <ol>
              {STEPS.map((step, i) => {
                const verified = i < done;
                const active = i === done;
                const agent = agentFor(step.role);

                return (
                  <li
                    key={step.kind}
                    className={`relative flex gap-4 border-b border-hairline/60 px-5 py-6 last:border-b-0 sm:px-6 md:py-8 ${
                      active ? "bg-raised/50" : ""
                    }`}
                  >
                    {/* Rail + node. The connector spans exactly the row's top
                        padding, so its length must track py-6 / md:py-8 above. */}
                    <div className="relative flex w-4 shrink-0 justify-center">
                      {i > 0 && (
                        <span
                          aria-hidden
                          className={`absolute -top-6 h-6 w-px transition-colors duration-300 md:-top-8 md:h-8 ${
                            verified ? "bg-verdigris" : "bg-hairline"
                          }`}
                        />
                      )}
                      <span
                        aria-hidden
                        className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border text-[10px] leading-none transition-colors duration-300 ${
                          verified
                            ? "border-verdigris bg-verdigris/10 text-verdigris"
                            : active
                              ? "border-amber bg-amber/10 text-amber"
                              : "border-hairline text-faint"
                        }`}
                      >
                        {verified ? "●" : active ? "◌" : "○"}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3
                          className={`text-[15px] transition-colors duration-300 ${
                            verified || active ? "text-bone" : "text-muted"
                          }`}
                        >
                          {step.label}
                        </h3>
                        <span className="crypto text-[11px] text-identity">
                          {agent.name}
                        </span>
                        {step.app && (
                          <span className="crypto rounded-sm border border-hairline px-1.5 py-0.5 text-[10px] text-muted">
                            {step.app}
                          </span>
                        )}
                        {step.tool && (
                          <span className="crypto text-[11px] text-faint">
                            {step.tool}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted">
                        {step.action}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

      <p aria-live="polite" className="sr-only">
        {complete
          ? "All six hops verified. The chain is sealed."
          : `${done} of ${STEPS.length} hops verified.`}
      </p>

      <p className="mt-5 max-w-2xl text-[14px] leading-relaxed text-faint">
        {complete
          ? "Six hops, four agents, three apps, one hash chain. Terminal 3 signs the identities and mandates — it is the trust layer, not one of the three apps."
          : "Each hop writes an attestation row: agent, tool, argument hash, result hash, mandate version, and the reason it passed or failed."}
      </p>
    </section>
  );
}
