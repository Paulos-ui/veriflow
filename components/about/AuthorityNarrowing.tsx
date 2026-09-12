"use client";

import { useRef, useState } from "react";
import { useScroll, useMotionValueEvent } from "framer-motion";
import { AuthorityRing } from "@/components/seal/AuthorityRing";
import { MANDATE_RULES } from "@/lib/cases/view";
import { agentFor } from "@/lib/agents/roster";

// =============================================================================
// AuthorityNarrowing — the About page's argument, made physical.
//
// Scroll is the driver; the ring is the same primitive the live case timeline
// uses (MASTER.md §4.3). Nothing here fades in. What changes as you scroll is
// the *geometry of authority*: an unbounded agent is wide, open and drifting,
// and each mandate rule that binds contracts it until only the allowed function
// remains.
//
// Deliberately QUANTIZED into five stops rather than tracked continuously.
// Authority is not granted by degrees — a rule either binds or it does not — and
// MASTER.md §4 says ticks snap, never fade. It also means five re-renders across
// the whole section instead of one per frame.
//
// Accessibility note: every rule's prose is in the DOM at every stop. Scroll
// changes *state*, never presence — a reduced-motion or screen-reader user who
// never triggers a single transition still reads the entire argument.
// =============================================================================

/** Prose per rule, keyed to the app's own rule set so the two cannot drift. */
const RULE_COPY: Record<(typeof MANDATE_RULES)[number]["id"], string> = {
  sender:
    "The mail reader may only open invoices from senders you listed. An invoice from anywhere else is not a low-confidence read — it is not a read at all.",
  channel:
    "Proposals go to exactly one channel. The agent cannot shop for an easier approver in a quieter room.",
  approval:
    "A human answers in that channel. Silence is not consent: no reply means the chain stops, and the reply itself is hashed into the record.",
  vendor:
    "Money moves only to a named vendor, only under a ceiling. Both are checked on the server before the payment adapter is even loaded.",
};

/** What the agent can still do at each stop. The narrowing, stated in words. */
const REACH: readonly string[] = [
  "Any sender · any channel · any vendor · any amount",
  "3 allowlisted senders · any channel · any vendor · any amount",
  "3 allowlisted senders · 1 approval channel · any vendor · any amount",
  "3 allowlisted senders · 1 approval channel · human approval required",
  "Aurora Systems or Meridian Supply · ≤ $5,000.00 · nothing else",
];

const STOPS = MANDATE_RULES.length + 1; // stop 0 = ungoverned

export function AuthorityNarrowing() {
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: track,
    // Tied to reading position rather than to the section's edges: a rule binds
    // as it passes the middle of the viewport, which is where the reader's eye
    // actually is.
    offset: ["start center", "end center"],
  });

  /** How many rules have bound. 0 = ungoverned, 4 = fully bound. */
  const [stage, setStage] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.max(0, Math.min(MANDATE_RULES.length, Math.floor(p * STOPS)));
    setStage((cur) => (cur === next ? cur : next));
  });

  const bound = stage;
  const settled = bound === MANDATE_RULES.length;

  return (
    <section
      ref={track}
      aria-labelledby="narrowing-heading"
      className="py-20 md:py-28"
    >
      <div className="grid gap-10 md:grid-cols-[260px_1fr] md:gap-14">
        {/* ---- the ring: geometry is the argument ----------------------- */}
        {/* Sticky only from md up. Pinning a ring plus caption on a short
            phone viewport would eat a third of the screen while the reader is
            trying to read the rules it describes. */}
        <div className="flex flex-col items-center md:sticky md:top-24 md:h-fit md:items-start">
          <AuthorityRing
            narrowing={bound / MANDATE_RULES.length}
            state={settled ? "verified" : "awaiting"}
            boundRules={bound}
            totalRules={MANDATE_RULES.length}
            size={180}
          >
            <span
              className={`crypto text-[13px] tabular-nums ${
                settled ? "text-verdigris" : "text-amber"
              }`}
            >
              {bound}/{MANDATE_RULES.length}
            </span>
          </AuthorityRing>

          <p className="eyebrow mt-6">Reach</p>
          <p
            className={`mt-1 max-w-[240px] text-center text-[13px] leading-relaxed md:text-left ${
              settled ? "text-bone" : "text-muted"
            }`}
          >
            {REACH[bound]}
          </p>

          {/* One announcement per stop, not per frame. */}
          <p aria-live="polite" className="sr-only">
            {settled
              ? "All four mandate rules are bound. Authority is closed."
              : `${bound} of ${MANDATE_RULES.length} mandate rules bound.`}
          </p>
        </div>

        {/* ---- the rules, always legible, state carried by rail + glyph ---- */}
        <div>
          <p className="eyebrow mb-3">How authority narrows</p>
          <h2
            id="narrowing-heading"
            className="max-w-xl font-display text-[clamp(1.9rem,4vw,2.9rem)] leading-[1.1] text-bone"
          >
            An ungoverned agent is{" "}
            <span className="text-alert">wide open</span>. Every rule you write{" "}
            <span className="text-verdigris">tightens it</span>.
          </h2>
          <p className="mt-4 max-w-xl leading-relaxed text-muted">
            These are not settings. Each one is a clause in a signed delegation
            credential, checked on the server before any tool runs.
          </p>

          {/* Generous vertical rhythm is load-bearing: it is the scroll
              distance the ring needs to narrow one rule at a time. */}
          <ol className="mt-10">
            {MANDATE_RULES.map((rule, i) => {
              const isBound = i < bound;
              const isBinding = i === bound - 1;
              const agent = agentFor(rule.role);

              return (
                <li
                  key={rule.id}
                  className={`relative border-l-2 py-8 pl-6 transition-colors duration-300 md:py-12 ${
                    isBound ? "border-verdigris" : "border-hairline"
                  }`}
                >
                  {/* Glyph carries state alongside colour (MASTER.md §2.5). */}
                  <span
                    aria-hidden
                    className={`absolute -left-[9px] top-9 grid h-4 w-4 place-items-center rounded-full border bg-ink text-[10px] leading-none md:top-[3.25rem] ${
                      isBound
                        ? "border-verdigris text-verdigris"
                        : "border-hairline text-faint"
                    }`}
                  >
                    {isBound ? "●" : "○"}
                  </span>

                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3
                      className={`text-[15px] transition-colors duration-300 ${
                        isBound ? "text-bone" : "text-muted"
                      }`}
                    >
                      {rule.label}
                    </h3>
                    <span className="crypto text-[11px] text-faint">
                      {rule.provenTool}
                    </span>
                    {isBinding && !settled && (
                      <span className="crypto rounded-sm border border-amber/40 bg-amber/10 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-amber">
                        binding
                      </span>
                    )}
                  </div>

                  <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
                    {RULE_COPY[rule.id]}
                  </p>
                  <p className="crypto mt-2 text-[11px] text-faint">
                    enforced against {agent.name} · {rule.role}
                  </p>
                </li>
              );
            })}
          </ol>

          <p
            className={`max-w-xl text-[14px] leading-relaxed transition-colors duration-500 ${
              settled ? "text-bone" : "text-faint"
            }`}
          >
            {settled
              ? "Fully bound, the ring stops moving. Stillness is the success signal — there is no remaining authority to negotiate."
              : "Keep scrolling. The ring cannot close until every rule has bound."}
          </p>
        </div>
      </div>
    </section>
  );
}
