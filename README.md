# VeriFlow

**A control plane for specialist AI agents.** Agents run real cases across Gmail,
Slack, Stripe, GitHub, Telegram, Notion and Solana devnet under signed, scoped
mandates. Every tool call is checked on the server before it runs, and every hop —
including the refused ones — is sealed into a hash chain you can verify afterwards.

There are two flows on the same machinery. The **AP case** pays an invoice. The
**Arena** takes something anyone can forge — a tic-tac-toe log, a spreadsheet —
verifies it deterministically, and carries the result to four apps that have never
heard of each other.

Built for the Virtual Multi-App AI Agent Hackathon. Terminal 3 is the trust
layer, not one of the apps.

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

## The Arena

The AP case answers "can an agent be stopped?". The Arena answers the question
underneath it: **how do you know the thing it acted on was true?**

Submit a finished tic-tac-toe game at **`/arena`** or a CSV at **`/verify`** and
the same eight-hop spine runs:

```
observe ─► verify ─► plan ─► record ─► signal ─► archive ─► anchor ─► seal
Atlas      Atlas     Atlas   Quill     Beacon    Folio      Cairn     Atlas
 —         —          —      GitHub    Telegram  Notion     Solana     —
```

| Agent | Role | Holds | Writes |
|---|---|---|---|
| **Quill** | `repo.scribe` | GitHub token | one issue, one allowlisted repo |
| **Beacon** | `signal.courier` | Telegram bot token | one message, one allowlisted chat |
| **Folio** | `ledger.archivist` | Notion key | one entry, one allowlisted database |
| **Cairn** | `chain.notary` | devnet keypair | one SPL memo, devnet only |

What makes it a verification story rather than a demo:

- **`verify` is deterministic.** A game is replayed from an empty board — turn
  order, occupied squares, moves after the win. A CSV is profiled column by
  column: type, fill rate, distinct count, median, median absolute deviation,
  range. Findings carry the row numbers behind them. **No model produces a
  verdict.**
- **`plan` may narrow, never widen.** The permitted action set is fixed before
  the model is asked. The model may drop an action it thinks is unwarranted and
  must say why; anything outside the set makes the plan fall back to the
  deterministic one, and the case records that it fell back.
- **The model's disagreement is kept.** If its account conflicts with the
  engine's findings, both are shown, side by side, marked.
- **The four writes are independent.** A refusal at `record` is recorded and the
  run continues to `signal` — one integration failing does not erase three that
  confirmed. In the AP spine a refusal halts; in the Arena spine it does not.
  That difference is one field on the spine, not a branch in the runner.
- **Unconfigured is not failed.** An integration with no credential is planned
  as `skipped` with a plain reason, and the case ends `partial`. It is never
  reported as succeeded, and nothing is faked to make the demo look complete.

**`/activity`** lists every sealed run and re-verifies the hash chain on read. A
broken chain is reported with the index of the hop that broke it, above the
report rather than below it.

### The Arena's deny paths

The three worth showing, none of them special-cased:

| Try this | Outcome |
|---|---|
| Submit a tampered log (the Arena has a button for it) | `verify` refuses and names the move it rejected — nothing is written anywhere |
| `SOLANA_NETWORK=mainnet-beta` | scope refusal at the gate; the adapter never loads. A mainnet RPC URL is refused a second time inside the adapter |
| Leave a block of `.env.local` empty | that action is `skipped`, the reason is on the report, and the case ends `partial` |


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

Every app is optional and independent. Connect none of them, some of them, or all
seven — nothing here is a prerequisite for anything else.

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

### Connecting the Arena's apps

Same rule: each is optional, each is independent, and each needs **both** halves —
a credential with no destination has nowhere to write, and a destination with no
credential cannot write. The board on `/arena` reports which four are live, read
from the same resolver the run uses.

**GitHub** — a fine-grained personal access token
([settings](https://github.com/settings/personal-access-tokens)) scoped to one
repository with *Issues: Read and write*. Nothing here needs repo-wide or org-wide
access; a classic `repo` token grants far more than this agent's mandate lets it
use. Set `GITHUB_OWNER` and `GITHUB_REPO` to a repository you own — they are read
in one place and injected into both the mandate's allowlist and the call, so they
cannot drift apart.

**Telegram** — create a bot with [@BotFather](https://t.me/botfather). Message the
bot, then read the chat id from
`https://api.telegram.org/bot<TOKEN>/getUpdates`. For a group, add the bot first;
group ids are negative. Use the id, not the `@username`.

**Notion** — an internal integration secret from
[notion.so/my-integrations](https://www.notion.so/my-integrations), then **share
the target database with that integration** or every write returns 404. The
adapter reads the database's real schema before writing and fills only columns
that exist, matching on name (`outcome`/`result`/`status`, `findings`/`anomalies`,
`severity`/`level`, `proof`/`hash`). Anything unmatched goes into the page body.
A database with nothing but a title still works — it records less and says so. No
property name is assumed.

**Solana** — devnet only. Generate a throwaway keypair and fund it:

```bash
solana-keygen new --no-bip39-passphrase -o veriflow-devnet.json
solana airdrop 1 <address> --url https://api.devnet.solana.com
```

Put the file's contents (the 64-number JSON array) in `SOLANA_PRIVATE_KEY`, or a
base58 secret key from a wallet. The key signs SPL Memo transactions and nothing
else — the memo is a proof hash and a label, there are no token accounts and no
transfers. The signature is polled to confirmation before the hop is marked
verified; an unconfirmed transaction is never reported as anchored.


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
| `GITHUB_TOKEN` | fine-grained PAT, **Issues: Read and write** on one repo |
| `GITHUB_OWNER` / `GITHUB_REPO` | joined into `owner/repo` — the exact string the mandate allowlists |
| `TELEGRAM_BOT_TOKEN` | from @BotFather |
| `TELEGRAM_CHAT_ID` | a numeric id, never an `@username` — usernames get transferred, ids do not |
| `NOTION_API_KEY` | internal integration secret; **share the database with the integration** |
| `NOTION_DATABASE_ID` | a database, not a page and not a view |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` — a mainnet URL is refused |
| `SOLANA_NETWORK` | `devnet` (default); anything else is refused by the mandate |
| `SOLANA_PRIVATE_KEY` | server-side devnet keypair: the 64-number `solana-keygen` array, or a base58 secret key |
| `VERIFLOW_DATA_DIR` | where the JSON shelves are written; see [Reliability](#reliability) |

There are **no `NEXT_PUBLIC_*` variables, deliberately.** Every value above is
read on the server only; prefixing any of them would inline the secret into the
client bundle. The app derives its own origin from the incoming request, so there
is no app-URL variable to keep in sync either.

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

### The Arena, in ninety seconds

If you have the four Arena apps wired up, this is the stronger demo:

1. **`/arena`.** Play a game — the opponent searches every remaining position, so
   a draw is the best result on offer. The board is the cheap part; say so. (~20s)
2. **Submit it.** Watch `observe → verify → plan` settle, then four writes land in
   four different apps under four different keys. Open each action's refs: the
   issue number, the message id, the page, the devnet signature. Follow the
   explorer link — that transaction is on a public ledger. (~35s)
3. **Submit a tampered log.** The Arena has a button that splices one extra move
   onto a finished board. `verify` refuses, names the move, and **nothing is
   written to any of the four apps.** (~20s)
4. **`/verify`, load the sample.** Ten invoice rows with a blank amount, a
   96,400.00 outlier, an invalid date and a duplicate. The findings carry row
   numbers and the column statistics they were judged against — spread is median
   absolute deviation, so one outlier cannot hide inside it. (~15s)
5. **`/activity`.** The sealed record of all of it, chain re-verified on read.

The line for this one: *the model wrote the summary; it did not decide the
verdict, and it could not have widened the plan.*

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
- In the Arena the model writes the narration and may narrow the plan. It never
  produces the verdict, and it cannot add an action. With `GROQ_API_KEY` unset
  the deterministic plan and a plain narration are used, and the report says
  which it got — there is no silent degradation.
- The anomaly rules are ordinary statistics, not a model and not a claim to
  detect fraud. An outlier is a number far from the median relative to the
  column's median absolute deviation. That finds mistakes. It does not find
  someone who knows the rule.
- A Solana memo anchors a hash of the run's summary. It proves that hash existed
  at that slot. It does not prove the summary was true, and the data itself is
  never published — devnet is a public ledger.
- Devnet is not durable infrastructure. It is reset periodically and it is not
  where anything of value belongs; the anchor is a demonstration of the shape of
  the proof, not a production notarisation.

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
