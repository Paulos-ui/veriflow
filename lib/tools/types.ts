import type { z } from "zod";
import type { Demand } from "@/lib/mandate/model";

// =============================================================================
// The tool contract. Every tool in VeriFlow has this shape, and the shape is
// split deliberately in two:
//
//   ToolDescriptor — name, owning key, side effect, input schema, and how to
//                    read a Demand out of the input. Pure data + pure functions.
//                    Safe to import anywhere: tests, the gate, the client.
//
//   ToolExecutor   — the part that actually talks to Gmail / Slack / Stripe and
//                    therefore holds credentials. Lives in its own module with
//                    `import "server-only"` at the top, and is reached only
//                    through a lazy loader (registry.ts).
//
// The split is what makes "the orchestrator never holds app tokens" a fact
// about the module graph rather than a promise in a README. Planning code
// imports descriptors; only the runner imports executors, one at a time, after
// the gate has already ruled.
// =============================================================================

export type SideEffect = "read" | "write";

export interface ToolDescriptor<I = unknown> {
  /** Dotted, domain-named: gmail.find_invoice, slack.post_proposal. */
  name: string;
  /** Delegatee pubkey of the only agent that may call this. */
  agentPubkey: string;
  /**
   * `read` observes; `write` changes the world outside VeriFlow. Writes are the
   * calls that need a proof row someone would defend in a meeting.
   */
  sideEffect: SideEffect;
  /** One line, shown on the hop node in the timeline. */
  summary: string;
  inputSchema: z.ZodType<I>;
  /**
   * Derive the authority this call needs. Returning `{}` claims a call needs no
   * scope and no money — correct only for tools that genuinely read nothing
   * scoped, so it is worth being suspicious of an empty return here.
   */
  demand: (input: I) => Demand;
  /** True when a human gate must have passed before this may run. */
  requiresApproval: boolean;
}

/**
 * Where a result came from. Rendered as a badge on every hop (MASTER.md §8).
 *
 *   live      — a real external app answered, over the network, with credentials.
 *   fixture   — canned demo data stood in because no credential was configured.
 *   simulated — a stand-in that imitates an app's behaviour without calling it.
 *   derived   — computed here, from the operator's own input, by code in this
 *               repository. No external app was involved and none was needed.
 *
 * `derived` exists because the Arena's engines are not fixtures. When somebody
 * uploads a spreadsheet and the checker finds an outlier in it, that is a real
 * result on real data; badging it "Fixture" would tell an operator the number
 * was canned. The distinction an operator actually cares about is whether a
 * result can be trusted, and "our code, your data" is a different answer from
 * "our demo data".
 */
export type Provenance = "live" | "fixture" | "simulated" | "derived";

export interface ToolResult<O = unknown> {
  output: O;
  provenance: Provenance;
  /** Free-form detail for the dossier: message id, charge id, permalink. */
  refs?: Record<string, string>;
}

export type ToolExecutor<I = unknown, O = unknown> = (input: I) => Promise<ToolResult<O>>;

/**
 * Raised by an adapter that cannot honestly run: the operator asked for a live
 * connection and it is missing, expired, or revoked.
 *
 * This is the one place VeriFlow uses a throw to express a refusal, and only
 * because an adapter's return type is a ToolResult — it has no channel for
 * "I did not run". The runner catches it at the boundary and converts it into
 * an `adapter_unavailable` refusal VALUE before anything else sees it, so the
 * property "refusals are values" still holds everywhere above the adapter.
 *
 * It exists so a broken Gmail link FAILS CLOSED with a reason on the record
 * instead of silently serving a recorded invoice as though it were real mail.
 */
export class AdapterUnavailable extends Error {
  /** Machine-readable reason, e.g. "gmail_not_connected". */
  readonly reason: string;
  /** What the operator would have to do about it. */
  readonly remedy: string;
  /** Evidence row heading in the why-blocked panel. "Connection" fits most. */
  readonly label: string;

  constructor(reason: string, message: string, remedy: string, label = "Connection") {
    super(message);
    this.name = "AdapterUnavailable";
    this.reason = reason;
    this.remedy = remedy;
    this.label = label;
  }
}

/** Helper so descriptors keep their input type without restating it. */
export function describeTool<I>(d: ToolDescriptor<I>): ToolDescriptor<I> {
  return d;
}
