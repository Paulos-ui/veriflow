"use client";

import { cn } from "@/lib/utils";
import type { TimelineStep } from "@/lib/cases/view";
import { shortHash } from "@/lib/cases/view";

// =============================================================================
// Hop node — MASTER.md §5.2.
//
// Geometry carries the state so the timeline survives greyscale, a compressed
// demo video, and deuteranopia:
//
//   verified   ●──   closed dot, solid connector
//   awaiting   ◌┈┈   dashed ring, dashed connector
//   refused    ◑ ╳   half ring, connector TERMINATES in a cross
//   unreached  ○     hollow, no connector drawn forward
//
// The refused connector does not continue. An operator scanning the column
// should see the chain break before reading a single word.
// =============================================================================

type NodeState = TimelineStep["state"];

const MARK: Record<NodeState, { glyph: string; ring: string; text: string }> = {
  verified: { glyph: "●", ring: "border-verdigris bg-verdigris/10", text: "text-verdigris" },
  awaiting: { glyph: "◌", ring: "border-amber bg-amber/10", text: "text-amber" },
  refused: { glyph: "◑", ring: "border-alert bg-alert/10", text: "text-alert" },
  unreached: { glyph: "○", ring: "border-hairline bg-transparent", text: "text-faint" },
};

const STATE_WORD: Record<NodeState, string> = {
  verified: "Verified",
  awaiting: "Awaiting",
  refused: "Refused",
  unreached: "Not reached",
};

export function HopNode({
  step,
  index,
  isLast,
  selected,
  onSelect,
}: {
  step: TimelineStep;
  index: number;
  isLast: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const mark = MARK[step.state];
  const { hop } = step;

  // A refused hop ends the chain; an unreached step has nothing to connect to.
  const connectorDraws = !isLast && step.state !== "refused" && step.state !== "unreached";
  const connectorDashed = step.state === "awaiting";

  // Nothing to open on a step that never ran.
  const interactive = hop !== null;

  return (
    <li className="relative flex gap-3.5">
      {/* rail: mark + connector */}
      <div className="relative flex w-9 shrink-0 flex-col items-center">
        <span
          aria-hidden
          className={cn(
            "z-10 grid h-9 w-9 place-items-center rounded-full border text-[13px] transition-colors duration-200",
            mark.ring,
            mark.text
          )}
        >
          {mark.glyph}
        </span>

        {connectorDraws && (
          <span
            aria-hidden
            className={cn(
              "absolute left-1/2 top-9 w-px -translate-x-1/2",
              // full height of the row, minus the mark
              "bottom-0",
              step.state === "verified" ? "bg-verdigris/35" : "bg-hairline"
            )}
            style={
              connectorDashed
                ? {
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, rgb(var(--amber-rgb) / 0.5) 0 3px, transparent 3px 7px)",
                    backgroundColor: "transparent",
                  }
                : undefined
            }
          />
        )}

        {/* The chain stopped here: a cross across the rail where the connector
            would have continued. Drawn, not implied by absence. */}
        {step.state === "refused" && !isLast && (
          <span
            aria-hidden
            className="absolute left-1/2 top-[42px] -translate-x-1/2 font-mono text-[12px] leading-none text-alert"
          >
            ╳
          </span>
        )}
      </div>

      {/* body */}
      <div className={cn("min-w-0 flex-1", isLast ? "pb-0" : "pb-5")}>
        <Shell interactive={interactive} selected={selected} onSelect={onSelect} state={step.state}>
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-display text-[15px] leading-none text-bone">{step.label}</span>
            <span className={cn("font-mono text-[10.5px] uppercase tracking-[0.14em]", mark.text)}>
              {STATE_WORD[step.state]}
            </span>
          </span>

          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
            <span className="text-signal">{step.agentName}</span>
            <span aria-hidden className="text-faint">
              ·
            </span>
            <span className="crypto min-w-0 truncate text-[11.5px] text-muted">
              {hop?.tool ?? (step.state === "unreached" ? "not reached" : "reasoning only")}
            </span>
          </span>

          {hop && (
            <span className="mt-2 flex flex-wrap items-center gap-2">
              {hop.provenance && <Provenance kind={hop.provenance} />}
              {hop.hopHash && (
                <span className="crypto text-[11px] text-faint">{shortHash(hop.hopHash, 8, 4)}</span>
              )}
            </span>
          )}

          {/* One plain line, always present on a hop that ran. */}
          {hop?.note && <span className="mt-2 block text-[12.5px] leading-snug text-muted">{hop.note}</span>}

          {/* The refusal headline sits ON the node — an operator must not have
              to click to learn the chain stopped. */}
          {step.state === "refused" && hop?.refusal && (
            <span className="mt-2 block text-[12.5px] font-medium leading-snug text-alert">
              {hop.refusal.message}
            </span>
          )}
        </Shell>
      </div>
    </li>
  );
}

/**
 * Buttons only where there is something to open (a hop that ran). An unreached
 * step renders as static markup rather than a control that does nothing —
 * ui-ux-pro-max, Content/Compact Label Semantics: don't make every pill
 * clickable.
 */
function Shell({
  interactive,
  selected,
  onSelect,
  state,
  children,
}: {
  interactive: boolean;
  selected: boolean;
  onSelect: () => void;
  state: NodeState;
  children: React.ReactNode;
}) {
  const base = cn(
    "flex w-full min-w-0 flex-col items-start rounded-card border px-3.5 py-3 text-left transition-colors duration-200",
    selected
      ? state === "refused"
        ? "border-alert/45 bg-alert/[0.05]"
        : "border-bone/20 bg-raised/70"
      : "border-hairline bg-surface/40"
  );

  if (!interactive) {
    return <div className={cn(base, "opacity-70")}>{children}</div>;
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      // ≥44px target comes from the padding + content; the rail mark is 36px
      // and is decorative, so the whole card is the hit area.
      className={cn(base, "min-h-[44px] hover:border-bone/25 hover:bg-raised/50")}
    >
      {children}
    </button>
  );
}

/** Live vs recorded, on the hop itself (MASTER.md §8). */
function Provenance({ kind }: { kind: "live" | "fixture" | "simulated" }) {
  const map = {
    live: { label: "Live", glyph: "◆", cls: "text-verdigris border-verdigris/35 bg-verdigris/[0.07]" },
    fixture: { label: "Fixture", glyph: "◇", cls: "text-muted border-hairline bg-bone/[0.03]" },
    simulated: { label: "Simulated", glyph: "◈", cls: "text-amber border-amber/30 bg-amber/[0.06]" },
  }[kind];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-seal border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em]",
        map.cls
      )}
    >
      <span aria-hidden>{map.glyph}</span>
      {map.label}
    </span>
  );
}
