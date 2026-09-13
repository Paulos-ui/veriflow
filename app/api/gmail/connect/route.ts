import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { GMAIL_SCOPE, googleAppConfigured } from "@/lib/tools/google-auth";

// The Google SDK path and the token store both need Node APIs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =============================================================================
// GET /api/gmail/connect — start the Gmail OAuth flow.
//
// Sends the operator to Google's consent screen and nothing else. The state
// parameter is a random value mirrored into an httpOnly cookie; the callback
// refuses any response whose state does not match, which is what stops an
// attacker from walking a victim's browser through an authorisation they did
// not start.
//
// access_type=offline + prompt=consent because we need a REFRESH token, and
// Google only returns one on the first consent unless you ask every time.
// =============================================================================

export function GET(req: Request) {
  const origin = new URL(req.url).origin;

  if (!googleAppConfigured()) {
    // No OAuth app means there is nothing to connect TO. Say so plainly rather
    // than bouncing the operator to a Google error page.
    return NextResponse.redirect(`${origin}/?gmail=unconfigured`);
  }

  const state = randomBytes(16).toString("hex");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: `${origin}/api/gmail/callback`,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  const res = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
  res.cookies.set("veriflow_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // must survive the top-level redirect back from Google
    path: "/",
    maxAge: 600,
  });
  return res;
}
