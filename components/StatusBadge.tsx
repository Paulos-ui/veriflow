import { cn } from "@/lib/utils";

// State vocabulary, fixed by design-system/veriflow/MASTER.md §2.3.
//   verdigris = verified/allowed   amber = awaiting   alert = refused
//   signal    = identity           gold  = brand metal, never a state
// Every entry carries a glyph as well as a hue so state survives greyscale and
// colour-blindness (MASTER.md §2.5).
const MAP: Record<string, { label: string; glyph: string; cls: string }> = {
  // agent lifecycle
  active:       { label: "Sealed",       glyph: "●", cls: "text-verdigris border-verdigris/35 bg-verdigris/[0.08]" },
  provisioning: { label: "Provisioning", glyph: "◌", cls: "text-amber border-amber/30 bg-amber/[0.07]" },
  suspended:    { label: "Suspended",    glyph: "◑", cls: "text-alert border-alert/30 bg-alert/[0.07]" },
  // attestation
  verified:     { label: "Attested",     glyph: "●", cls: "text-verdigris border-verdigris/35 bg-verdigris/[0.08]" },
  pending:      { label: "Awaiting",     glyph: "◌", cls: "text-amber border-amber/30 bg-amber/[0.07]" },
  failed:       { label: "Failed",       glyph: "╳", cls: "text-alert border-alert/30 bg-alert/[0.07]" },
  // decisions
  approve:      { label: "Approve",      glyph: "●", cls: "text-verdigris border-verdigris/35 bg-verdigris/[0.08]" },
  reject:       { label: "Reject",       glyph: "╳", cls: "text-alert border-alert/30 bg-alert/[0.07]" },
  needs_review: { label: "Needs review", glyph: "◌", cls: "text-amber border-amber/30 bg-amber/[0.07]" },
  // execution provenance (MASTER.md §8) — a judge reads live vs recorded here
  live:         { label: "Live",         glyph: "◆", cls: "text-verdigris border-verdigris/35 bg-verdigris/[0.08]" },
  fixture:      { label: "Fixture",      glyph: "◇", cls: "text-muted border-hairline bg-bone/[0.04]" },
  simulated:    { label: "Simulated",    glyph: "◈", cls: "text-amber border-amber/30 bg-amber/[0.07]" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, glyph: "·", cls: "text-muted border-hairline bg-bone/[0.04]" };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em]",
        s.cls
      )}
    >
      <span aria-hidden className="text-[9px] leading-none">{s.glyph}</span>
      {s.label}
    </span>
  );
}
