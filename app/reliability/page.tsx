import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Reliability — VeriFlow",
  description:
    "Threat model, fail-closed rules, and the exact boundary of what VeriFlow's proofs claim.",
};

// =============================================================================
// The 30-second brief. Density is the design goal here: a judge should be able
// to answer "what stops this thing from paying the wrong vendor?" without
// scrolling twice. This is the one surface in the product where a scannable
// table beats prose.
// =============================================================================

/** The gate's refusal order, mirroring lib/mandate/enforce.ts top to bottom. */
const GATE: [string, string][] = [
  ["unknown_tool", "The tool name is not registered. Nothing dispatches on a string the gate does not know."],
  ["wrong_agent", "The tool is bound to a different agent's key, or the mandate was issued to one."],
  ["mandate_missing", "No mandate presented. No mandate means no authority — not default authority."],
  ["mandate_revoked", "The operator revoked it. Revocation is checked per call, not cached."],
  ["mandate_expired", "Outside its not-before / not-after window."],
  ["tool_not_in_mandate", "The function is not in this agent's permitted list."],
  ["scope_mismatch", "Sender, label, channel or vendor falls outside the listed scope — including when the mandate is silent on it."],
  ["cap_exceeded", "The amount is over the ceiling, or is not a usable number of cents."],
  ["approval_denied", "A human said no."],
  ["approval_timeout", "The window closed with no answer. Silence is never consent."],
];

const ASSUMED: string[] = [
  "The agent is capable and may be wrong. A well-formed payment to the wrong vendor is the failure we design against, not a garbled sentence.",
  "Model output is untrusted input. Anything Groq extracts from an invoice is treated as a claim, never as an instruction.",
  "Prompt injection reaches the model. An invoice body may contain text telling the agent to pay someone else, raise its own cap, or skip approval.",
  "The agent will try the shortest path. If a wider tool were reachable, it would eventually be reached.",
];

const CLAIMS: string[] = [
  "This tool ran with these arguments, under this mandate version, and produced this result.",
  "This action was inside its mandate at the moment it ran.",
  "A human approved or denied this step, and the answer is part of the record.",
  "This chain has not been edited since it was sealed — including its refusals.",
];

const NOT_CLAIMS: string[] = [
  "That the invoice was genuine. A convincing forgery from an allowlisted sender is still read.",
  "That the external app behaved. If Stripe settles differently afterwards, the seal does not know.",
  "That the model reasoned well. The cap, allowlist and human gate exist because it might not have.",
  "Hardware-grade key custody. The keystore is encrypted at rest and isolated, but it is a file, not an HSM.",
];

const INVARIANTS: [string, string][] = [
  [
    "Refusals return, they do not throw",
    "The gate hands back a discriminated union. A caller cannot accidentally swallow a refusal in a try/catch meant for network errors, and the compiler forces every arm to be handled.",
  ],
  [
    "Absence is refusal",
    "Every scope check refuses when the mandate is silent on that dimension. A mandate that forgot to mention vendors authorises payment to nobody.",
  ],
  [
    "Credentials load after the gate, never before",
    "Adapters are imported lazily past the allow decision, so a refused call never loads the module holding the Stripe key.",
  ],
  [
    "Agents cannot self-exit",
    "There is no tool that widens a mandate, skips a gate, or ends safe mode. The capability does not exist to be talked into.",
  ],
  [
    "The refusal is sealed too",
    "Kind, message, evidence and remedy are all inside the hash preimage. Rewriting a displayed cap from $5,000 to $50,000 breaks verification at that hop.",
  ],
  [
    "Cheap checks first",
    "Order is fixed so the operator sees the most fundamental problem. An expired mandate asking for an unlisted vendor reports expiry — fix that, then discover the vendor issue.",
  ],
];

const MODES: [string, string, string][] = [
  ["LIVE", "verdigris", "A real API round-trip. Labelled on the hop itself."],
  ["FIXTURE", "amber", "A recorded response. The adapter and the gate are identical; only the network call is skipped."],
  ["SIMULATED", "amber", "The write is suppressed. The gate still ran, and the result is never styled as a completed payment."],
];

export default function ReliabilityPage() {
  return (
    <div className="bg-ink">
      <div className="mx-auto max-w-4xl px-5 sm:px-8">
        <div className="py-7">
          <Link
            href="/about"
            className="inline-flex items-center gap-2 text-sm text-muted transition-colors hover:text-bone"
          >
            <ArrowLeft size={15} /> About VeriFlow
          </Link>
        </div>

        <header className="py-10 md:py-14">
          <p className="eyebrow mb-4">Reliability brief</p>
          <h1 className="max-w-2xl font-display text-[clamp(2rem,4.5vw,3rem)] leading-[1.06] text-bone">
            What stops this from paying the wrong vendor.
          </h1>
          <p className="mt-5 max-w-2xl leading-relaxed text-muted">
            Written to be read in under a minute. The short answer: one server-side
            gate that every tool call passes through, four agents that hold different
            credentials, and a hash chain that records the refusals as carefully as the
            successes.
          </p>
          <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
            {[
              ["Enforcement points", "1"],
              ["Agents / keys", "4"],
              ["Refusal kinds", String(GATE.length)],
              ["Tests", "105"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow">{k}</dt>
                <dd className="crypto mt-1 text-2xl tabular-nums text-bone">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="rule" />

        {/* ---- threat model ---------------------------------------------- */}
        <section className="py-14">
          <h2 className="font-display text-2xl text-bone">Threat model</h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            What we assume is true and hostile:
          </p>
          <ul className="mt-6 space-y-4">
            {ASSUMED.map((a) => (
              <li key={a} className="flex gap-4 border-t border-hairline pt-4">
                <span aria-hidden className="crypto mt-0.5 shrink-0 text-alert">
                  ×
                </span>
                <p className="max-w-2xl text-[14px] leading-relaxed text-muted">{a}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-2xl text-[14px] leading-relaxed text-bone">
            The mitigation is the same in every case: the model proposes, the mandate
            decides, and the mandate lives in code the model cannot reach.
          </p>
        </section>

        <div className="rule" />

        {/* ---- invariants ------------------------------------------------ */}
        <section className="py-14">
          <h2 className="font-display text-2xl text-bone">Fail-closed rules</h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            Six properties the codebase exists to guarantee. Each is enforced
            structurally rather than by convention.
          </p>
          <div className="mt-7 grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline sm:grid-cols-2">
            {INVARIANTS.map(([t, b]) => (
              <div key={t} className="bg-surface p-5">
                <h3 className="text-[14.5px] text-bone">{t}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{b}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="rule" />

        {/* ---- gate order ------------------------------------------------ */}
        <section className="py-14">
          <h2 className="font-display text-2xl text-bone">
            Every way a call is refused
          </h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            In the order the gate checks them. A call that reaches the bottom of this
            list is the only kind that runs.
          </p>
          <ol className="mt-7 overflow-hidden rounded-card border border-hairline">
            {GATE.map(([kind, why], i) => (
              <li
                key={kind}
                className="flex flex-col gap-1 border-b border-hairline bg-surface px-5 py-3.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-5"
              >
                <span className="crypto shrink-0 text-[11px] tabular-nums text-faint">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="crypto w-[176px] shrink-0 text-[12.5px] text-alert">
                  {kind}
                </span>
                <span className="text-[13.5px] leading-relaxed text-muted">{why}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="rule" />

        {/* ---- claims boundary ------------------------------------------- */}
        <section className="py-14">
          <h2 className="font-display text-2xl text-bone">What the proof means</h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            A proof that overstates itself is worse than no proof. The boundary,
            stated in both directions:
          </p>
          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <div className="rounded-card border border-verdigris/25 bg-verdigris/[0.04] p-5">
              <p className="eyebrow mb-4 text-verdigris">It does claim</p>
              <ul className="space-y-3">
                {CLAIMS.map((c) => (
                  <li key={c} className="flex gap-3 text-[13.5px] leading-relaxed text-muted">
                    <span aria-hidden className="mt-0.5 shrink-0 text-verdigris">
                      ●
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-card border border-alert/25 bg-alert/[0.04] p-5">
              <p className="eyebrow mb-4 text-alert">It does not claim</p>
              <ul className="space-y-3">
                {NOT_CLAIMS.map((c) => (
                  <li key={c} className="flex gap-3 text-[13.5px] leading-relaxed text-muted">
                    <span aria-hidden className="mt-0.5 shrink-0 text-alert">
                      ◑
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <div className="rule" />

        {/* ---- modes ----------------------------------------------------- */}
        <section className="py-14">
          <h2 className="font-display text-2xl text-bone">Live, recorded, simulated</h2>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            The mode is shown on the hop, not in a footnote, so a judge can always tell
            what actually happened.
          </p>
          <ul className="mt-7 space-y-px overflow-hidden rounded-card border border-hairline bg-hairline">
            {MODES.map(([badge, tone, body]) => (
              <li key={badge} className="flex flex-col gap-2 bg-surface px-5 py-4 sm:flex-row sm:items-center sm:gap-5">
                <span
                  className={`crypto w-fit shrink-0 rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                    tone === "verdigris"
                      ? "border-verdigris/40 bg-verdigris/10 text-verdigris"
                      : "border-amber/40 bg-amber/10 text-amber"
                  }`}
                >
                  {badge}
                </span>
                <span className="text-[13.5px] leading-relaxed text-muted">{body}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-2xl rounded-card border border-hairline bg-surface p-5 text-[14px] leading-relaxed text-bone">
            The invariant that holds in every mode: if the mandate would reject an
            action, nothing fakes a pass. A refused payment is never rendered as a
            successful one.
          </p>
          <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-muted">
            Which mode you get is decided by credentials, and the workspace says so
            before you run anything: each app shows its mode and the agent holding
            its key. The one asymmetry is deliberate — if an app is configured and
            the link is broken, the case fails closed with a reason rather than
            quietly serving a recorded response. Falling back there would let a real
            payment ride on evidence that was never real.
          </p>
        </section>

        <div className="rule" />

        {/* ---- evaluation ------------------------------------------------ */}
        <section className="py-14">
          <h2 className="font-display text-2xl text-bone">How it is verified</h2>
          <div className="mt-6 space-y-4 text-[14px] leading-relaxed text-muted">
            <p>
              113 tests across 32 suites, run with the platform test runner and no
              mocking framework. The suites that carry the most weight are the deny
              paths: each refusal kind is exercised against a real mandate, and the
              tamper tests edit a sealed hop and assert that verification fails at that
              exact index.
            </p>
            <p>
              Credential isolation is asserted structurally — a test proves the mail
              reader&rsquo;s tool set cannot reach the payment adapter, rather than
              trusting a comment that says so.
            </p>
            <p className="text-bone">
              Three demo invoices exercise three different rules: one pays, one breaks
              the cap, one breaks the vendor allowlist. Because none of them is
              special-cased, a change that weakened the gate would show up as a passing
              payment on a case that should have stopped.
            </p>
          </div>
          <Link
            href="/"
            className="group mt-8 inline-flex items-center gap-2 rounded-card bg-gold px-5 py-2.5 text-sm font-medium text-ink transition-transform hover:scale-[1.02]"
          >
            See it run
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </section>

        <div className="h-16" />
      </div>
    </div>
  );
}
