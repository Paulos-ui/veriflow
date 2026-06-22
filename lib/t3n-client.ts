import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Attestation } from "@/types";
import { createAgentKey, loadAgentSecret } from "./keystore";
import { putCredential, getCredential } from "./credstore";

// =============================================================================
// Terminal 3 adapter (SERVER-ONLY) — real @terminal3/t3n-sdk 3.9.0 integration.
//
//   Operator identity   authenticate(createEthAuthInput(addr)) -> did:t3n
//   Agent identity       self-custody secp256k1 delegatee key (encrypted at rest)
//   Scoped mandate       buildDelegationCredential + signCredential  [LOCAL CRYPTO]
//   Action               agent-signed delegated invocation -> client.execute()
//   Proof                getAuditEvents() (host-stamped) + verifyTdxQuote() (TDX)
//
// WHAT IS REAL vs PENDING in live mode:
//   REAL & unit-verified (pure crypto, no node): credential build + sign, agent
//     key generation + encryption, signature recovery. Proven against the SDK.
//   PENDING a live node (type-correct, runtime-unverified): handshake/authenticate,
//     client.execute, getAuditEvents, fetchDkgAttestation/verifyTdxQuote, and the
//     exact invocation pre-image layout (contract-defined — confirm in-editor).
//
// MODE: T3N_MODE=mock (default) is demo-safe and needs no node/keys.
// =============================================================================

const MODE = process.env.T3N_MODE ?? "mock";
const DELEGATION_WINDOW_SECS = 60 * 60 * 24 * 180; // 180 days default

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[t3n] Missing ${name}. Set it in .env.local (server-only).`);
  return v;
}
function hexToBytes(hex: string): Uint8Array {
  return Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));
}
function bytesToHex(u: Uint8Array): string {
  return "0x" + Buffer.from(u).toString("hex");
}
function pseudoHex(seed: string, bytes = 32): string {
  let out = createHash("sha256").update(seed).digest("hex");
  while (out.length < bytes * 2) out += createHash("sha256").update(out).digest("hex");
  return "0x" + out.slice(0, bytes * 2);
}
function normalizeFunctions(fns: string[]): string[] {
  return Array.from(new Set(fns.map((f) => f.toLowerCase()))).sort();
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ---------------------------------------------------------------------------
// 1. Operator session -> the enterprise's verifiable identity.
// ---------------------------------------------------------------------------
export async function authenticateOperator(): Promise<{ did: string; address: string }> {
  if (MODE === "mock") {
    return {
      did: process.env.T3N_OPERATOR_DID ?? `did:t3n:${pseudoHex("operator", 20).slice(2)}`,
      address: pseudoHex("operator-addr", 20),
    };
  }
  // Operator identity for provisioning + credential issuance does NOT need a live
  // node/WASM session — derive it from the configured key + DID. The WASM-backed
  // session is created lazily, only inside execute()/getAuditEvents().
  const { eth_get_address } = await import("@terminal3/t3n-sdk");
  return {
    did: requireEnv("T3N_OPERATOR_DID"),
    address: eth_get_address(requireEnv("T3N_API_KEY")),
  };
}

// ---------------------------------------------------------------------------
// 2. Provision an agent = a self-custody secp256k1 delegatee key (encrypted).
//    The visible did:t3n is display-derived from the pubkey; canonical authority
//    is the operator DID + the delegation credential.
// ---------------------------------------------------------------------------
export async function provisionAgent(input: {
  name: string;
  role: string;
}): Promise<{ id: string; did: string; agentPubkey: string; status: "active" }> {
  const id = randomUUID();
  if (MODE === "mock") {
    return {
      id,
      did: `did:t3n:${pseudoHex(id + input.name, 20).slice(2)}`,
      agentPubkey: "0x" + randomBytes(33).toString("hex"),
      status: "active",
    };
  }
  const { pubkey } = await createAgentKey(); // REAL: secp256k1 + AES-256-GCM at rest
  return {
    id,
    did: `did:t3n:${createHash("sha256").update(pubkey).digest("hex").slice(0, 40)}`,
    agentPubkey: pubkey,
    status: "active",
  };
}

// ---------------------------------------------------------------------------
// 3. Issue a scoped delegation credential (the "mandate"). REAL local crypto —
//    builds + operator-signs a genuine Terminal 3 DelegationCredential.
// ---------------------------------------------------------------------------
export async function issueDelegation(input: {
  operatorDid: string;
  agentPubkey: string;
  maxApprovalAmount: number;
  allowedVendors: string[];
  functions: string[];
  expiresAt: string | null;
}): Promise<{ credentialId: string; issuedAt: string }> {
  if (MODE === "mock") {
    return {
      credentialId: pseudoHex(input.agentPubkey + input.maxApprovalAmount, 16),
      issuedAt: new Date().toISOString(),
    };
  }

  const { buildDelegationCredential, canonicaliseCredential, signCredential } =
    await import("@terminal3/t3n-sdk");

  const operatorSecret = hexToBytes(requireEnv("T3N_API_KEY"));
  const vcId = randomBytes(16);
  const now = Math.floor(Date.now() / 1000);
  const notAfter = input.expiresAt
    ? Math.floor(Date.parse(input.expiresAt) / 1000)
    : now + DELEGATION_WINDOW_SECS;
  const batchCapCents = String(Math.round(input.maxApprovalAmount * 100));
  const contract = "tee:payments";
  const functions = normalizeFunctions(
    input.functions.length ? input.functions : ["invoice-analyze", "invoice-pay"]
  );

  const credential = buildDelegationCredential({
    user_did: input.operatorDid,
    agent_pubkey: hexToBytes(input.agentPubkey),
    org_did: process.env.T3N_OPERATOR_DID ?? input.operatorDid,
    contract,
    functions,
    scopes: input.allowedVendors.map(slugify),
    metadata: { batch_cap_cents: batchCapCents },
    not_before_secs: now,
    not_after_secs: notAfter,
    vc_id: vcId,
  });

  const jcs = canonicaliseCredential(credential);
  const { sig } = signCredential(jcs, operatorSecret); // 65-byte EIP-191 user_sig
  const credentialId = Buffer.from(vcId).toString("hex");
  const issuedAt = new Date().toISOString();

  await putCredential({
    credentialId,
    agentPubkey: input.agentPubkey,
    vcIdB64: Buffer.from(vcId).toString("base64url"),
    credentialJcsB64: Buffer.from(jcs).toString("base64"),
    userSigB64: Buffer.from(sig).toString("base64"),
    contract,
    functions,
    batchCapCents,
    issuedAt,
  });

  return { credentialId, issuedAt };
}

// ---------------------------------------------------------------------------
// 4. Agent executes a protected action under its delegation -> attested proof.
//    Agent-signing is REAL local crypto; client.execute + quote verification are
//    node round-trips (type-correct, runtime-unverified).
// ---------------------------------------------------------------------------
export async function executeDelegatedAction(input: {
  operatorDid: string;
  agentPubkey: string;
  credentialId: string;
  payload: { invoiceId: string; vendor: string; amount: number };
}): Promise<Attestation> {
  if (MODE === "mock") {
    const seed = `${input.credentialId}:${input.payload.invoiceId}:${input.payload.amount}`;
    return {
      id: randomUUID(),
      proofHash: pseudoHex(seed),
      txHash: pseudoHex("tx:" + seed),
      status: "verified",
      teeQuoteVerified: true,
      rtmr3: pseudoHex("rtmr3:" + seed, 48),
      auditEventId: pseudoHex("audit:" + seed, 16),
      verifiedAt: new Date().toISOString(),
    };
  }

  const stored = await getCredential(input.credentialId);
  if (!stored) throw new Error(`[t3n] No issued credential ${input.credentialId}.`);

  const { signAgentInvocation, DELEGATION_INVOCATION_DOMAIN } = await import("@terminal3/t3n-sdk");
  const agentSecret = await loadAgentSecret(input.agentPubkey); // REAL: decrypt for signing

  // Canonical request body for the action, then its SHA-256 (the request_hash).
  const request = {
    invoice_id: input.payload.invoiceId,
    vendor: input.payload.vendor,
    amount_cents: Math.round(input.payload.amount * 100),
  };
  const requestBytes = Buffer.from(JSON.stringify(request));
  const requestHash = createHash("sha256").update(requestBytes).digest();
  const nonce = randomBytes(16);
  const vcId = Buffer.from(stored.vcIdB64, "base64url");

  // Invocation pre-image. NOTE: the exact byte layout is defined by the deployed
  // contract — confirm against the live node/contract before T3N_MODE=live.
  const preimage = Buffer.concat([
    Buffer.from(DELEGATION_INVOCATION_DOMAIN),
    vcId,
    nonce,
    requestHash,
  ]);
  const agentSig = signAgentInvocation(preimage, agentSecret); // 64-byte ECDSA — REAL

  const envelope = {
    credential_jcs: stored.credentialJcsB64,
    user_sig: stored.userSigB64,
    agent_sig: Buffer.from(agentSig).toString("base64"),
    nonce: nonce.toString("base64"),
    request_hash: requestHash.toString("base64"),
  };

  // The Terminal 3 node deserialises STRICTLY into this shape — the field names
  // must be script_name / script_version / function_name / input or it 400s with
  // "missing field …". script_name+version must resolve to a DEPLOYED contract,
  // and `input` must match that contract's expected schema. Configure via env.
  const actionRequest = {
    script_name: process.env.T3N_CONTRACT ?? "tee:payments",
    script_version: process.env.T3N_CONTRACT_VERSION ?? "1.0.0",
    function_name: process.env.T3N_FUNCTION ?? "invoice-pay",
    input: { envelope, request },
  };

  // PENDING: requires a deployed Terminal 3 contract matching the above.
  const client = await getOperatorSession();
  const txHash = await client.execute(actionRequest);
  const { quoteB64, attestationMsgB64 } = await fetchNodeAttestation();
  const { verifyTdxQuote } = await import("@terminal3/t3n-sdk");
  const quote = await verifyTdxQuote(quoteB64, attestationMsgB64);

  return {
    id: randomUUID(),
    proofHash: bytesToHex(requestHash),
    txHash,
    status: quote.valid ? "verified" : "failed",
    teeQuoteVerified: quote.valid,
    rtmr3: quote.rtmr3 ?? null,
    auditEventId: null,
    verifiedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 5. Host-stamped audit trail (the unforgeable proof of who acted).
// ---------------------------------------------------------------------------
export async function getAuditTrail(): Promise<
  Array<{ tsMs: number; actor: string; vcId: string | null; action: string; outcome: string }>
> {
  if (MODE === "mock") return [];
  const client = await getOperatorSession(); // PENDING live node
  const page = await client.getAuditEvents({ limit: 50 });
  return page.batches.flatMap((b) =>
    b.events.map((e) => ({
      tsMs: e.ts_ms,
      actor: e.actor,
      vcId: e.vc_id ?? null,
      action: e.action,
      outcome: e.outcome,
    }))
  );
}

// ---------------------------------------------------------------------------
// Live node plumbing — type-correct against the SDK; needs a reachable T3 node.
// ---------------------------------------------------------------------------
type LiveClient = import("@terminal3/t3n-sdk").T3nClient;
let _client: LiveClient | null = null;

async function getOperatorSession(): Promise<LiveClient> {
  if (_client) return _client;
  try {
    const secret = requireEnv("T3N_API_KEY"); // operator ETH secret
    const { T3nClient, loadWasmComponent, setEnvironment, createEthAuthInput, eth_get_address, metamask_sign } =
      await import("@terminal3/t3n-sdk");
    setEnvironment((process.env.T3N_ENV as "testnet" | "production") ?? "testnet");
    const address = eth_get_address(secret);
    _client = new T3nClient({
      wasmComponent: await loadWasmComponent(),
      handlers: { EthSign: metamask_sign(address, undefined, secret) },
    }) as LiveClient;
    await _client.handshake();
    await _client.authenticate(createEthAuthInput(address));
    return _client;
  } catch (e) {
    _client = null;
    throw new Error(
      "Live Terminal 3 session unavailable — it needs a reachable T3 node and the WASM runtime. Use T3N_MODE=mock for the demo. (" +
        (e instanceof Error ? e.message : "unknown") +
        ")"
    );
  }
}

async function fetchNodeAttestation(): Promise<{ quoteB64: string; attestationMsgB64: string }> {
  const { fetchDkgAttestation } = await import("@terminal3/t3n-sdk");
  // Shape depends on the node bundle; normalized here. Confirm fields in-editor.
  const att = (await (fetchDkgAttestation as unknown as (...a: unknown[]) => Promise<unknown>)()) as {
    quoteB64: string;
    attestationMsgB64: string;
  };
  return { quoteB64: att.quoteB64, attestationMsgB64: att.attestationMsgB64 };
}

export const t3nMode = MODE;
