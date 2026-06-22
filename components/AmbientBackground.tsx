"use client";

/**
 * Living substrate behind the app. Pure CSS/SVG (no canvas) so it's cheap and
 * reduced-motion friendly. Fixed, non-interactive, sits beneath all content.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* deep base wash */}
      <div className="absolute inset-0 bg-ink" />

      {/* drifting aurora blobs */}
      <div className="absolute -left-[12%] -top-[18%] h-[55vh] w-[55vh] rounded-full bg-signal/20 blur-[120px] animate-aurora" />
      <div className="absolute right-[-10%] top-[8%] h-[48vh] w-[48vh] rounded-full bg-verdigris/18 blur-[130px] animate-aurora-slow" />
      <div className="absolute bottom-[-20%] left-[30%] h-[50vh] w-[50vh] rounded-full bg-signal/12 blur-[140px] animate-aurora" />

      {/* fine grid */}
      <div
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--bone-rgb)) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--bone-rgb)) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(120% 90% at 50% 0%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, #000 30%, transparent 80%)",
        }}
      />

      {/* slow scanline sheen */}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-bone/[0.04] to-transparent animate-scan" />

      {/* vignette to seat content */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 80% at 50% 30%, transparent 40%, rgb(var(--ink-rgb) / 0.85) 100%)" }}
      />
    </div>
  );
}
