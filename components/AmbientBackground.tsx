"use client";

/**
 * The substrate the workbench sits on. An engraved field, not an atmosphere:
 * a fine measurement grid that fades toward the edges, plus a vignette to seat
 * content. Deliberately static — MASTER.md §4.5 reserves motion for state, and
 * ambient drift would compete with the only thing here allowed to move (an
 * awaiting ring). Pure CSS, no canvas, nothing to animate, nothing to repaint.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-ink" />

      {/* fine measurement grid — the ruled paper of an instrument */}
      <div
        className="absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--bone-rgb)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--bone-rgb)) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, #000 25%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, #000 25%, transparent 78%)",
        }}
      />

      {/* a single warm gather at the top, where the seal lives */}
      <div
        className="absolute inset-x-0 top-0 h-[38vh]"
        style={{
          background:
            "radial-gradient(80% 100% at 50% 0%, rgb(var(--gold-rgb) / 0.05), transparent 70%)",
        }}
      />

      {/* vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 80% at 50% 30%, transparent 42%, rgb(var(--ink-rgb) / 0.9) 100%)",
        }}
      />
    </div>
  );
}
