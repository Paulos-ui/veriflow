import "server-only";
import { readStore, writeStore } from "@/lib/storage/root";

// =============================================================================
// Store for ISSUED delegation credentials (SERVER-ONLY).
// The credential JCS + user signature are NOT secret — they are meant to travel
// to the contract — so they're stored as plaintext base64. The agent's private
// key stays in the encrypted keystore; only its pubkey is referenced here.
// Swap the file store for a DB in production; the interface is the seam.
// =============================================================================

const FILE = "credentials.json";

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
  const data = await readStore<Record<string, StoredCredential>>(FILE, {});
  data[rec.credentialId] = rec;
  await writeStore(FILE, data);
}

export async function getCredential(credentialId: string): Promise<StoredCredential | null> {
  const data = await readStore<Record<string, StoredCredential>>(FILE, {});
  return data[credentialId] ?? null;
}
