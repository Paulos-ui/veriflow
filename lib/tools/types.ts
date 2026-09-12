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

/** Where a result came from. Rendered as a badge on every hop (MASTER.md §8). */
export type Provenance = "live" | "fixture" | "simulated";

export interface ToolResult<O = unknown> {
  output: O;
  provenance: Provenance;
  /** Free-form detail for the dossier: message id, charge id, permalink. */
  refs?: Record<string, string>;
}

export type ToolExecutor<I = unknown, O = unknown> = (input: I) => Promise<ToolResult<O>>;

/** Helper so descriptors keep their input type without restating it. */
export function describeTool<I>(d: ToolDescriptor<I>): ToolDescriptor<I> {
  return d;
}
