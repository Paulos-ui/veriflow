"use client";

import { motion, AnimatePresence } from "framer-motion";

type SealState = "idle" | "pending" | "verifying" | "verified";

const COLORS: Record<SealState, string> = {
  idle: "#5C5A56",
  pending: "#D8B36A",
  verifying: "#D8B36A",
  verified: "#C5A46E",
};

export function Seal({
  state = "idle",
  size = 96,
}: {
  state?: SealState;
  size?: number;
}) {
  const color = COLORS[state];
  const verified = state === "verified";
  const verifying = state === "verifying";

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <AnimatePresence>
        {verified && (
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
          verified
            ? { scale: [1.16, 0.96, 1], rotate: [-6, 1, 0] }
            : { scale: 1, rotate: 0 }
        }
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
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
          {verifying && (
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
        <circle cx="48.6" cy="48.8" r="38" fill="none" stroke="#0C0E13" strokeWidth="0.5" opacity="0.45" />
        <circle cx="48" cy="48" r="27" fill="none" stroke={color} strokeWidth="0.75" opacity="0.5" />

        {verified ? (
          <motion.path
            d="M35 49 L44 58 L62 37"
            fill="none"
            stroke={COLORS.verified}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.25, ease: "easeOut" }}
          />
        ) : (
          <circle cx="48" cy="48" r="4" fill={color} opacity={0.9} />
        )}
      </motion.svg>
    </div>
  );
}
