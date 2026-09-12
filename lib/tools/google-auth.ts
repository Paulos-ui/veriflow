import "server-only";

// =============================================================================
// Google credentials. This module is the ONLY place in VeriFlow that reads
// GOOGLE_* environment variables.
//
// The isolation test in tests/isolation.test.ts greps every other tool module
// for these names and fails if one appears. That is what makes "the mail worker
// never holds Stripe credentials" a checkable property rather than a claim.
// =============================================================================

export interface GoogleAuth {
  accessToken: string;
}

/**
 * Resolve an access token, refreshing if a refresh token is configured.
 *
 * Two supported setups: a long-lived refresh token (survives restarts, what
 * you want for a judged demo), or a pasted short-lived access token (fine for
 * a five-minute test). Neither present → null, and the tool falls back to
 * fixtures with honest provenance rather than inventing a result.
 */
export async function googleAuth(): Promise<GoogleAuth | null> {
  const refresh = process.env.GOOGLE_REFRESH_TOKEN;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (refresh && clientId && clientSecret) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refresh,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      throw new Error(`Google token refresh failed (${res.status}). Re-authorise the demo account.`);
    }
    const json = (await res.json()) as { access_token?: string };
    if (json.access_token) return { accessToken: json.access_token };
  }

  const direct = process.env.GOOGLE_ACCESS_TOKEN;
  return direct ? { accessToken: direct } : null;
}
