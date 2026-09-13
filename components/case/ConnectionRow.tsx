import type { AppLink } from "@/lib/tools/links";
import { StatusBadge } from "@/components/StatusBadge";

// =============================================================================
// The connection row: will the next case hit a real API, or a recorded one?
//
// That is the first question a judge should be able to answer, so this sits
// above the launcher and answers it in one word per app. The data is computed
// server-side (lib/tools/links.ts) and holds no token material — the browser is
// told THAT a link exists, never what it is. This component stays a server
// component for the same reason: none of it needs to reach the client.
//
// The badge is the SAME StatusBadge the hops use, so ◆ Live here and ◆ Live on
// a hop mean the identical thing. A second vocabulary for the same fact would
// just be a way to disagree with ourselves.
//
// Only Gmail gets a Connect button. Slack and Stripe authenticate with a bot
// token and a secret key set in the environment; there is no user-consent flow
// to start, so rendering a button that cannot do anything would be an
// affordance that lies.
// =============================================================================

/** Outcomes of the OAuth round trip, said plainly. */
const OAUTH_NOTICE: Record<string, { tone: "good" | "plain"; text: string }> = {
  connected: { tone: "good", text: "Gmail is connected. The next case reads real mail." },
  denied: { tone: "plain", text: "Gmail connection cancelled. Nothing was stored." },
  unconfigured: {
    tone: "plain",
    text: "No Google OAuth app is configured, so there is nothing to connect to yet.",
  },
  state_mismatch: {
    tone: "plain",
    text: "That sign-in did not match the request we started, so it was discarded.",
  },
  no_refresh_token: {
    tone: "plain",
    text: "Google returned no refresh token. Remove VeriFlow at myaccount.google.com and try again.",
  },
  exchange_failed: {
    tone: "plain",
    text: "The token exchange with Google failed. Nothing was stored.",
  },
  invalid: { tone: "plain", text: "That callback arrived without a code. Nothing was stored." },
};

export function ConnectionRow({ links, notice }: { links: AppLink[]; notice?: string }) {
  const message = notice ? OAUTH_NOTICE[notice] : undefined;

  return (
    <section aria-labelledby="links-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="links-heading"
          className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted"
        >
          Connections
        </h2>
        <p className="text-[12px] text-faint">
          One app, one holder. A recorded run is labelled, never disguised.
        </p>
      </div>

      <ul className="grid gap-2.5 sm:grid-cols-3">
        {links.map((link) => {
          const live = link.state === "live";
          return (
            <li
              key={link.id}
              className="flex flex-col rounded-card border border-hairline bg-surface/30 px-4 py-3.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                <span className="text-[14px] text-bone">{link.app}</span>
                <StatusBadge status={live ? "live" : "fixture"} />
              </div>

              {/* The isolation claim, stated on the surface it applies to. */}
              <p className="crypto mt-2 text-[10.5px] text-signal">{link.holder}</p>

              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                {live ? link.detail ?? "Connected" : link.fallback}
              </p>

              {/* A plain link, not a fetch: OAuth is a top-level navigation.
                  Shown only when an OAuth app exists to consent to. */}
              {link.connectable && !live && (
                <a
                  href="/api/gmail/connect"
                  className="mt-3 inline-flex w-fit items-center rounded-card border border-hairline px-2.5 py-1.5 text-[12px] text-muted transition-colors duration-150 ease-seal hover:border-gold/35 hover:text-gold focus-visible:border-gold/35 focus-visible:text-gold"
                >
                  Connect Gmail
                </a>
              )}
            </li>
          );
        })}
      </ul>

      {message && (
        <p
          role="status"
          className={`rounded-card border px-4 py-2.5 text-[12.5px] text-bone ${
            message.tone === "good"
              ? "border-verdigris/35 bg-verdigris/[0.06]"
              : "border-hairline bg-surface/40"
          }`}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}
