# VeriFlow

**A control plane for specialist AI agents.** Four agents run one real case across
Gmail, Slack and Stripe under signed, scoped mandates. Every tool call is checked
on the server before it runs, and every hop including the refused ones is
sealed into a hash chain you can verify afterwards.

Built for the Virtual Multi-App AI Agent Hackathon. Terminal 3 is the trust
layer, not one of the three apps.
### 🎥 [Watch the VeriFlow Demo](https://drive.google.com/file/d/1Vi1fPuu3OkPQ0ury6LGA7LV2gknhyMNi/view?usp=sharing)
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

The workspace opens with a **connection row** — Gmail, Slack, Stripe, each with
the agent that holds its credential and a `LIVE` or `FIXTURE` badge. It reads the
same resolution the adapters use, so the row cannot claim a link the run will not
actually take.

### Connecting the apps

Every app is optional and independent. Connect one, two, or all three.

**Gmail** — create an OAuth 2.0 Client ID (Web application) in Google Cloud
Console, enable the Gmail API, and register the callback for each origin you run
on: `http://localhost:3000/api/gmail/callback` and
`https://<your-deployment>/api/gmail/callback`. Set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`, then click **Connect Gmail** on the workspace. The
refresh token is exchanged and stored server-side; the browser only ever receives
a redirect. The scope requested is `gmail.readonly` — there is no code path here
that sends, deletes, or labels.

The stored token lives on the instance disk, so on Vercel it is lost on a cold
start. For a connection that survives restarts, put the refresh token in
`GOOGLE_REFRESH_TOKEN` instead; env always wins.

If an OAuth app is configured and the link is missing or rejected, the case
**fails closed** — `adapter_unavailable`, with the reason and a remedy on the
record. It does not fall back to a fixture, because a recorded invoice must never
be the evidence a real payment rides on. With no OAuth app configured at all,
fixtures are the documented zero-credential demo and are badged as such.

**Slack** — a bot token with `chat:write`, `channels:history` and
`reactions:read`, invited to the channel named in `SLACK_CHANNEL_ID`. The human
gate is a reaction on the proposal message: ✅ approves, ❌ denies, and silence is
not consent — the window closes and the payment is refused. That channel id is
injected into the comms poster's mandate *and* into the call, so the allowlist and
the destination cannot drift apart.

**Stripe** — a test-mode secret key. The vendor allowlist and the cap are enforced
by the gate *before* the adapter loads, so a refused payment never reaches Stripe
at all.

Slack and Stripe have no Connect button, because they have no user-consent flow.
They are configured by environment variable or not at all, and the row says which.

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
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | the OAuth app behind **Connect Gmail** |
| `GOOGLE_REFRESH_TOKEN` | a Gmail link that survives restarts; takes priority over the stored one |
| `GOOGLE_ACCOUNT_EMAIL` | cosmetic — the mailbox name shown on the connection row |
| `SLACK_BOT_TOKEN` | live Slack posts; omit to simulate |
| `SLACK_CHANNEL_ID` | the one channel the poster may use; also the mandate's allowlist |
| `STRIPE_SECRET_KEY` | live (test-mode) charges; omit to simulate |
| `VERIFLOW_DATA_DIR` | where the JSON shelves are written; see [Reliability](#reliability) |

Use a Stripe **test-mode** key. Nothing about the gate changes between test and
live, which is the point — but there is no reason to move real money to prove it.

## The two-minute demo

1. **Open `/`.** The connection row states, per app, whether this run is `LIVE` or
   `FIXTURE` and which agent holds the credential — say out loud which ones are
   live today. The roster below shows all four agents with their mandate chips:
   allowed functions, cap, expiry, scope. Point out that Atlas's function list is
   *empty* — the orchestrator holds no external reach at all. (~25s)
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
- The keystore is file-backed and encrypted at rest, in its own file under the
  storage root with no reader shared with the case shelf. It is isolated, but it
  is a file, not an HSM. Serverless filesystems are ephemeral — wire a
  database-backed store before any non-demo use.
- Terminal 3 credential issuance is real local crypto: keygen, encryption,
  credential build, operator signature, and signature recovery are all verified.
  Live node round-trips are wired and type-correct but runtime-unverified without
  a deployed node.
- The Groq extraction step can misread an invoice. The cap, the allowlist and the
  human gate sit downstream of it for exactly that reason.

## Deploy

Vercel. Set the environment variables above in project settings; the build needs
network access to Google Fonts (standard for `next/font/google`).

Where VeriFlow writes is resolved in exactly one place
([`lib/storage/root.ts`](lib/storage/root.ts)): `VERIFLOW_DATA_DIR` if set,
otherwise `/tmp/veriflow` on a serverless host, otherwise `./.data`. The
deployment bundle at `/var/task` is read-only, and writing there is what used to
kill the case before hop one — `tests/deploy.test.ts` now asserts it cannot come
back. If even `/tmp` refuses, the stores degrade to memory for that instance and
say so in the logs rather than throwing.

`/tmp` is per-instance and does not survive a cold start. That is fine for a
demo, and it is stated rather than hidden: the connection row re-reads state on
every load, so a lapsed Gmail link shows as not connected instead of being
claimed. Point `VERIFLOW_DATA_DIR` at a mounted volume, or swap in a database,
for anything that needs to outlive the box.
