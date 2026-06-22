import type { Config } from "tailwindcss";

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
        signal: rgb("--signal-rgb"),
        verdigris: rgb("--verdigris-rgb"),
        amber: rgb("--amber-rgb"),
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
      boxShadow: {
        "glow-verdigris": "0 0 0 1px rgb(var(--verdigris-rgb) / 0.25), 0 0 40px -8px rgb(var(--verdigris-rgb) / 0.45)",
        "glow-gold": "0 0 0 1px rgb(var(--gold-rgb) / 0.30), 0 0 50px -10px rgb(var(--gold-rgb) / 0.55)",
        "glow-signal": "0 0 0 1px rgb(var(--signal-rgb) / 0.30), 0 0 44px -8px rgb(var(--signal-rgb) / 0.5)",
        "lift": "0 24px 60px -28px rgb(0 0 0 / 0.7)",
        "inset-hairline": "inset 0 0 0 1px rgb(var(--bone-rgb) / 0.06)",
      },
      keyframes: {
        "seal-press": {
          "0%": { transform: "scale(1.18) rotate(-6deg)", opacity: "0" },
          "60%": { transform: "scale(0.96) rotate(1deg)", opacity: "1" },
          "100%": { transform: "scale(1) rotate(0deg)", opacity: "1" },
        },
        ripple: { "0%": { transform: "scale(0.6)", opacity: "0.5" }, "100%": { transform: "scale(2.4)", opacity: "0" } },
        aurora: {
          "0%,100%": { transform: "translate(0,0) scale(1)" },
          "33%": { transform: "translate(6%,-4%) scale(1.08)" },
          "66%": { transform: "translate(-5%,5%) scale(0.96)" },
        },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-8px)" } },
        "pulse-glow": { "0%,100%": { opacity: "0.55" }, "50%": { opacity: "1" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(900%)" } },
        blink: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
        "rise-in": { "0%": { opacity: "0", transform: "translateY(10px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
      animation: {
        "seal-press": "seal-press 0.7s cubic-bezier(0.22,1,0.36,1) forwards",
        ripple: "ripple 1.1s ease-out forwards",
        aurora: "aurora 22s ease-in-out infinite",
        "aurora-slow": "aurora 34s ease-in-out infinite",
        float: "float 7s ease-in-out infinite",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite",
        scan: "scan 5s linear infinite",
        blink: "blink 1.1s step-end infinite",
        "rise-in": "rise-in 0.5s cubic-bezier(0.22,1,0.36,1) forwards",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
