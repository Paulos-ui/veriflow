import type { Config } from "tailwindcss";

// Tailwind is pinned to 3.4.17 on purpose — v4 relocates the PostCSS plugin and
// breaks this config. See README.
//
// Colours resolve to CSS vars declared in app/globals.css so the single source
// of truth stays there. Semantics are fixed by design-system/veriflow/MASTER.md:
//   verdigris = verified   amber = awaiting   signal = identity
//   alert     = refused    gold  = the seal's metal (brand, never state)
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: rgb("--ink-rgb"),
        surface: rgb("--surface-rgb"),
        raised: rgb("--raised-rgb"),
        hairline: rgb("--hairline-rgb"),
        bone: rgb("--bone-rgb"),
        muted: rgb("--muted-rgb"),
        faint: rgb("--faint-rgb"),
        verdigris: rgb("--verdigris-rgb"),
        amber: rgb("--amber-rgb"),
        signal: rgb("--signal-rgb"),
        alert: rgb("--alert-rgb"),
        gold: rgb("--gold-rgb"),
        bronze: rgb("--bronze-rgb"),
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      letterSpacing: { eyebrow: "0.18em" },
      borderRadius: { seal: "2px", card: "12px", xl2: "20px" },
      transitionTimingFunction: {
        // The ring easing. One curve for every authority transition.
        seal: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      boxShadow: {
        lift: "0 24px 60px -28px rgb(0 0 0 / 0.7)",
        "inset-hairline": "inset 0 0 0 1px rgb(var(--bone-rgb) / 0.06)",
        // Brand emphasis on the seal object itself — not a success signal.
        "glow-gold": "0 0 0 1px rgb(var(--gold-rgb) / 0.30), 0 0 50px -10px rgb(var(--gold-rgb) / 0.55)",
      },
      keyframes: {
        // Awaiting: a slow rotation that stops the instant a gate resolves.
        // The only ambient motion in the system, and it means "pending".
        "arc-drift": {
          "0%": { transform: "rotate(0deg)" },
          "100%": { transform: "rotate(360deg)" },
        },
        // A rule binding snaps a tick into the bezel. A snap, not a fade.
        "tick-snap": {
          "0%": { opacity: "0", transform: "scale(1.5)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        // Awaiting indicator for non-ring surfaces (status dots). Permitted
        // ONLY on something genuinely pending — it must stop when the gate
        // resolves. Never decorative. MASTER.md §4.5.
        "pending-pulse": { "0%,100%": { opacity: "0.45" }, "50%": { opacity: "1" } },
        // The cursor in the reasoning console.
        blink: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
      },
      animation: {
        "arc-drift": "arc-drift 8s linear infinite",
        "tick-snap": "tick-snap 160ms linear forwards",
        "pending-pulse": "pending-pulse 2.4s ease-in-out infinite",
        blink: "blink 1.1s step-end infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
