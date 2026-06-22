# VeriFlow

**Verifiable AI agents with cryptographic identity for enterprise workflows.**

VeriFlow gives an AI agent a verifiable identity on **Terminal 3**, a signed and
revocable **delegation mandate**, and a hardware-attested **proof** for every
action it takes. You trust the agent because you can verify it.

The demo workflow: provision an agent → issue a scoped mandate → hand it an
invoice → it reasons (Groq) and decides → if within mandate, it executes a
delegated action → Terminal 3 returns a TEE attestation + host-stamped audit event.

---

## Status — Phase 1 (built & build-validated)

- ✅ Dashboard, agent lifecycle (provision → list → detail), scoped delegation,
  invoice workflow, proof viewer, scroll-reactive About page.
- ✅ `next build` passes clean (Next.js 15.3.0, 9 routes, types + lint OK).
- ✅ Runs and demos with **zero keys** — mock Terminal 3 + a heuristic fallback
  for Groq when `GROQ_API_KEY` is absent.
- ✅ **Self-custody keystore** — secp256k1 keygen + AES-256-GCM at rest (`lib/keystore.ts`).
- ✅ **Real delegation-credential signing** — `T3N_MODE=live` builds and
  operator-signs genuine Terminal 3 `DelegationCredential`s (`buildDelegationCredential`
  + `signCredential`), verified to recover the operator address. This is pure
  local crypto — no node required.
- ⏭️ Node round-trips (`handshake`/`authenticate`/`execute`/`getAuditEvents`/
  `verifyTdxQuote`) are wired and type-correct against the SDK but
  **runtime-unverified** pending a live Terminal 3 node.

## Architecture

All Terminal 3 and Groq calls are **server-only**. Every T3 route exports
`runtime = "nodejs"` (the SDK loads a WASM component).

| VeriFlow concept | Terminal 3 surface |
|---|---|
| Enterprise identity | `authenticate(createEthAuthInput(addr))` → `did:t3n` |
| Agent identity | self-custody secp256k1 delegatee key (Option A) |
| Scoped mandate | `buildDelegationCredential` — `batch_cap_cents`, `functions`, `scopes`, `not_after_secs` |
| Action | delegated invocation signed by the agent → `client.execute()` → `tx_hash` |
| Proof | `getAuditEvents()` (host-stamped) + `verifyTdxQuote()` (TDX, RTMR3, Intel root CA) |

Identity, governance, audit, and attestation all come from Terminal 3 — VeriFlow
adds no parallel identity system. The agent's delegatee key is only a delegatee
key, never an identity.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v3 · Framer Motion ·
Zustand · Zod · Groq (`llama-3.3-70b-versatile`) · `@terminal3/t3n-sdk`.

> **Tailwind is pinned to v3.4.17 on purpose.** v4 moves the PostCSS plugin to a
> separate package and breaks this config. Do not bump to v4.

## Design

"The Seal" — making invisible cryptographic trust tangible. Warm bone text on a
deep ink base; **verdigris** for verified, **amber** for awaiting, **signal**
violet for identity. Fraunces (display only) + Geist + Geist Mono (hashes/DIDs).
The geometric attestation seal presses in and ripples once on verify.

## Setup

```bash
npm install
cp .env.example .env.local   # optional — runs demo-safe without keys
npm run dev
```

`.env.local` (all optional for the demo):

```
T3N_API_KEY=         # operator ETH secret key (0x + 64 hex)
T3N_OPERATOR_DID=    # did:t3n derived from that key
T3N_MODE=mock        # set to "live" once SDK calls are wired
T3N_ENV=testnet
VERIFLOW_KEK=        # 32-byte key (hex/base64) for keystore encryption; openssl rand -hex 32
GROQ_API_KEY=        # omit to use the heuristic fallback
GROQ_MODEL=llama-3.3-70b-versatile
```

Secrets live only in `.env.local` (git-ignored) and are read via `process.env`
server-side. No key ever reaches the client.

## Deploy

Vercel. Set the env vars above in the project settings. The build needs network
access to Google Fonts (standard for `next/font/google`).

## Honest notes

- Mock mode returns realistic, deterministic shapes so the product is fully
  demoable offline.
- **Live mode, verified (pure crypto, no node):** agent key generation +
  encryption, delegation-credential build + operator signature, signature
  recovery. The credential issuance is genuinely valid Terminal 3 material.
- **Live mode, pending a live node (type-correct, runtime-unverified):** operator
  `handshake`/`authenticate`, `client.execute`, `getAuditEvents`, and
  `fetchDkgAttestation`/`verifyTdxQuote`. One seam to confirm in-editor against
  the deployed contract: the exact invocation **pre-image byte layout** in
  `executeDelegatedAction` (flagged in code).
- The keystore's file store + dev KEK fallback are for local development;
  wire a DB-backed store and a real `VERIFLOW_KEK` before production
  (serverless filesystems are ephemeral).
