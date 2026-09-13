import "server-only";
import { gmailConnectionStatus, googleAppConfigured } from "@/lib/tools/google-auth";
import { approvalChannel } from "@/lib/agents/channel";

// =============================================================================
// Connection status for the three apps, computed server-side.
//
// This module answers one question — "will the next case hit a real API?" — and
// returns ONLY booleans and labels. No token, no prefix, no length, nothing an
// attacker could use to confirm a guess. The client renders what it is told.
//
// Each app's status is derived the same way the adapter decides at run time, so
// the badge cannot disagree with what actually happens. If the row says LIVE,
// the hop will be live; if it says fixture, the adapter is going to fall back.
//
// Note that only Gmail has a Connect button. Slack and Stripe authenticate with
// a bot token and a secret key — there is no user-consent flow to start, so
// offering a button that cannot do anything would be a lie in the shape of a UI
// affordance. They read "configured" or "not configured" and that is honest.
// =============================================================================

export type LinkState = "live" | "recorded";

export interface AppLink {
  /** Stable id used as a React key and in aria labels. */
  id: "gmail" | "slack" | "stripe";
  app: string;
  /** Which agent holds this app's credential — the isolation claim, visible. */
  holder: string;
  state: LinkState;
  /** What the operator sees when it is not live. */
  fallback: string;
  /** True only for Gmail: the one app with a user-consent flow. */
  connectable: boolean;
  /** Mailbox or channel identity, when we can name it without leaking. */
  detail: string | null;
}

export async function appLinks(): Promise<AppLink[]> {
  const gmail = await gmailConnectionStatus();

  return [
    {
      id: "gmail",
      app: "Gmail",
      holder: "Ferris · mail.reader",
      state: gmail.connected ? "live" : "recorded",
      fallback: "Reads a recorded invoice",
      // Only offer the button when an OAuth app actually exists to consent to.
      connectable: googleAppConfigured(),
      detail: gmail.connected
        ? gmail.email ??
          (gmail.source === "oauth" ? "connected by consent" : "pinned by environment")
        : null,
    },
    {
      id: "slack",
      app: "Slack",
      holder: "Harbor · comms.poster",
      state: process.env.SLACK_BOT_TOKEN ? "live" : "recorded",
      fallback: "Approval resolved in demo mode",
      connectable: false,
      // Names the channel the poster will actually target — same resolver the
      // case uses, so the row cannot advertise a different destination.
      detail: process.env.SLACK_BOT_TOKEN ? approvalChannel() : null,
    },
    {
      id: "stripe",
      app: "Stripe",
      holder: "Sterling · pay.clerk",
      state: process.env.STRIPE_SECRET_KEY ? "live" : "recorded",
      fallback: "Payment simulated, never faked as paid",
      connectable: false,
      detail: process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")
        ? "test mode"
        : process.env.STRIPE_SECRET_KEY
          ? "key set"
          : null,
    },
  ];
}
