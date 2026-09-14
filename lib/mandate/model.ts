import { z } from "zod";

// =============================================================================
// The mandate: what an agent is allowed to do, expressed as data.
//
// This mirrors the Terminal 3 DelegationCredential (batch_cap_cents, functions,
// scopes, not_after_secs) rather than inventing a parallel vocabulary. The
// credential is the signed artifact; this is the same shape in a form the gate
// can read synchronously on every call.
//
// Pure module. No credentials, no I/O, no `server-only` — the workspace UI
// renders mandate chips from these types, and the deny-path tests import them
// without pulling a single adapter into the process.
// =============================================================================

/** Scopes are per-app allowlists. Absent dimension = no authority there. */
export const MandateScopes = z.object({
  /** Gmail: which senders this agent may read from. */
  gmailSenders: z.array(z.string()).optional(),
  /** Gmail: which label the search is confined to. */
  gmailLabels: z.array(z.string()).optional(),
  /** Slack: exact channel ids. Never names — names get re-pointed. */
  slackChannels: z.array(z.string()).optional(),
  /** Stripe: vendors this agent may move money to. */
  vendors: z.array(z.string()).optional(),
  /** GitHub: `owner/repo` this agent may open issues on. */
  repos: z.array(z.string()).optional(),
  /** Telegram: exact chat ids. Never usernames — usernames get transferred. */
  chats: z.array(z.string()).optional(),
  /** Notion: database ids this agent may write entries to. */
  databases: z.array(z.string()).optional(),
  /** Solana: clusters this agent may broadcast to. `mainnet-beta` is never listed. */
  clusters: z.array(z.string()).optional(),
});
export type MandateScopes = z.infer<typeof MandateScopes>;

export const Mandate = z.object({
  id: z.string(),
  /** Bumped on every re-issue. Stamped into each attestation row. */
  version: z.number().int().nonnegative(),
  /** The delegatee pubkey this mandate is bound to — NOT a display name. */
  agentPubkey: z.string(),
  /** Tool names this agent may call. Everything else is refused. */
  functions: z.array(z.string()),
  scopes: MandateScopes,
  /** Ceiling for a single money-moving call. */
  batchCapCents: z.number().int().nonnegative(),
  notBeforeSecs: z.number().int(),
  notAfterSecs: z.number().int(),
  revoked: z.boolean(),
  /** T3 vc_id once issued; null while the mandate is local-only. */
  credentialId: z.string().nullable(),
});
export type Mandate = z.infer<typeof Mandate>;

/**
 * What a call is asking for, extracted from tool input before execution.
 *
 * The gate reads this instead of the raw tool input, so `enforce` never has to
 * know the shape of a Gmail query or a Stripe charge. Each tool declares how to
 * derive its own demand (see lib/tools/types.ts).
 */
export interface Demand {
  /** Money to be moved, in cents. Omit for reads. */
  amountCents?: number;
  gmailSender?: string;
  gmailLabel?: string;
  slackChannel?: string;
  vendor?: string;
  /** `owner/repo` an issue would be opened on. */
  repo?: string;
  /** Telegram chat id a message would be sent to. */
  chat?: string;
  /** Notion database id an entry would be written to. */
  database?: string;
  /** Solana cluster a transaction would be broadcast to. */
  cluster?: string;
}

/** Seconds since epoch. Injected in tests so expiry is deterministic. */
export function nowSecs(clock: number = Date.now()): number {
  return Math.floor(clock / 1000);
}

/** Is this mandate live right now? Used for chips; the gate re-checks. */
export function mandateIsLive(m: Mandate, at: number = nowSecs()): boolean {
  return !m.revoked && at >= m.notBeforeSecs && at < m.notAfterSecs;
}

/** Human-readable scope lines for the mandate chips in the roster. */
export function describeScopes(s: MandateScopes): string[] {
  const out: string[] = [];
  if (s.gmailSenders?.length) out.push(`from: ${s.gmailSenders.join(", ")}`);
  if (s.gmailLabels?.length) out.push(`label: ${s.gmailLabels.join(", ")}`);
  if (s.slackChannels?.length) out.push(`channel: ${s.slackChannels.join(", ")}`);
  if (s.vendors?.length) out.push(`vendors: ${s.vendors.join(", ")}`);
  if (s.repos?.length) out.push(`repo: ${s.repos.join(", ")}`);
  if (s.chats?.length) out.push(`chat: ${s.chats.join(", ")}`);
  if (s.databases?.length) out.push(`database: ${s.databases.join(", ")}`);
  if (s.clusters?.length) out.push(`cluster: ${s.clusters.join(", ")}`);
  return out;
}
