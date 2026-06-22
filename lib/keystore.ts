import "server-only";
import {
  createECDH,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHash,
} from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

// =============================================================================
// Self-custody keystore (Option A), SERVER-ONLY.
//
// Each agent gets a secp256k1 delegatee keypair. The PRIVATE key is encrypted
// at rest with AES-256-GCM under a key-encryption-key (KEK) and never written
// or returned in plaintext. The public key (33-byte compressed) is the agent's
// delegatee identity in Terminal 3's delegation model.
//
// The KEK comes from VERIFLOW_KEK (base64 or hex, 32 bytes). In dev, if it's
// absent we derive a deterministic dev KEK so the demo runs — NEVER do that in
// production (a warning is logged once).
//
// Persistence is pluggable. The default file store writes to ./.data/keys.json
// (git-ignored). Swap `store` for a DB-backed implementation in production;
// nothing else changes. Note: serverless filesystems are ephemeral — wire a
// real DB before relying on persistence across deploys.
// =============================================================================

const KEY_DIR = path.join(process.cwd(), ".data");
const KEY_FILE = path.join(KEY_DIR, "keys.json");

let warnedDevKek = false;

function getKek(): Buffer {
  const raw = process.env.VERIFLOW_KEK;
  if (raw) {
    const buf = raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (buf.length !== 32) throw new Error("[keystore] VERIFLOW_KEK must decode to 32 bytes.");
    return buf;
  }
  if (!warnedDevKek) {
    console.warn("[keystore] VERIFLOW_KEK not set — using a DEV key. Do not use in production.");
    warnedDevKek = true;
  }
  // Deterministic dev KEK derived from a fixed label — dev only.
  return createHash("sha256").update("veriflow-dev-kek-v1").digest();
}

interface EncryptedKey {
  pubkey: string; // 0x + 66 hex (33-byte compressed secp256k1)
  iv: string; // base64
  tag: string; // base64
  ciphertext: string; // base64 (encrypted 32-byte secret)
}

// ---- pluggable persistence -------------------------------------------------
interface KeyStore {
  get(pubkey: string): Promise<EncryptedKey | null>;
  put(rec: EncryptedKey): Promise<void>;
}

const fileStore: KeyStore = {
  async get(pubkey) {
    try {
      const data = JSON.parse(await fs.readFile(KEY_FILE, "utf8")) as Record<string, EncryptedKey>;
      return data[pubkey] ?? null;
    } catch {
      return null;
    }
  },
  async put(rec) {
    await fs.mkdir(KEY_DIR, { recursive: true });
    let data: Record<string, EncryptedKey> = {};
    try {
      data = JSON.parse(await fs.readFile(KEY_FILE, "utf8"));
    } catch {}
    data[rec.pubkey] = rec;
    await fs.writeFile(KEY_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
  },
};

const store: KeyStore = fileStore;

// ---- public API ------------------------------------------------------------

/** Generate a new agent keypair, encrypt the secret at rest, return the pubkey. */
export async function createAgentKey(): Promise<{ pubkey: string }> {
  const ecdh = createECDH("secp256k1");
  ecdh.generateKeys();
  const secret = ecdh.getPrivateKey(); // 32 bytes
  const pubkey = "0x" + ecdh.getPublicKey("hex", "compressed"); // 33-byte compressed

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKek(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()]);
  const tag = cipher.getAuthTag();

  await store.put({
    pubkey,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
  return { pubkey };
}

/**
 * Load and decrypt an agent's secret for signing. Returns a 32-byte Buffer.
 * Callers MUST use it transiently and never persist or log it.
 */
export async function loadAgentSecret(pubkey: string): Promise<Buffer> {
  const rec = await store.get(pubkey);
  if (!rec) throw new Error(`[keystore] No key for ${pubkey}.`);
  const decipher = createDecipheriv("aes-256-gcm", getKek(), Buffer.from(rec.iv, "base64"));
  decipher.setAuthTag(Buffer.from(rec.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(rec.ciphertext, "base64")),
    decipher.final(),
  ]);
}
