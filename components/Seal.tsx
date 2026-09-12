"use client";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

// The seal object. Struck from gold — that is its material, not its status
// (MASTER.md §2.4). State is expressed by hue on the ring and by the verify
// ripple, which fires exactly once, on transition to verified.
type SealState = "idle" | "pending" | "verifying" | "verified";

const COLORS: Record<SealState, string> = {
  idle: "var(--faint)",
  pending: "var(--amber)",
  verifying: "var(--amber)",
  verified: "var(--verdigris)",
};

export function Seal({
  state = "idle",
  size = 96,
}: {
  state?: SealState;
  size?: number;
}) {
  const reduced = useReducedMotion();
  const color = COLORS[state];
  const verified = state === "verified";
  const verifying = state === "verifying";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <AnimatePresence>
        {verified && !reduced && (
          <motion.span
            key="ripple"
            initial={{ scale: 0.6, opacity: 0.5 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 1.1, ease: "easeOut" }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `1px solid ${COLORS.verified}`,
            }}
          />
        )}
      </AnimatePresence>

      <motion.svg
        width={size}
        height={size}
        viewBox="0 0 96 96"
        role="img"
        aria-label={`Attestation seal: ${state}`}
        initial={false}
        animate={
          verified && !reduced
            ? { scale: [1.16, 0.96, 1], rotate: [-6, 1, 0] }
            : { scale: 1, rotate: 0 }
        }
        transition={{ duration: reduced ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* bezel ticks — precision instrument, not wax */}
        <g stroke={color} strokeWidth="0.75" opacity={0.85}>
          {Array.from({ length: 4 }).map((_, i) => {
            const a = (i * Math.PI) / 2;
            const x = 48 + Math.cos(a) * 41;
            const y = 48 + Math.sin(a) * 41;
            const x2 = 48 + Math.cos(a) * 36;
            const y2 = 48 + Math.sin(a) * 36;
            return <line key={i} x1={x} y1={y} x2={x2} y2={y2} />;
          })}
        </g>

        <circle
          cx="48"
          cy="48"
          r="38"
          fill="none"
          stroke={color}
          strokeWidth={verified ? 1.4 : 1}
          strokeDasharray={state === "pending" || verifying ? "2 6" : undefined}
        >
          {verifying && !reduced && (
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 48 48"
              to="360 48 48"
              dur="3.5s"
              repeatCount="indefinite"
            />
          )}
        </circle>
        {/* engraved inner edge */}
        <circle cx="48.6" cy="48.8" r="38" fill="none" stroke="var(--ink)" strokeWidth="0.5" opacity="0.45" />
        <circle cx="48" cy="48" r="27" fill="none" stroke={color} strokeWidth="0.75" opacity="0.5" />

        {verified ? (
          <motion.path
            d="M35 49 L44 58 L62 37"
            fill="none"
            stroke={COLORS.verified}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: reduced ? 0 : 0.5, delay: reduced ? 0 : 0.25, ease: "easeOut" }}
          />
        ) : (
          <circle cx="48" cy="48" r="4" fill={color} opacity={0.9} />
        )}
      </motion.svg>
    </div>
  );
}
