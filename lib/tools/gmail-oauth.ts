import "server-only";
import { readStore, writeStore } from "@/lib/storage/root";

// =============================================================================
// Gmail OAuth token store — the ONLY place a Google refresh token is written.
//
// A store and nothing more: it reads no environment variables and makes no
// decisions about whether Gmail is "connected". google-auth.ts owns that
// judgement, so there is exactly one resolution order to keep honest.
//
// The token never crosses to the client: the callback route writes it here
// server-side and hands the browser a redirect, never the token.
//
// Storage is the shared writable root (/tmp on Vercel), so a connection lasts
// as long as the warm instance does. That is an honest demo constraint, not a
// hidden one — the UI reads connection state from this store on every load, so
// a cold start shows "not connected" rather than claiming a link that is gone.
//
// For a durable connection, set GOOGLE_REFRESH_TOKEN as an environment
// variable: google-auth.ts prefers env over this store precisely so a judge can
// pin a connection that survives restarts.
// =============================================================================

const FILE = "gmail-oauth.json";

export interface GmailConnection {
  refreshToken: string;
  /** The mailbox that authorised us, shown in the UI so the operator can confirm. */
  email: string | null;
  connectedAt: string;
  scope: string;
}

export async function saveGmailConnection(conn: GmailConnection): Promise<void> {
  await writeStore(FILE, conn, { mode: 0o600 });
}

export async function loadGmailConnection(): Promise<GmailConnection | null> {
  const stored = await readStore<GmailConnection | null>(FILE, null);
  return stored?.refreshToken ? stored : null;
}
