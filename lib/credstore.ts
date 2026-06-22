import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

// =============================================================================
// Store for ISSUED delegation credentials (SERVER-ONLY).
// The credential JCS + user signature are NOT secret — they are meant to travel
// to the contract — so they're stored as plaintext base64. The agent's private
// key stays in the encrypted keystore; only its pubkey is referenced here.
// Swap the file store for a DB in production; the interface is the seam.
// =============================================================================

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "credentials.json");

export interface StoredCredential {
  credentialId: string; // vc_id hex
  agentPubkey: string; // 0x + 66 hex
  vcIdB64: string; // base64url of vc_id
  credentialJcsB64: string; // RFC 8785 JCS bytes, base64
  userSigB64: string; // 65-byte EIP-191 operator signature, base64
  contract: string;
  functions: string[];
  batchCapCents: string;
  issuedAt: string; // ISO
}

export async function putCredential(rec: StoredCredential): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  let data: Record<string, StoredCredential> = {};
  try {
    data = JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {}
  data[rec.credentialId] = rec;
  await fs.writeFile(FILE, JSON.stringify(data, null, 2));
}

export async function getCredential(credentialId: string): Promise<StoredCredential | null> {
  try {
    const data = JSON.parse(await fs.readFile(FILE, "utf8")) as Record<string, StoredCredential>;
    return data[credentialId] ?? null;
  } catch {
    return null;
  }
}
