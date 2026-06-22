"use client";

/**
 * A small, engraved gold seal — the mark stamped onto an attested object.
 * Two-tone strokes fake an emboss; a guilloché tick-ring gives it the look of
 * a struck medallion rather than a flat icon. Subtle rotate on parent hover.
 */
export function SealMark({ size = 52, active = true }: { size?: number; active?: boolean }) {
  const gold = active ? "var(--gold)" : "var(--faint)";
  const ticks = Array.from({ length: 48 });
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="attestation seal">
      {/* emboss shadow (offset dark) */}
      <circle cx="32.7" cy="33" r="29" fill="none" stroke="#05060a" strokeWidth="1.4" opacity="0.6" />
      {/* outer ring */}
      <circle cx="32" cy="32" r="29" fill="none" stroke={gold} strokeWidth="1.1" opacity="0.9" />
      {/* top highlight arc */}
      <path d="M11 24 A29 29 0 0 1 53 24" fill="none" stroke="var(--bone)" strokeOpacity="0.18" strokeWidth="1" />

      {/* guilloché tick bezel — rotates slowly on hover */}
      <g
        className="origin-center transition-transform duration-[1200ms] ease-out group-hover:rotate-[18deg]"
        style={{ transformBox: "fill-box" }}
      >
        {ticks.map((_, i) => {
          const a = (i / ticks.length) * Math.PI * 2;
          const r1 = 25.5, r2 = i % 4 === 0 ? 22.5 : 23.8;
          return (
            <line
              key={i}
              x1={32 + Math.cos(a) * r1}
              y1={32 + Math.sin(a) * r1}
              x2={32 + Math.cos(a) * r2}
              y2={32 + Math.sin(a) * r2}
              stroke={gold}
              strokeWidth="0.6"
              opacity={i % 4 === 0 ? 0.8 : 0.4}
            />
          );
        })}
      </g>

      {/* inner engraved ring */}
      <circle cx="32" cy="32" r="16.5" fill="none" stroke={gold} strokeWidth="0.8" opacity="0.55" />
      <circle cx="32" cy="32" r="16.5" fill="none" stroke="#05060a" strokeWidth="0.5" opacity="0.4" transform="translate(0.5,0.6)" />

      {/* center boss — a struck monogram mark */}
      <g>
        <circle cx="32" cy="32" r="9" fill={gold} opacity="0.12" />
        <path
          d="M27 28.5 L32 37 L37 28.5"
          fill="none"
          stroke={gold}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="32" cy="25" r="1.1" fill={gold} />
      </g>
    </svg>
  );
}
