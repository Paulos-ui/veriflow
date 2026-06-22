"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  MotionValue,
} from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Seal } from "@/components/Seal";

const STEPS = [
  {
    k: "01",
    title: "Identity",
    body: "Every agent is provisioned with a verifiable identity on Terminal 3 — a did:t3n it cannot forge or self-issue.",
  },
  {
    k: "02",
    title: "Mandate",
    body: "You issue a signed, revocable delegation credential: a spending ceiling, allowed vendors, an expiry. Authority is explicit and bounded.",
  },
  {
    k: "03",
    title: "Reasoning",
    body: "Faced with an invoice, the agent reasons with Groq and produces a structured verdict — checked against its mandate by a deterministic guardrail.",
  },
  {
    k: "04",
    title: "Attestation",
    body: "Approved actions execute inside a TEE. Terminal 3 returns a hardware-attested, host-stamped proof — who acted, under which credential, with what outcome.",
  },
];

const FEATURES = [
  ["Verifiable identity", "No parallel identity system. Governance, audit, and attestation are Terminal 3's."],
  ["Bounded mandates", "Delegation credentials cap spend, scope vendors, and expire — revocable at any time."],
  ["Visible reasoning", "The agent's decision, confidence, and flags are shown, not hidden behind a black box."],
  ["Unforgeable proof", "TDX quote verification plus host-stamped audit events the agent cannot fake."],
];

function Reveal({
  children,
  progress,
  range,
}: {
  children: React.ReactNode;
  progress: MotionValue<number>;
  range: [number, number];
}) {
  const opacity = useTransform(progress, range, [0, 1]);
  const y = useTransform(progress, range, [40, 0]);
  return (
    <motion.div style={{ opacity, y }}>{children}</motion.div>
  );
}

export default function AboutPage() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [sealState, setSealState] = useState<"pending" | "verifying" | "verified">("pending");

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setSealState(v < 0.35 ? "pending" : v < 0.72 ? "verifying" : "verified");
  });

  const bgShift = useTransform(scrollYProgress, [0, 1], [0, -120]);

  return (
    <div ref={ref} className="relative bg-ink">
      {/* ambient parallax field */}
      <motion.div
        aria-hidden
        style={{ y: bgShift }}
        className="pointer-events-none fixed inset-0 opacity-[0.05]"
      >
        <div className="absolute left-1/4 top-1/3 h-px w-1/2 bg-bone" />
        <div className="absolute left-1/3 top-2/3 h-px w-1/3 bg-bone" />
      </motion.div>

      <div className="relative z-10 mx-auto max-w-3xl px-6">
        <div className="py-8">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted hover:text-bone">
            <ArrowLeft size={15} /> Back to app
          </Link>
        </div>

        {/* Hero */}
        <section className="flex min-h-[78vh] flex-col justify-center">
          <p className="eyebrow mb-5">VeriFlow · about the project</p>
          <h1 className="font-display text-5xl leading-[1.05] text-bone sm:text-6xl">
            Autonomous agents,<br />
            <span className="text-verdigris">provably bounded.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            VeriFlow gives AI agents a cryptographic identity and a scoped mandate, then
            proves every action they take in hardware. Trust the agent because you can
            verify it — not because you hope it behaved.
          </p>
        </section>

        {/* Sticky seal + steps */}
        <section className="relative grid gap-16 py-24 md:grid-cols-[1fr_320px]">
          <div className="space-y-28">
            <div>
              <p className="eyebrow mb-3">The problem</p>
              <h2 className="font-display text-3xl text-bone">
                An agent that can pay invoices is an agent that can lose you money.
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                Hand a model a wallet and you inherit its mistakes with no recourse and no record.
                The fix isn&rsquo;t to trust harder — it&rsquo;s to make authority explicit, bounded,
                and every action provable after the fact.
              </p>
            </div>

            {STEPS.map((s, i) => (
              <Reveal
                key={s.k}
                progress={scrollYProgress}
                range={[0.15 + i * 0.13, 0.32 + i * 0.13]}
              >
                <div className="border-l border-verdigris/30 pl-6">
                  <span className="crypto text-[12px] text-verdigris">{s.k}</span>
                  <h3 className="mt-1 font-display text-2xl text-bone">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <div className="hidden md:block">
            <div className="sticky top-[40vh] flex flex-col items-center">
              <Seal state={sealState} size={120} />
              <p className="mt-5 font-mono text-[11px] uppercase tracking-eyebrow text-muted">
                {sealState === "verified" ? "attested" : sealState === "verifying" ? "verifying" : "unverified"}
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="py-20">
          <p className="eyebrow mb-8">What makes it different</p>
          <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2">
            {FEATURES.map(([title, body]) => (
              <div key={title} className="bg-surface p-7">
                <h3 className="font-display text-xl text-bone">{title}</h3>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* User guide */}
        <section className="py-20">
          <p className="eyebrow mb-8">How to use it</p>
          <ol className="space-y-6">
            {[
              ["Provision an agent", "Create an agent and it receives a Terminal 3 identity. It has no authority yet."],
              ["Issue a mandate", "Grant a scoped delegation: a ceiling, allowed vendors, an expiry. Revoke any time."],
              ["Run a workflow", "Hand the agent an invoice. It reasons, decides, and — if within mandate — executes."],
              ["Read the proof", "Every approved action returns a TEE attestation and an audit entry you can verify."],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-5">
                <span className="crypto mt-1 text-verdigris">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="text-lg text-bone">{t}</h3>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col items-center gap-6 py-28 text-center">
          <Seal state="verified" size={88} />
          <h2 className="font-display text-3xl text-bone">Provision your first agent</h2>
          <Link
            href="/agents/new"
            className="rounded-card bg-bone px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-white"
          >
            Get started
          </Link>
        </section>
      </div>
    </div>
  );
}
