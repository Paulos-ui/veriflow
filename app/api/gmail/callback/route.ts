import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { GMAIL_SCOPE, googleAppConfigured } from "@/lib/tools/google-auth";
import { saveGmailConnection } from "@/lib/tools/gmail-oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =============================================================================
// GET /api/gmail/callback — finish the Gmail OAuth flow.
//
// Exchanges the authorisation code for a refresh token and writes it to the
// SERVER-SIDE store. The browser receives a redirect and a status in the query
// string — never the token, never anything derived from it.
//
// Every failure path redirects with a readable reason instead of throwing a
// stack trace at the operator. A failed connection must look like a failed
// connection: the UI keeps saying "not connected", and the case keeps running
// on fixtures with an honest badge.
// =============================================================================

/** Constant-time compare that tolerates length mismatch without throwing. */
function sameState(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const done = (status: string) => {
    const res = NextResponse.redirect(`${origin}/?gmail=${status}`);
    // The state cookie is single-use whatever the outcome.
    res.cookies.delete("veriflow_oauth_state");
    return res;
  };

  // The operator clicked "deny" on Google's consent screen. Not an error.
  const denied = url.searchParams.get("error");
  if (denied) return done("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return done("invalid");

  const expected = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("veriflow_oauth_state="))
    ?.split("=")[1];

  if (!expected || !sameState(state, expected)) return done("state_mismatch");
  if (!googleAppConfigured()) return done("unconfigured");

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: `${origin}/api/gmail/callback`,
        grant_type: "authorization_code",
      }),
    });

    const token = (await res.json()) as {
      refresh_token?: string;
      access_token?: string;
      scope?: string;
    };
    if (!res.ok || !token.refresh_token) {
      // No refresh token usually means Google reused a prior consent. The
      // connect route sends prompt=consent to avoid that, so treat it as a
      // real failure rather than storing an access token that dies in an hour.
      return done("no_refresh_token");
    }

    // Ask Gmail who just authorised us, so the UI can name the mailbox. A
    // failure here is cosmetic — the connection is already good.
    let email: string | null = null;
    if (token.access_token) {
      try {
        const who = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        if (who.ok) email = ((await who.json()) as { emailAddress?: string }).emailAddress ?? null;
      } catch {
        // Leave email null; the connection row falls back to "connected".
      }
    }

    await saveGmailConnection({
      refreshToken: token.refresh_token,
      email,
      connectedAt: new Date().toISOString(),
      scope: token.scope ?? GMAIL_SCOPE,
    });

    return done("connected");
  } catch {
    return done("exchange_failed");
  }
}
