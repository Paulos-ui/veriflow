import "server-only";
import type { ArenaTargets } from "./roster";
import type { ActionType } from "@/lib/arena/events";

// =============================================================================
// Where the Arena's four destinations come from — and the only place they are
// read.
//
// Same reasoning as channel.ts, which resolves the Slack channel: the policy
// layer (roster, mandates, enforcement) must stay free of process.env so that
// what an agent may do can be read as data, and tests/proof.test.ts asserts it.
// So the values are resolved here and INJECTED into arenaMandates().
//
// One read, one value, handed to both the mandate that allowlists a destination
// and the call that writes to it. If those were two separate reads, a typo in
// one would make every correct write look like a scope violation — and a scope
// violation is supposed to mean something.
//
// The other half of this module's job is honesty about what is NOT configured.
// `configured()` reports which integrations can actually run, and the planner
// uses it to mark the rest `skipped` with a plain reason, rather than planning
// an action that was always going to fail. Nothing here invents a placeholder
// destination: an unset variable produces null, never a fallback that would let
// a write land somewhere nobody chose.
// =============================================================================

/** `owner/repo`, or null when either half is unset. */
export function githubRepo(): string | null {
  const owner = process.env.GITHUB_OWNER?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  return owner && repo ? `${owner}/${repo}` : null;
}

/** Telegram chat id. An id, never an @username — usernames get transferred. */
export function telegramChat(): string | null {
  return process.env.TELEGRAM_CHAT_ID?.trim() || null;
}

export function notionDatabase(): string | null {
  return process.env.NOTION_DATABASE_ID?.trim() || null;
}

/**
 * The Solana cluster, normalised to one of the names a mandate can list.
 *
 * Defaults to devnet and, critically, `mainnet-beta` is not special-cased here
 * to make it work — if someone sets SOLANA_NETWORK=mainnet-beta this returns it
 * verbatim, and the gate refuses it, because no mandate this codebase issues
 * lists a mainnet cluster. Refusing in the gate is better than silently
 * rewriting the operator's configuration to something safer than they asked
 * for: they should be told, not overridden.
 */
export function solanaCluster(): string {
  return process.env.SOLANA_NETWORK?.trim() || "devnet";
}

/**
 * A destination string for every action, with empty strings where nothing is
 * configured. An empty destination is never granted by arenaMandates(), so it
 * cannot be written to even if a plan somehow reached for it.
 */
export function arenaTargets(): ArenaTargets {
  return {
    repo: githubRepo() ?? "",
    chat: telegramChat() ?? "",
    database: notionDatabase() ?? "",
    cluster: solanaCluster(),
  };
}

/**
 * Which integrations are wired up. Both halves matter: a destination with no
 * credential cannot write, and a credential with no destination has nowhere to
 * write to, so each is only `true` when both are present.
 */
export function configured(): Record<ActionType, boolean> {
  return {
    record: Boolean(process.env.GITHUB_TOKEN?.trim() && githubRepo()),
    signal: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() && telegramChat()),
    archive: Boolean(process.env.NOTION_API_KEY?.trim() && notionDatabase()),
    anchor: Boolean(process.env.SOLANA_PRIVATE_KEY?.trim() && process.env.SOLANA_RPC_URL?.trim()),
  };
}

/**
 * The sentence shown where an unconfigured action would have been. Phrased as
 * a state of this deployment rather than as an error, because it is not one —
 * nothing has gone wrong when an operator has not wired up Notion.
 *
 * The Solana line is worded to match what the spec asks the UI to say, and the
 * other three follow the same shape so no integration reads as more or less
 * broken than the others.
 */
export const NOT_CONFIGURED: Record<ActionType, string> = {
  record: "GitHub is not configured yet. Set GITHUB_TOKEN, GITHUB_OWNER and GITHUB_REPO.",
  signal: "Telegram is not configured yet. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.",
  archive: "Notion is not configured yet. Set NOTION_API_KEY and NOTION_DATABASE_ID.",
  anchor: "Solana proof is not configured yet. Set SOLANA_PRIVATE_KEY and SOLANA_RPC_URL.",
};
