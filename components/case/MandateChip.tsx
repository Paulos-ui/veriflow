"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

// =============================================================================
// Mandate chip — MASTER.md §5.4.
//
// Renders authority as BOUNDS, not permissions: "≤ $5,000" reads as a ceiling,
// "$5,000 allowed" reads as a budget. The framing is the point of the component.
//
// Compact-label discipline (ui-ux-pro-max, Content/Compact Label Overflow):
// a chip label stays on one line and never wraps to a second; values that can
// be long (a sender allowlist) are bounded and disclosed through an operable
// button rather than a hover-only tooltip.
// =============================================================================

export type ChipTone = "bound" | "open" | "identity";

const TONE: Record<ChipTone, string> = {
  // A real constraint that narrows what the agent may do.
  bound: "border-verdigris/30 bg-verdigris/[0.07] text-verdigris",
  // No authority at all on this dimension — the orchestrator's empty function
  // list. Muted rather than alarming: zero authority is the safe state.
  open: "border-hairline bg-bone/[0.03] text-muted",
  // Cryptographic identity material (MASTER.md §2.3: violet is a category).
  identity: "border-signal/30 bg-signal/[0.07] text-signal",
};

export function MandateChip({
  label,
  value,
  tone = "bound",
  /** Full text revealed on click when `value` is abbreviated. */
  detail,
}: {
  label: string;
  value: string;
  tone?: ChipTone;
  detail?: string;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const expandable = Boolean(detail && detail !== value);

  const body = (
    <>
      <span aria-hidden className="text-faint">
        {label}
      </span>
      {/* min-w-0 + truncate keeps a long value on one line instead of wrapping
          the chip to two, which is what breaks a chip row visually. */}
      <span className="min-w-0 truncate">{value}</span>
    </>
  );

  const shell =
    "inline-flex max-w-full items-center gap-1.5 rounded-seal border px-2 py-1 font-mono text-[11px] leading-none whitespace-nowrap";

  if (!expandable) {
    return (
      <span className={cn(shell, TONE[tone])}>
        {/* The screen reader gets the pairing spelled out; sighted users read
            the two-part chip. */}
        <span className="sr-only">{`${label}: ${value}`}</span>
        {body}
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={detailId}
        className={cn(shell, TONE[tone], "transition-colors hover:border-bone/25")}
      >
        <span className="sr-only">{`${label}: ${value}. Activate to show the full value.`}</span>
        {body}
        <span aria-hidden className="text-faint">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <span
          id={detailId}
          // overflow-wrap:anywhere via .crypto — a long allowlist reflows
          // instead of forcing the panel to scroll sideways.
          className="crypto block max-w-full rounded-seal border border-hairline bg-ink/60 px-2 py-1.5 text-[11px] text-muted"
        >
          {detail}
        </span>
      )}
    </span>
  );
}
