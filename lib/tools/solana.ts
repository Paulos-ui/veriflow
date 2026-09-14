import "server-only";
import { createPrivateKey, createPublicKey, sign as nodeSign } from "node:crypto";
import { z } from "zod";
import type { ToolResult } from "./types";
import { AdapterUnavailable } from "./types";
import type { AnchorMemoInput } from "./registry";
import { decodeBase58, encodeBase58 } from "./base58";

// =============================================================================
// Solana adapter — the chain notary's single tool. Devnet only.
//
// SOLANA_PRIVATE_KEY is read here and nowhere else in the codebase, and the
// keypair never leaves this module: the caller gets back a signature and an
// explorer URL, which is all a proof needs.
//
// No `@solana/web3.js`. The transaction is built, signed and submitted by hand
// against the JSON-RPC, because the SDK is a large dependency for what is, on
// this path, a legacy transaction with one instruction and one signer. Ed25519
// signing comes from node:crypto, which has supported it natively since Node 12.
//
// What goes on chain is a HASH and a label. Never the game, never the spreadsheet,
// never anything a person uploaded — devnet is a public ledger and "anchor the
// proof" must not quietly mean "publish the data".
//
// The rule this module exists to keep: it never reports success from submission
// alone. sendTransaction returning a signature means an RPC node accepted the
// bytes, not that the network included them, so the status is polled afterwards
// and an unconfirmed transaction is reported as unconfirmed — with its signature,
// so it can be looked up rather than wondered about.
// =============================================================================

/** SPL Memo v2. The one program this agent is able to call. */
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

/** Memo program's own limit. Our memos are a hash and a label, far under it. */
const MAX_MEMO_BYTES = 566;

const CONFIRM_ATTEMPTS = 20;
const CONFIRM_INTERVAL_MS = 1_500;

// --- configuration -----------------------------------------------------------

function rpcUrl(): string {
  const url = process.env.SOLANA_RPC_URL?.trim();
  if (!url) {
    throw new AdapterUnavailable(
      "solana_not_configured",
      "Solana proof is not configured yet, so nothing was anchored.",
      "Set SOLANA_RPC_URL to https://api.devnet.solana.com and SOLANA_PRIVATE_KEY to a funded devnet keypair."
    );
  }
  if (/mainnet/i.test(url)) {
    // Belt and braces. The mandate gate already refuses a mainnet cluster; this
    // second check means a mainnet URL paired with a devnet SOLANA_NETWORK
    // label still cannot broadcast.
    throw new AdapterUnavailable(
      "solana_mainnet_refused",
      "That RPC endpoint is mainnet. VeriFlow anchors on devnet only.",
      "Point SOLANA_RPC_URL at https://api.devnet.solana.com.",
      "Solana"
    );
  }
  return url;
}

/**
 * The signing seed, from either format people actually have:
 * a Solana CLI keypair file (JSON array of 64 bytes) or a base58 secret key as
 * exported by a wallet. Both carry the 32-byte seed first.
 */
function seedBytes(): Uint8Array {
  const raw = process.env.SOLANA_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new AdapterUnavailable(
      "solana_not_configured",
      "Solana proof is not configured yet, so nothing was anchored.",
      "Set SOLANA_PRIVATE_KEY to a devnet keypair — the JSON array from `solana-keygen` or a base58 secret key."
    );
  }

  let bytes: Uint8Array | null = null;

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((n) => typeof n === "number")) {
        bytes = Uint8Array.from(parsed as number[]);
      }
    } catch {
      bytes = null;
    }
  } else {
    bytes = decodeBase58(raw);
  }

  if (!bytes || (bytes.length !== 64 && bytes.length !== 32)) {
    throw new AdapterUnavailable(
      "solana_bad_key",
      "SOLANA_PRIVATE_KEY is not a keypair this can read.",
      "Use the 64-number JSON array from `solana-keygen new`, or a base58 secret key. 32-byte seeds also work.",
      "Solana"
    );
  }
  return bytes.slice(0, 32);
}

/** PKCS#8 wrapper for a raw Ed25519 seed — the form node:crypto will import. */
const PKCS8_PREFIX = Uint8Array.from([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

interface Keypair {
  sign: (message: Uint8Array) => Uint8Array;
  publicKey: Uint8Array;
  address: string;
}

function keypair(): Keypair {
  const seed = seedBytes();

  const der = new Uint8Array(PKCS8_PREFIX.length + 32);
  der.set(PKCS8_PREFIX, 0);
  der.set(seed, PKCS8_PREFIX.length);

  const privateKey = createPrivateKey({ key: Buffer.from(der), format: "der", type: "pkcs8" });
  // SPKI for Ed25519 is a 12-byte header then the 32-byte key.
  const spki = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  const publicKey = new Uint8Array(spki.subarray(spki.length - 32));

  return {
    sign: (message) => new Uint8Array(nodeSign(null, Buffer.from(message), privateKey)),
    publicKey,
    address: encodeBase58(publicKey),
  };
}

// --- JSON-RPC ----------------------------------------------------------------

let nextId = 1;

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    result?: T;
    error?: { message?: string; code?: number };
  };

  if (!res.ok || json.error) {
    const detail = json.error?.message ?? res.statusText;
    throw new AdapterUnavailable(
      `solana_rpc_error`,
      `The Solana node refused ${method}: ${detail}`,
      /no record of a prior credit|insufficient/i.test(detail)
        ? "The devnet address has no SOL. Run `solana airdrop 1 <address> --url devnet`."
        : "Check SOLANA_RPC_URL is reachable and rate limits have not been hit.",
      "Solana"
    );
  }
  if (json.result === undefined) {
    throw new AdapterUnavailable(
      "solana_rpc_empty",
      `The Solana node returned nothing for ${method}.`,
      "Retry, or use a different devnet RPC endpoint.",
      "Solana"
    );
  }
  return json.result;
}

// --- transaction wire format -------------------------------------------------

/** Solana's compact-u16: 7 bits per byte, high bit continues. */
function shortVec(n: number): number[] {
  const out: number[] = [];
  let rem = n;
  for (;;) {
    if (rem < 0x80) {
      out.push(rem);
      return out;
    }
    out.push((rem & 0x7f) | 0x80);
    rem >>= 7;
  }
}

/**
 * A legacy transaction with one signer and one memo instruction.
 *
 * Account order is fixed by the format: signers first, then read-only
 * unsigned accounts. Here that is [payer, memo program], which is why the
 * instruction's programIdIndex is 1.
 */
function buildMessage(payer: Uint8Array, blockhash: Uint8Array, memo: Uint8Array): Uint8Array {
  const program = decodeBase58(MEMO_PROGRAM);
  if (!program || program.length !== 32) {
    throw new AdapterUnavailable(
      "solana_bad_program",
      "The memo program id did not decode.",
      "This is a bug in VeriFlow, not in your configuration.",
      "Solana"
    );
  }

  const bytes: number[] = [
    1, // numRequiredSignatures — the payer
    0, // numReadonlySignedAccounts
    1, // numReadonlyUnsignedAccounts — the memo program
    ...shortVec(2),
    ...payer,
    ...program,
    ...blockhash,
    ...shortVec(1), // one instruction
    1, // programIdIndex → the memo program
    ...shortVec(0), // the memo program needs no accounts
    ...shortVec(memo.length),
    ...memo,
  ];
  return Uint8Array.from(bytes);
}

function serialize(signature: Uint8Array, message: Uint8Array): Uint8Array {
  const prefix = shortVec(1);
  const out = new Uint8Array(prefix.length + signature.length + message.length);
  out.set(prefix, 0);
  out.set(signature, prefix.length);
  out.set(message, prefix.length + signature.length);
  return out;
}

// --- confirmation ------------------------------------------------------------

interface SignatureStatus {
  confirmationStatus?: "processed" | "confirmed" | "finalized";
  err?: unknown;
}

async function confirm(url: string, signature: string): Promise<"confirmed" | "pending"> {
  for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
    const res = await rpc<{ value: (SignatureStatus | null)[] }>(url, "getSignatureStatuses", [
      [signature],
      { searchTransactionHistory: true },
    ]);
    const status = res.value?.[0];

    if (status?.err) {
      throw new AdapterUnavailable(
        "solana_tx_failed",
        "The network included the transaction and it failed.",
        `Signature ${signature}. Inspect it on the devnet explorer.`,
        "Solana"
      );
    }
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return "confirmed";
    }
    await new Promise((r) => setTimeout(r, CONFIRM_INTERVAL_MS));
  }
  return "pending";
}

// --- the tool ----------------------------------------------------------------

export async function anchorMemo(
  input: z.infer<typeof AnchorMemoInput>
): Promise<ToolResult<{ signature: string; address: string; explorerUrl: string; slot: number }>> {
  const url = rpcUrl();
  const signer = keypair();

  const memo = new TextEncoder().encode(input.memo);
  if (memo.length > MAX_MEMO_BYTES) {
    throw new AdapterUnavailable(
      "solana_memo_too_long",
      `The memo is ${memo.length} bytes and the program accepts ${MAX_MEMO_BYTES}.`,
      "Anchor the proof hash rather than the full record.",
      "Solana"
    );
  }

  const latest = await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>(
    url,
    "getLatestBlockhash",
    [{ commitment: "finalized" }]
  );
  const blockhash = decodeBase58(latest.value.blockhash);
  if (!blockhash || blockhash.length !== 32) {
    throw new AdapterUnavailable(
      "solana_bad_blockhash",
      "The node returned a blockhash that did not decode.",
      "Retry, or use a different devnet RPC endpoint.",
      "Solana"
    );
  }

  const message = buildMessage(signer.publicKey, blockhash, memo);
  const wire = serialize(signer.sign(message), message);

  // preflight left ON: a transaction that would fail should fail here, before a
  // signature exists to be reported as if it meant something.
  const signature = await rpc<string>(url, "sendTransaction", [
    Buffer.from(wire).toString("base64"),
    { encoding: "base64", preflightCommitment: "confirmed", maxRetries: 3 },
  ]);

  const state = await confirm(url, signature);
  const explorerUrl = `https://explorer.solana.com/tx/${signature}?cluster=${encodeURIComponent(input.cluster)}`;

  if (state === "pending") {
    // Submitted, not confirmed. Reported as a refusal so nothing downstream
    // records it as an anchored proof — with the signature attached, because
    // "we do not know yet" is a useful answer and "it worked" would not be true.
    throw new AdapterUnavailable(
      "solana_unconfirmed",
      "The transaction was submitted but the network had not confirmed it in time.",
      `Signature ${signature} — check ${explorerUrl} before retrying, so the memo is not anchored twice.`,
      "Solana"
    );
  }

  const slot = await rpc<number>(url, "getSlot", [{ commitment: "confirmed" }]).catch(() => 0);

  return {
    output: { signature, address: signer.address, explorerUrl, slot },
    provenance: "live",
    refs: {
      cluster: input.cluster,
      signature,
      address: signer.address,
      url: explorerUrl,
    },
  };
}
