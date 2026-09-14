"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useMotionValueEvent, useScroll } from "framer-motion";
import { cn } from "@/lib/utils";
import { ACTION_APP, ACTION_LABEL, ACTION_TYPES } from "@/lib/arena/events";
import { VerdictChip } from "@/components/arena/Findings";

// =============================================================================
// The landing narrative — the argument, in the order it has to be made.
//
// Scroll drives it, but scroll never hides anything. Every word of every act is
// in the DOM from first paint; what scroll changes is which act is *lit*, the
// same quantized-stop discipline AuthorityNarrowing uses on the About page. A
// reader with reduced motion, a screen reader, or a browser that never fires a
// scroll event still gets the whole case.
//
// Five acts, because the claim only lands if they arrive in this order:
//
//   1. a result is a claim, and claims are free to forge
//   2. so the verdict is computed, not asserted
//   3. the model may narrow what happens next, never widen it
//   4. the writes are made by four agents who cannot reach each other's keys
//   5. and the record is chained, so altering it is detectable
//
// Skip act 1 and act 2 sounds like ceremony. Skip act 3 and act 4 sounds like
// trusting a model. The order is the argument.
// =============================================================================

interface Act {
  /** Two digits, monospace — the record's own numbering idiom. */
  ordinal: string;
  /** The rail label. Short enough to read at a glance in a sticky column. */
  rail: string;
  title: string;
  lede: string;
  body: string;
}

const ACTS: readonly Act[] = [
  {
    ordinal: "01",
    rail: "The claim",
    title: "A result is just a claim.",
    lede: "Five numbers in a text field say X won this game.",
    body:
      "So would five numbers I invented. Nothing about a submitted log distinguishes a game that was played from a game that was typed — which is exactly what makes it the honest test case for a verification pipeline. If the system cannot tell these apart, nothing downstream of it means anything.",
  },
  {
    ordinal: "02",
    rail: "The replay",
    title: "So the verdict is computed.",
    lede: "The log is replayed from an empty board, server-side, move by move.",
    body:
      "Turn order, occupied squares, moves played after the game was already decided — each is a reason to refuse, and the refusal names which move failed and why. No model is asked for an opinion on the outcome. The same engine profiles a spreadsheet column by column: counts, medians, spread, and the rows behind each finding.",
  },
  {
    ordinal: "03",
    rail: "The narrowing",
    title: "The model may narrow the plan.",
    lede: "Never widen it. The set of permitted actions is fixed before it is asked.",
    body:
      "A language model writes the account of what happened and may drop actions it thinks are unwarranted. It cannot add one. If it returns something outside the fixed set, the plan falls back to the deterministic one and the case records that it did. Its disagreement is kept and shown next to the finding it disagrees with, not quietly resolved.",
  },
  {
    ordinal: "04",
    rail: "The reach",
    title: "Four keys, four destinations.",
    lede: "Every write is made by a different agent holding one credential.",
    body:
      "The agent that opens an issue has no token for the chat. The agent that anchors a memo cannot reach the database. Each mandate is checked on the server before the adapter is even loaded, so an action outside the bounds is not a failed call — it is a call that never happened. Each agent reports its own outcome in its own name, and one failure does not erase the three that confirmed.",
  },
  {
    ordinal: "05",
    rail: "The seal",
    title: "And the record is chained.",
    lede: "Each hop is hashed over its contents and the hop before it.",
    body:
      "Edit a hop and its own seal stops matching; edit the seal and the next hop stops pointing at it. The activity page re-checks the whole chain on every read and says which hop broke it. That is the only claim here that does not depend on an external service being up — the record either verifies or it does not.",
  },
];

/** The example log act 1 doubts and act 2 settles. One source, two renderings. */
const EXAMPLE_LOG: readonly number[] = [0, 1, 4, 2, 8];

export function Narrative() {
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: track,
    // Tied to reading position, not to the section's edges: an act lights as it
    // crosses the middle of the viewport, which is where the eye already is.
    offset: ["start center", "end center"],
  });

  const [act, setAct] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const next = Math.max(0, Math.min(ACTS.length - 1, Math.floor(p * ACTS.length)));
    setAct((cur) => (cur === next ? cur : next));
  });

  return (
    <section aria-labelledby="narrative-heading" className="relative">
      <h2 id="narrative-heading" className="sr-only">
        How VeriFlow turns a claim into a record
      </h2>

      <div ref={track} className="md:grid md:grid-cols-[168px_minmax(0,1fr)] md:gap-10">
        <Rail act={act} />

        <ol className="space-y-16 md:space-y-28">
          {ACTS.map((a, i) => (
            <li key={a.ordinal}>
              <ActBlock act={a} lit={i === act} index={i} />
            </li>
          ))}
        </ol>
      </div>

      <Invitation />
    </section>
  );
}

/**
 * The sticky rail. Its bar narrows act by act — the same gesture the mandates
 * make, borrowed here because the page is describing that narrowing. It is
 * aria-hidden: it repeats the ordinals already carried by the headings, and a
 * screen reader reading a progress indicator five times adds nothing.
 */
function Rail({ act }: { act: number }) {
  return (
    <div aria-hidden className="hidden md:block">
      <div className="sticky top-24">
        <p className="eyebrow text-faint">The argument</p>
        <ul className="mt-4 space-y-3.5">
          {ACTS.map((a, i) => {
            const lit = i === act;
            const passed = i < act;
            return (
              <li key={a.ordinal} className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "h-px transition-all duration-500",
                    lit ? "w-6 bg-gold" : passed ? "w-4 bg-bone/30" : "w-2 bg-hairline"
                  )}
                />
                <span
                  className={cn(
                    "crypto text-[10px] transition-colors duration-300",
                    lit ? "text-gold" : "text-faint"
                  )}
                >
                  {a.ordinal}
                </span>
                <span
                  className={cn(
                    "text-[12px] transition-colors duration-300",
                    lit ? "text-bone" : passed ? "text-muted" : "text-faint"
                  )}
                >
                  {a.rail}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Reach, stated as it contracts. Words, not just geometry. */}
        <p className="mt-6 max-w-[150px] text-[11px] leading-snug text-faint">
          {act === 0 && "Anything the log says happened."}
          {act === 1 && "Only what a replay confirms."}
          {act === 2 && "Only actions already permitted."}
          {act === 3 && "One key, one destination, each."}
          {act === 4 && "One chain, checked on every read."}
        </p>
      </div>
    </div>
  );
}

function ActBlock({ act, lit, index }: { act: Act; lit: boolean; index: number }) {
  return (
    <div className="scroll-mt-24">
      <div className="flex items-baseline gap-3 md:hidden">
        <span className={cn("crypto text-[11px]", lit ? "text-gold" : "text-faint")}>
          {act.ordinal}
        </span>
        <span className="eyebrow text-faint">{act.rail}</span>
      </div>

      <h3
        className={cn(
          "mt-2 font-display text-[24px] leading-tight transition-colors duration-500 sm:text-[30px] md:mt-0",
          lit ? "text-bone" : "text-bone/70"
        )}
      >
        {act.title}
      </h3>
      <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-bone/85">{act.lede}</p>
      <p className="mt-2.5 max-w-prose text-[13.5px] leading-relaxed text-muted">{act.body}</p>

      <div className="mt-5">
        <Figure index={index} lit={lit} />
      </div>
    </div>
  );
}

/** One figure per act, each rendered in the app's own idiom rather than as art. */
function Figure({ index, lit }: { index: number; lit: boolean }) {
  if (index === 0) return <ClaimFigure />;
  if (index === 1) return <ReplayFigure />;
  if (index === 2) return <NarrowFigure lit={lit} />;
  if (index === 3) return <ReachFigure />;
  return <SealFigure />;
}

function Board({ tone }: { tone: "doubted" | "settled" }) {
  const cells: (string | null)[] = Array(9).fill(null);
  EXAMPLE_LOG.forEach((square, turn) => {
    cells[square] = turn % 2 === 0 ? "X" : "O";
  });

  return (
    <div
      aria-hidden
      className={cn(
        "grid w-[132px] grid-cols-3 gap-px rounded-card border p-px transition-colors duration-500",
        tone === "settled" ? "border-verdigris/30 bg-verdigris/[0.04]" : "border-hairline bg-surface/40"
      )}
    >
      {cells.map((mark, i) => (
        <span
          key={i}
          className={cn(
            "grid h-[42px] place-items-center bg-ink/40 font-display text-[18px]",
            mark === "X" ? "text-bone" : mark === "O" ? "text-muted" : "text-transparent"
          )}
        >
          {mark ?? "·"}
        </span>
      ))}
    </div>
  );
}

function ClaimFigure() {
  return (
    <figure className="flex flex-wrap items-center gap-5 rounded-xl2 border border-hairline bg-surface/25 p-4">
      <Board tone="doubted" />
      <figcaption className="min-w-0 flex-1 space-y-2">
        <p className="crypto text-[11.5px] text-faint">
          moves = [{EXAMPLE_LOG.join(", ")}]
        </p>
        <p className="text-[12.5px] leading-relaxed text-muted">
          That is the entire submission. It arrives as five integers with no signature, no witness
          and no history — indistinguishable from five integers nobody played.
        </p>
      </figcaption>
    </figure>
  );
}

function ReplayFigure() {
  return (
    <figure className="flex flex-wrap items-center gap-5 rounded-xl2 border border-hairline bg-surface/25 p-4">
      <Board tone="settled" />
      <figcaption className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <VerdictChip verdict="x_won" size="sm" />
          <span className="text-[12px] text-faint">0 · 4 · 8 — a diagonal, on move five</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Replayed from empty. Turn order holds, no square is claimed twice, and the win is found
          where the log says it is. Change one number and the replay names the move it rejected.
        </p>
      </figcaption>
    </figure>
  );
}

/** Four stages of reach, drawn as a bar that contracts rather than a bar that fills. */
const NARROWING: readonly { label: string; width: string }[] = [
  { label: "Any tool the model names", width: "w-full" },
  { label: "Four permitted actions", width: "w-[64%]" },
  { label: "What the verdict warrants", width: "w-[38%]" },
  { label: "What each mandate allows", width: "w-[18%]" },
];

function NarrowFigure({ lit }: { lit: boolean }) {
  return (
    <figure className="space-y-2.5 rounded-xl2 border border-hairline bg-surface/25 p-4">
      {NARROWING.map((stage, i) => (
        <div key={stage.label} className="flex items-center gap-3">
          <span className="block h-[3px] w-[42%] shrink-0 rounded-full bg-bone/[0.06]">
            <span
              className={cn(
                "block h-full rounded-full transition-all duration-700",
                stage.width,
                lit ? "bg-gold/70" : "bg-bone/15"
              )}
              style={{ transitionDelay: `${i * 90}ms` }}
            />
          </span>
          <span className="min-w-0 text-[11.5px] text-faint">{stage.label}</span>
        </div>
      ))}
      <figcaption className="pt-1 text-[12.5px] leading-relaxed text-muted">
        Each line is shorter than the one above it. Nothing in the pipeline can make one longer.
      </figcaption>
    </figure>
  );
}

function ReachFigure() {
  return (
    <figure className="rounded-xl2 border border-hairline bg-surface/25 p-4">
      <ul className="divide-y divide-hairline">
        {ACTION_TYPES.map((type) => (
          <li key={type} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 first:pt-0 last:pb-0">
            <span className="w-[104px] shrink-0 text-[12.5px] text-bone">{ACTION_APP[type]}</span>
            <span className="min-w-0 flex-1 text-[12.5px] text-muted">{ACTION_LABEL[type]}</span>
            <span className="crypto shrink-0 text-[10.5px] text-faint">1 credential</span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-3 border-t border-hairline pt-2.5 text-[12px] leading-relaxed text-faint">
        The four destinations and what each agent is permitted to do there. Whether any of them is
        configured on this deployment is answered by the Arena itself, not by this page.
      </figcaption>
    </figure>
  );
}

function SealFigure() {
  return (
    <figure className="rounded-xl2 border border-hairline bg-surface/25 p-4">
      <p className="crypto text-[11.5px] leading-relaxed text-muted">
        hop<sub className="text-faint">n</sub>.seal = sha256( contents(hop
        <sub className="text-faint">n</sub>) ‖ hop<sub className="text-faint">n−1</sub>.seal )
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {["observe", "verify", "plan", "write", "seal"].map((step, i, all) => (
          <span key={step} className="flex items-center gap-1.5">
            <span className="rounded-seal border border-hairline px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              {step}
            </span>
            {i < all.length - 1 && (
              <span aria-hidden className="text-faint">
                →
              </span>
            )}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 text-[12.5px] leading-relaxed text-muted">
        Break any link and the check reports the index of the hop that broke it — no judgement
        call, no partial credit.
      </figcaption>
    </figure>
  );
}

function Invitation() {
  return (
    <div className="mt-16 rounded-xl2 border border-hairline bg-surface/25 p-5 sm:p-6 md:mt-24">
      <p className="font-display text-[20px] leading-tight text-bone sm:text-[24px]">
        The argument is cheap. <span className="gradient-text">Go break it.</span>
      </p>
      <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">
        Play a game and submit a tampered log. Upload a spreadsheet with something wrong in it. Then
        read the sealed record of what the system did about it.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/arena"
          className="inline-flex min-h-[44px] items-center rounded-seal border border-bone/20 bg-raised/60 px-4 text-[13px] text-bone transition-colors duration-200 hover:border-bone/35 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          Open the Arena
        </Link>
        <Link
          href="/verify"
          className="inline-flex min-h-[44px] items-center rounded-seal border border-hairline px-4 text-[13px] text-muted transition-colors duration-200 hover:border-bone/25 hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          Check a spreadsheet
        </Link>
        <Link
          href="/activity"
          className="inline-flex min-h-[44px] items-center rounded-seal border border-hairline px-4 text-[13px] text-muted transition-colors duration-200 hover:border-bone/25 hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          Read the record
        </Link>
      </div>
    </div>
  );
}
