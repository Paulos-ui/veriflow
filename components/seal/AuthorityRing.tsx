"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useId } from "react";

// =============================================================================
// AuthorityRing — the only motion idea in VeriFlow.
//
// An ungoverned agent is wide, open and drifting. Every mandate rule that binds
// it tightens the ring. A fully-bound agent is tight, closed and STILL.
//
//   narrowing 0 ─────────────────────────────────────────────────► 1
//   radius      wide ..................................... tight
//   gap         open arc ............................... closed
//   drift       rotating ................................. still
//   ticks       none ..................... one per bound rule
//
// Two drivers, one primitive (MASTER.md §4.3):
//   /about          narrowing = scroll progress
//   case timeline   narrowing = completedHops / totalHops
//
// Terminal states:
//   verified  contracts, closes, stops.        Stillness is the success signal.
//   awaiting  holds mid-radius, arc rotates.   Motion here is information.
//   refused   locks mid-contraction, arc STAYS OPEN. Authority never closed.
// =============================================================================

export type RingState = "awaiting" | "verified" | "refused";

const HUE: Record<RingState, string> = {
  awaiting: "var(--amber)",
  verified: "var(--verdigris)",
  refused: "var(--alert)",
};

/** Where a refused ring freezes if the caller doesn't say. Mid-contraction, visibly incomplete. */
const REFUSAL_LOCK = 0.55;

export function AuthorityRing({
  narrowing,
  state,
  size = 120,
  /** One tick per mandate rule that has bound. They snap in as authority narrows. */
  boundRules = 0,
  totalRules = 4,
  children,
}: {
  narrowing: number;
  state: RingState;
  size?: number;
  boundRules?: number;
  totalRules?: number;
  children?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const titleId = useId();
  const hue = HUE[state];

  // A refused ring never completes its contraction — it locks where it failed.
  const t = state === "refused" ? Math.min(narrowing, REFUSAL_LOCK) : clamp01(narrowing);

  // Geometry. viewBox is a fixed 120 grid; `size` only scales the rendering.
  const rOuter = lerp(52, 34, t); // wide -> tight
  const circumference = 2 * Math.PI * rOuter;

  // Arc closure. Verified closes fully; refused keeps a visible gap you can
  // read from across a room; awaiting sits between, dashed.
  const gapFraction = state === "verified" ? lerp(0.34, 0, t) : state === "refused" ? 0.26 : lerp(0.34, 0.12, t);
  const dashArc = circumference * (1 - gapFraction);

  // Dash pattern: broken at 0, solid at 1. The segments fuse as rules bind.
  const segments = Math.max(1, Math.round(lerp(9, 1, t)));
  const segLen = dashArc / segments;
  const gapLen = state === "verified" && t > 0.98 ? 0 : lerp(segLen * 0.5, 0.5, t);
  const dashArray = `${segLen - gapLen} ${gapLen} `.repeat(segments) + `0 ${circumference * gapFraction}`;

  // Only an unresolved ring drifts. Verified is still; refused is frozen.
  const drifting = state === "awaiting" && !reduced;

  const label =
    state === "verified"
      ? "Authority fully bound — verified"
      : state === "refused"
        ? "Authority did not close — refused"
        : "Authority narrowing — awaiting";

  return (
    <div
      style={{ position: "relative", width: size, height: size }}
      role="img"
      aria-labelledby={titleId}
    >
      <svg width={size} height={size} viewBox="0 0 120 120">
        <title id={titleId}>{label}</title>

        {/* The unbounded starting radius, always faintly visible: the authority
            the agent would have had without a mandate. The gap between this and
            the live ring IS the mandate. */}
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--faint)" strokeWidth="0.5" strokeDasharray="1 5" opacity="0.35" />

        {/* Bezel ticks — one per rule that has bound. Each snaps, never fades. */}
        <g>
          {Array.from({ length: totalRules }).map((_, i) => {
            const bound = i < boundRules;
            const a = (i / totalRules) * Math.PI * 2 - Math.PI / 2;
            const r1 = rOuter + 6;
            const r2 = rOuter + (bound ? 11 : 8.5);
            return (
              <line
                key={i}
                x1={60 + Math.cos(a) * r1}
                y1={60 + Math.sin(a) * r1}
                x2={60 + Math.cos(a) * r2}
                y2={60 + Math.sin(a) * r2}
                stroke={bound ? hue : "var(--faint)"}
                strokeWidth={bound ? 1.6 : 0.75}
                opacity={bound ? 0.95 : 0.4}
                style={{ transition: reduced ? "none" : "stroke 240ms linear, stroke-width 160ms linear" }}
              />
            );
          })}
        </g>

        {/* The authority ring itself. */}
        <motion.g
          animate={drifting ? { rotate: 360 } : { rotate: 0 }}
          transition={drifting ? { duration: 9, ease: "linear", repeat: Infinity } : { duration: 0 }}
          style={{ originX: "60px", originY: "60px" }}
        >
          <motion.circle
            cx="60"
            cy="60"
            fill="none"
            stroke={hue}
            strokeLinecap="round"
            initial={false}
            animate={{
              r: rOuter,
              strokeWidth: state === "verified" && t > 0.98 ? 2 : 1.4,
              strokeDasharray: dashArray,
            }}
            transition={reduced ? { duration: 0 } : { duration: 0.52, ease: [0.22, 1, 0.36, 1] }}
            // rotate the gap to the top-right so it reads as an opening, not a seam
            transform="rotate(-58 60 60)"
          />
        </motion.g>

        {/* Refusal mark: the chain stopped here. Drawn across the open gap. */}
        {state === "refused" && (
          <motion.g
            initial={reduced ? false : { opacity: 0, scale: 1.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16, ease: "linear" }}
            style={{ originX: "60px", originY: "60px" }}
          >
            <line x1={60 + rOuter - 7} y1={60 - rOuter + 7} x2={60 + rOuter + 7} y2={60 - rOuter - 7} stroke={hue} strokeWidth="2" strokeLinecap="round" transform="rotate(-58 60 60)" />
            <line x1={60 + rOuter + 7} y1={60 - rOuter + 7} x2={60 + rOuter - 7} y2={60 - rOuter - 7} stroke={hue} strokeWidth="2" strokeLinecap="round" transform="rotate(-58 60 60)" />
          </motion.g>
        )}
      </svg>

      {children && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">{children}</div>
      )}
    </div>
  );
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}
