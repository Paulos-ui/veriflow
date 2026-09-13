import "server-only";

// =============================================================================
// Where the approval channel is resolved from the environment — and the only
// place that resolution happens.
//
// This lives outside lib/agents/roster.ts deliberately. The policy layer
// (mandates, enforcement, the roster) is pure data: no process.env, no imports
// that need a server, so it can be read and reasoned about in any context, and
// tests/proof.test.ts asserts exactly that. Reading an env var inside it would
// trade a proven property for a convenience.
//
// So the value is resolved here and INJECTED into defaultMandates(). One read,
// one value, handed to both the mandate that allowlists the channel and the
// case that posts to it. That matters more than it looks: if those two were
// separate literals, pointing the demo at a real Slack workspace would make
// every correct post look like a scope violation.
// =============================================================================

/** The demo channel, used when no real workspace is wired up. */
export const FALLBACK_APPROVAL_CHANNEL = "C07APCLERK01";

export function approvalChannel(): string {
  return process.env.SLACK_CHANNEL_ID || FALLBACK_APPROVAL_CHANNEL;
}
