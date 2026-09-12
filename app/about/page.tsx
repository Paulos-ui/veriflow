import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";
import { AuthorityRing } from "@/components/seal/AuthorityRing";
import { AuthorityNarrowing } from "@/components/about/AuthorityNarrowing";
import { CaseWalkthrough } from "@/components/about/CaseWalkthrough";
import { ROSTER, type AgentRole } from "@/lib/agents/roster";

export const metadata: Metadata = {
  title: "About — VeriFlow",
  description:
    "A control plane for specialist AI agents: scoped mandates, server-side enforcement, and a hash-chained proof for every hop across Gmail, Slack and Stripe.",
};

const ORDER: AgentRole[] = ["orchestrator", "mail.reader", "comms.poster", "pay.clerk"];

/** What each agent is trusted with — and pointedly, what it is not. */
const HOLDS: Record<AgentRole, { holds: string; cannot: string }> = {
  orchestrator: { holds: "Nothing", cannot: "Cannot mail, post, or pay" },
  "mail.reader": { holds: "Google credentials", cannot: "Cannot post or pay" },
  "comms.poster": { holds: "Slack bot token", cannot: "Cannot read mail or pay" },
  "pay.clerk": { holds: "Stripe key", cannot: "Cannot read mail or post" },
};

const REFUSALS = [
  {
    vendor: "Aurora Systems",
    amount: "$4,820.00",
    outcome: "Pays" as const,
    why: "On the vendor allowlist, under the $5,000.00 cap, approved in the channel. Every rule satisfied, so the money moves and the chain seals.",
  },
  {
    vendor: "Meridian Supply",
    amount: "$18,000.00",
    outcome: "Refused" as const,
    why: "An allowlisted vendor, but $18,000.00 against a $5,000.00 cap. The chain stops at the pay hop and the refusal is sealed with both numbers in it.",
  },
  {
    vendor: "Halcyon Logistics",
    amount: "$2,400.00",
    outcome: "Refused" as const,
    why: "Well under the cap — deliberately — so the refusal can only be about scope. Halcyon is not on the vendor allowlist, and a mandate silent on a vendor authorises nothing.",
  },
];

const FEATURES: [string, string][] = [
  [
    "One gate, no bypass",
    "Every tool call routes through a single enforcement function. A refusal is a returned value, not a thrown exception, so it cannot be swallowed by a catch block.",
  ],
  [
    "Credentials split by principal",
    "Four agents, four keys. The mail reader has no payment credential to misuse, which is a stronger claim than asking it politely not to.",
  ],
  [
    "Fail closed by absence",
    "A mandate that says nothing about vendors permits no vendor. Silence is never read as permission.",
  ],
  [
    "Tamper-evident refusals",
    "The reason a chain stopped is hashed into the seal alongside the evidence. Rewriting a cap from $5,000 to $50,000 breaks verification.",
  ],
  [
    "Human approval on the record",
    "The approval is not a UI state — it is a hop with a hash. No reply means no payment.",
  ],
  [
    "Live and recorded are labelled",
    "Each hop says whether it hit a real API, replayed a fixture, or ran with writes suppressed. A simulated payment is never styled as a completed one.",
  ],
];

const LIMITS = [
  "The proof shows that an action stayed inside its mandate. It does not prove the invoice was legitimate — a convincing forgery from an allowlisted sender would still be read.",
  "It attests what this system did, not what the external app did afterwards. If Stripe settles differently, the seal does not know.",
  "The keystore is file-backed and intended for the demo. It is isolated and encrypted at rest, but it is not an HSM.",
  "Fixture mode replays recorded API responses. The adapters and the mandate gate are identical in both modes — only the network call is skipped.",
  "The Groq extraction step can misread an invoice. That is why the cap, the allowlist and the human gate sit downstream of it: the model proposes, the mandate decides.",
];

export default function AboutPage() {
  return (
    <div className="relative bg-ink">
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="py-7">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-bone"
          >
            <ArrowLeft size={15} /> Back to the workspace
          </Link>
        </div>

        {/* ---- vision ---------------------------------------------------- */}
        <section className="grid items-center gap-12 py-16 md:grid-cols-[1fr_200px] md:py-24">
          <div>
            <p className="eyebrow mb-5">VeriFlow · a control plane for agents</p>
            <h1 className="max-w-2xl font-display text-[clamp(2.4rem,6vw,4rem)] leading-[1.03] text-bone">
              Give an agent a wallet and you inherit its mistakes.
              <span className="block text-verdigris">
                Give it a mandate and you inherit a record.
              </span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
              VeriFlow runs specialist agents across Gmail, Slack and Stripe under
              signed, scoped delegations. Every hop is checked on the server before it
              runs, and every hop — including the ones that were refused — is sealed
              into a hash chain you can verify afterwards.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/"
                className="group inline-flex items-center gap-2 rounded-card bg-gold px-5 py-2.5 text-sm font-medium text-ink transition-transform hover:scale-[1.02]"
              >
                Run a case
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="/reliability"
                className="inline-flex items-center gap-2 rounded-card border border-hairline px-5 py-2.5 text-sm text-muted transition-colors hover:border-gold/30 hover:text-gold"
              >
                <ShieldCheck size={15} /> Reliability brief
              </Link>
            </div>
          </div>

          {/* The unbounded agent: wide, open, drifting. The problem, drawn. */}
          <div className="hidden justify-self-center md:block">
            <AuthorityRing narrowing={0} state="awaiting" boundRules={0} size={196} />
            <p className="crypto mt-4 text-center text-[11px] text-faint">
              no mandate
            </p>
          </div>
        </section>

        <div className="rule" />

        {/* ---- problem --------------------------------------------------- */}
        <section className="max-w-2xl py-20 md:py-28">
          <p className="eyebrow mb-3">The problem</p>
          <h2 className="font-display text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.12] text-bone">
            Agent frameworks solved capability. They did not solve delegation.
          </h2>
          <div className="mt-6 space-y-5 leading-relaxed text-muted">
            <p>
              An agent that can read your mail, post to your team, and move your money
              is four permissions away from being an insider threat — and the usual
              answer is a system prompt asking it to behave. Prompts are not
              boundaries. They are requests, evaluated by the same model you are trying
              to constrain.
            </p>
            <p>
              The failure that matters is not a hallucinated sentence. It is a
              plausible, well-formed payment to the wrong vendor, executed at three in
              the morning, with nothing to show afterwards but a chat log. You cannot
              audit intent. You can only audit authority.
            </p>
            <p className="text-bone">
              So VeriFlow makes authority the object of the system: written down,
              signed, narrow, and checked by code that the agent does not get to
              influence.
            </p>
          </div>
        </section>

        {/* ---- the mechanic, scroll-driven ------------------------------- */}
        <AuthorityNarrowing />

        <div className="rule" />

        {/* ---- the case, scroll-driven ----------------------------------- */}
        <CaseWalkthrough />

        <div className="rule" />

        {/* ---- architecture ---------------------------------------------- */}
        <section className="py-20 md:py-28">
          <p className="eyebrow mb-3">Architecture</p>
          <h2 className="max-w-2xl font-display text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.12] text-bone">
            Four principals, four keys. Separation is structural, not procedural.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-muted">
            Each agent holds its own delegatee key and its own credentials. &ldquo;The
            mail reader cannot pay&rdquo; is enforced by the gate comparing keys — not
            by anyone remembering not to call the wrong function.
          </p>

          <div className="mt-10 grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2">
            {ORDER.map((role) => {
              const agent = ROSTER[role];
              const { holds, cannot } = HOLDS[role];
              return (
                <div key={role} className="bg-surface p-6">
                  <div className="flex items-baseline gap-2.5">
                    <h3 className="font-display text-xl text-bone">{agent.name}</h3>
                    <span className="crypto text-[11px] text-identity">{role}</span>
                  </div>
                  <p className="mt-2.5 text-[14px] leading-relaxed text-muted">
                    {agent.charter}
                  </p>
                  <dl className="mt-4 space-y-1.5 border-t border-hairline pt-3.5">
                    <div className="flex gap-2 text-[12px]">
                      <dt className="crypto shrink-0 text-faint">holds</dt>
                      <dd className="crypto text-bone">{holds}</dd>
                    </div>
                    <div className="flex gap-2 text-[12px]">
                      <dt className="crypto shrink-0 text-faint">bound</dt>
                      <dd className="crypto text-alert">{cannot}</dd>
                    </div>
                  </dl>
                </div>
              );
            })}
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {[
              [
                "Enforcement",
                "One gate function every tool passes through. Refusals are returned values with evidence attached, and the credential-holding adapter is only imported after the gate allows the call.",
              ],
              [
                "Trust layer",
                "Terminal 3 signs identities and delegation credentials. It is not one of the three apps — it is what makes the other three accountable.",
              ],
              [
                "Proof",
                "Each hop hashes its arguments and results and carries the previous hop's hash. Editing any hop invalidates every hop after it.",
              ],
            ].map(([t, b]) => (
              <div key={t} className="border-t border-hairline pt-4">
                <h3 className="text-[15px] text-bone">{t}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{b}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="rule" />

        {/* ---- deny paths ------------------------------------------------ */}
        <section className="py-20 md:py-28">
          <p className="eyebrow mb-3">Three invoices, three outcomes</p>
          <h2 className="max-w-2xl font-display text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.12] text-bone">
            The refusals are not error handling. They are the product working.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-muted">
            None of these outcomes is special-cased. Each is a consequence of the same
            allowlists and the same $5,000.00 cap, so each invoice fails a different
            rule.
          </p>

          <ul className="mt-10 space-y-px overflow-hidden rounded-card border border-hairline bg-hairline">
            {REFUSALS.map((r) => {
              const paid = r.outcome === "Pays";
              return (
                <li key={r.vendor} className="bg-surface p-6">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
                    <span
                      aria-hidden
                      className={`text-[13px] ${paid ? "text-verdigris" : "text-alert"}`}
                    >
                      {paid ? "●" : "◑"}
                    </span>
                    <h3 className="text-[15px] text-bone">{r.vendor}</h3>
                    <span className="crypto text-[13px] tabular-nums text-muted">
                      {r.amount}
                    </span>
                    <span
                      className={`crypto rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                        paid
                          ? "border-verdigris/40 bg-verdigris/10 text-verdigris"
                          : "border-alert/40 bg-alert/10 text-alert"
                      }`}
                    >
                      {r.outcome}
                    </span>
                  </div>
                  <p className="mt-2.5 max-w-2xl text-[14px] leading-relaxed text-muted">
                    {r.why}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="rule" />

        {/* ---- user guide ------------------------------------------------ */}
        <section className="py-20 md:py-28">
          <p className="eyebrow mb-3">Using it</p>
          <h2 className="max-w-2xl font-display text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.12] text-bone">
            Four steps, about two minutes.
          </h2>

          <ol className="mt-10 grid gap-8 sm:grid-cols-2">
            {[
              [
                "Open the workspace",
                "The roster shows all four agents with their mandate chips: allowed functions, cap, expiry, and scope. Read them as bounds, not as budgets.",
              ],
              [
                "Pick an invoice",
                "Three are provided, each landing on a different rule. Choose the Slack outcome too — approve, deny, or stay silent — because silence is its own deny path.",
              ],
              [
                "Watch the hops",
                "The timeline fills in as the case crosses Gmail, Slack and Stripe. The ring narrows with it, and stops moving when the chain seals.",
              ],
              [
                "Open a hop",
                "Click any hop for its proof: agent, tool, argument hash, result hash, mandate version. On a refusal you get the cap beside the amount, and what would have to change.",
              ],
            ].map(([t, b], i) => (
              <li key={t} className="flex gap-5">
                <span className="crypto mt-0.5 shrink-0 text-verdigris">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-[15px] text-bone">{t}</h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{b}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="rule" />

        {/* ---- features -------------------------------------------------- */}
        <section className="py-20 md:py-28">
          <p className="eyebrow mb-3">What is actually built</p>
          <h2 className="max-w-2xl font-display text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.12] text-bone">
            Reliability is the feature.
          </h2>
          <div className="mt-10 grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(([title, body]) => (
              <div key={title} className="bg-surface p-6">
                <h3 className="text-[15px] text-bone">{title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="rule" />

        {/* ---- limitations ----------------------------------------------- */}
        <section className="py-20 md:py-28">
          <p className="eyebrow mb-3">Limitations</p>
          <h2 className="max-w-2xl font-display text-[clamp(1.8rem,3.6vw,2.6rem)] leading-[1.12] text-bone">
            What the proof does not claim.
          </h2>
          <p className="mt-5 max-w-2xl leading-relaxed text-muted">
            A proof that overstates itself is worse than no proof, so here is the
            boundary, plainly.
          </p>
          <ul className="mt-9 max-w-3xl space-y-5">
            {LIMITS.map((l) => (
              <li key={l} className="flex gap-4 border-t border-hairline pt-4">
                <span aria-hidden className="mt-1 shrink-0 text-amber">
                  ◌
                </span>
                <p className="text-[14px] leading-relaxed text-muted">{l}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-2xl text-[14px] leading-relaxed text-bone">
            The one invariant that holds without qualification: if the mandate would
            reject an action, no mode fakes a pass.
          </p>
        </section>

        {/* ---- close ----------------------------------------------------- */}
        <section className="flex flex-col items-center gap-7 py-24 text-center md:py-32">
          <AuthorityRing narrowing={1} state="verified" boundRules={4} size={104} />
          <h2 className="max-w-lg font-display text-[clamp(1.6rem,3vw,2.2rem)] leading-tight text-bone">
            Watch one case cross three apps.
          </h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/"
              className="rounded-card bg-bone px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-white"
            >
              Open the workspace
            </Link>
            <Link
              href="/reliability"
              className="rounded-card border border-hairline px-5 py-2.5 text-sm text-muted transition-colors hover:border-gold/30 hover:text-gold"
            >
              Read the reliability brief
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
