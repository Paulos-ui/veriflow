import "server-only";
import { loadGmailConnection } from "./gmail-oauth";
import { AdapterUnavailable } from "./types";

// =============================================================================
// Google credentials. This module is the ONLY place in VeriFlow that reads
// GOOGLE_* environment variables.
//
// The isolation test in tests/isolation.test.ts greps every other tool module
// for these names and fails if one appears. That is what makes "the mail worker
// never holds Stripe credentials" a checkable property rather than a claim.
//
// It also owns the CONNECTION STATUS the UI badges itself with, for one reason:
// status and resolution must walk the same order. Two functions asking "is
// Gmail connected?" in two slightly different ways is how a row ends up saying
// LIVE over a hop that quietly ran on a fixture.
// =============================================================================

export interface GoogleAuth {
  accessToken: string;
}

/** OAuth scope VeriFlow asks for. Read-only: no send, no delete, no label. */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/** Whether an OAuth app is configured at all — distinct from being connected. */
export function googleAppConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Exchange a refresh token for an access token, or null if Google refuses. */
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    // A 4xx means Google looked at the credential and said no — revoked,
    // expired, or issued to a different client. That is a broken connection,
    // so it fails closed as a refusal with a remedy rather than a red crash.
    // A 5xx is Google being down, which is a genuine error and stays one.
    if (res.status < 500) {
      throw new AdapterUnavailable(
        "gmail_token_rejected",
        "Google rejected the stored Gmail credential, so no invoice was read.",
        "Re-connect Gmail on the workspace, or replace GOOGLE_REFRESH_TOKEN."
      );
    }
    throw new Error(`Google token refresh failed (${res.status}).`);
  }

  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

/**
 * Resolve an access token.
 *
 * Three supported setups, in priority order: a refresh token pinned in the
 * environment (survives restarts — what you want for a judged demo), a refresh
 * token captured by the OAuth flow and held in the server-side store, or a
 * pasted short-lived access token. None present → null, and the caller decides
 * what that means. This function never invents a token and never throws merely
 * because Gmail is unconnected.
 */
export async function googleAuth(): Promise<GoogleAuth | null> {
  const envRefresh = process.env.GOOGLE_REFRESH_TOKEN;
  if (envRefresh && googleAppConfigured()) {
    const token = await refreshAccessToken(envRefresh);
    if (token) return { accessToken: token };
  }

  if (googleAppConfigured()) {
    const stored = await loadGmailConnection();
    if (stored) {
      const token = await refreshAccessToken(stored.refreshToken);
      if (token) return { accessToken: token };
    }
  }

  const direct = process.env.GOOGLE_ACCESS_TOKEN;
  return direct ? { accessToken: direct } : null;
}

/** Where a working Gmail credential came from, in resolution order. */
export type GmailSource = "env" | "oauth" | "token";

/**
 * Connection state for the UI. Returns NO token material — the client is told
 * whether a link exists and which mailbox, never the secret.
 *
 * This walks googleAuth()'s branches in the same order, for the same reasons,
 * so the badge on the connection row and the provenance on the hop cannot
 * disagree. If you change the order above, change it here in the same commit.
 */
export async function gmailConnectionStatus(): Promise<{
  connected: boolean;
  email: string | null;
  source: GmailSource | null;
}> {
  const mailbox = process.env.GOOGLE_ACCOUNT_EMAIL ?? null;

  if (googleAppConfigured()) {
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      return { connected: true, email: mailbox, source: "env" };
    }
    const stored = await loadGmailConnection();
    if (stored) return { connected: true, email: stored.email ?? mailbox, source: "oauth" };
  }

  if (process.env.GOOGLE_ACCESS_TOKEN) {
    return { connected: true, email: mailbox, source: "token" };
  }

  return { connected: false, email: null, source: null };
}
