# VeriFlow

**A control plane for specialist AI agents.** Four agents run one real case across
Gmail, Slack and Stripe under signed, scoped mandates. Every tool call is checked
on the server before it runs, and every hop — including the refused ones — is
sealed into a hash chain you can verify afterwards.

Built for the Virtual Multi-App AI Agent Hackathon. Terminal 3 is the trust
layer, not one of the three apps.

---

## The claim

Agent frameworks solved capability. They did not solve delegation. An agent that
can read your mail, post to your team and move your money is four permissions
away from being an insider threat, and the usual answer is a system prompt asking
it to behave. Prompts are requests, evaluated by the same model you are trying to
constrain.

VeriFlow makes authority the object of the system: written down, signed, narrow,
and enforced by code the agent cannot reach. **The model proposes; the mandate
decides.**

## The case

One AP-clerk workflow, six hops, four agents, three apps:

```
ingest ──► plan ──► human gate ──► pay ──► notify ──► proof
Ferris     Atlas     Harbor        Sterling  Harbor    Atlas
Gmail       —        Slack         Stripe    Slack      —
```

| Agent | Role | Holds | Cannot |
|---|---|---|---|
| **Atlas** | `orchestrator` | nothing | mail, post, or pay |
| **Ferris** | `mail.reader` | Google credentials | post or pay |
| **Harbor** | `comms.poster` | Slack bot token | read mail or pay |
| **Sterling** | `pay.clerk` | Stripe key | read mail or post |

Four agents, four delegatee keys. "The mail reader cannot pay" is enforced by the
gate comparing keys, not by anyone remembering not to call the wrong function.

## Reliability

This is the part that matters, and there is a brief for it at **`/reliability`**.
In short:

- **One gate.** Every tool call passes through `lib/mandate/enforce.ts`. A call
  not ruled on there never leaves the server.
- **Refusals return, they do not throw.** The gate hands back a discriminated
  union, so a refusal cannot be swallowed by a `catch` meant for network errors.
- **Absence is refusal.** A mandate silent on vendors authorises payment to
  nobody. Silence is never read as permission.
- **Credentials load after the gate.** Adapters are imported lazily past the
  allow decision, so a refused call never loads the module holding the Stripe key.
- **Agents cannot self-exit.** No tool widens a mandate, skips a gate, or ends
  safe mode. The capability does not exist to be talked into.
- **The refusal is sealed too.** Kind, message, evidence and remedy are inside
  the hash preimage — rewriting a displayed cap from $5,000 to $50,000 breaks
  verification at that hop.

The default mandate is deliberately tight: three allowlisted senders, one Slack
channel, two vendors, a $5,000.00 cap, 24-hour expiry. The three demo invoices
each fail a different rule, and none of them is special-cased:

| Invoice | Amount | Outcome | Rule |
|---|---|---|---|
| Aurora Systems | $4,820.00 | pays | inside every rule |
| Meridian Supply | $18,000.00 | refused | over the $5,000.00 cap |
| Halcyon Logistics | $2,400.00 | refused | vendor not allowlisted (under cap, so the refusal is unambiguously scope) |

## Setup

Node 20+ required.

```bash
npm install
cp .env.example .env.local     # optional — the demo runs with no keys at all
npm run dev
```

Then open <http://localhost:3000>.

**It runs with zero credentials.** Each adapter decides live vs recorded by
whether its own credentials are present, and labels the hop accordingly:

| Badge | Meaning |
|---|---|
| `LIVE` | a real API round-trip |
| `FIXTURE` | a recorded response; adapter and gate are identical, only the network call is skipped |
| `SIMULATED` | the write is suppressed; the gate still ran |

A `SIMULATED` payment is never styled as a completed one.

### Environment

All server-only. Nothing here reaches the client.

| Variable | Purpose |
|---|---|
| `T3N_API_KEY` | Terminal 3 operator ETH secret key (`0x` + 64 hex) |
| `T3N_OPERATOR_DID` | the `did:t3n` derived from that key |
| `T3N_MODE` | `mock` (default) or `live` |
| `T3N_ENV` | `testnet` |
| `VERIFLOW_KEK` | 32-byte key encrypting agent private keys at rest — `openssl rand -hex 32` |
| `GROQ_API_KEY` | invoice extraction; omit to use the heuristic fallback |
| `GROQ_MODEL` | defaults to `llama-3.3-70b-versatile` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` | live Gmail reads; omit for fixtures |
| `SLACK_BOT_TOKEN` | live Slack posts; omit to simulate |
| `STRIPE_SECRET_KEY` | live (test-mode) charges; omit to simulate |

Use a Stripe **test-mode** key. Nothing about the gate changes between test and
live, which is the point — but there is no reason to move real money to prove it.

## The two-minute demo

1. **Open `/`.** The roster shows all four agents with their mandate chips —
   allowed functions, cap, expiry, scope. Point out that Atlas's function list is
   *empty*: the orchestrator holds no external reach at all. (~20s)
2. **Run Aurora Systems.** Pick the Aurora invoice, leave the Slack outcome on
   *approve*, and start it. The timeline fills hop by hop as the case crosses
   Gmail → Slack → Stripe; the ring narrows with it and goes still when the chain
   seals. Click the pay hop to show the proof: agent, tool, argument hash, result
   hash, mandate version. (~45s)
3. **Run Meridian Supply.** Same mandate, same code path. It halts at the pay hop.
   The why-blocked panel shows `$5,000.00` beside `$18,000.00` and states what
   would have to change. Note that the timeline still renders *notify* and *proof*
   as never-reached rather than quietly ending. (~35s)
4. **Run Halcyon Logistics with Slack set to deny.** A second, different deny
   path: a human said no, and the refusal is on the record with its own hash. (~20s)
5. **Open `/reliability`.** The threat model, the full refusal order, and the
   boundary of what the proof does and does not claim. (~10s)

The one line worth saying out loud: *a blocked case is evidence, not an error.*

## Stack

Next.js 15 App Router · React 19 · TypeScript (strict) · Tailwind 3.4.17 ·
Framer Motion · Zustand · Zod · Groq · `@terminal3/t3n-sdk`.

> **Tailwind is pinned to 3.4.17 deliberately.** v4 relocates the PostCSS plugin
> and breaks this config. Do not bump it.

Terminal 3 and Groq are server-only; the T3 SDK loads a WASM component, so every
route touching it exports `runtime = "nodejs"`.

## Design

"The Seal" — see [`design-system/veriflow/MASTER.md`](design-system/veriflow/MASTER.md),
which is authoritative. Warm bone on deep ink; **verdigris** verified, **amber**
awaiting, **signal** violet identity, **terracotta** refused, **gold** the seal's
metal and never a state. Fraunces for display, Geist for UI, Geist Mono for
hashes and DIDs.

One motion idea: **authority narrowing.** An ungoverned agent is wide, open and
drifting; each rule that binds contracts the ring; a fully-bound agent is tight,
closed and still. Stillness is the success signal. A refused ring locks
mid-contraction and never closes. The same primitive is driven by scroll on
`/about` and by hop progress in the live timeline.

## Verify it

```bash
npm run typecheck    # tsc --noEmit, strict
npm test             # node --test, no mocking framework
npm run build
```

The suites that carry the weight are the deny paths — each refusal kind is
exercised against a real mandate — and the tamper tests, which edit a sealed hop
and assert verification fails at that exact index. Credential isolation is
asserted structurally rather than trusted to a comment.

## Honest notes

- The proof shows an action stayed inside its mandate. It does **not** prove the
  invoice was legitimate; a convincing forgery from an allowlisted sender is
  still read.
- It attests what this system did, not what the external app did afterwards.
- The keystore is file-backed (`.data/`, gitignored) and encrypted at rest. It is
  isolated, but it is a file, not an HSM. Serverless filesystems are ephemeral —
  wire a database-backed store before any non-demo use.
- Terminal 3 credential issuance is real local crypto: keygen, encryption,
  credential build, operator signature, and signature recovery are all verified.
  Live node round-trips are wired and type-correct but runtime-unverified without
  a deployed node.
- The Groq extraction step can misread an invoice. The cap, the allowlist and the
  human gate sit downstream of it for exactly that reason.

## Deploy

Vercel. Set the environment variables above in project settings; the build needs
network access to Google Fonts (standard for `next/font/google`). Case and proof
persistence uses a file store under `.data/`, which does not survive a serverless
cold start — fine for the demo, replace it with a database for anything real.
