import type { Case, Hop, HopKind, HopStatus } from "./model";
import { HOP_ORDER, HOP_LABEL } from "./model";
import type { AgentRole } from "@/lib/agents/roster";
import { ROSTER } from "@/lib/agents/roster";

// =============================================================================
// Derived views for the workspace UI.
//
// Pure, client-safe, no `server-only`: the components render straight from
// these and never recompute a hash or re-run a policy check. Everything here is
// read out of a Case that the server already sealed — if a value cannot be
// derived from stored hops, it does not belong in this file.
//
// The reason this module exists at all: the timeline needs to say WHICH mandate
// rule bound at each step, and that claim has to come from the record rather
// than from a hand-maintained script of what "should" have happened.
// =============================================================================

/**
 * The four rules that narrow the AP Clerk's authority, in the order they bind.
 *
 * Each names the tool whose successful call proves it held. That mapping is the
 * honest one: a rule is "bound" when a hop that was actually gated on it
 * verified — not when we reached a step where we assume it applied.
 *
 * Deliberately four, matching AuthorityRing's default `totalRules`: one bezel
 * tick per rule, so the ring's geometry is a literal count of bound authority
 * rather than a decorative arc.
 */
export interface MandateRule {
  id: "sender" | "channel" | "approval" | "vendor";
  /** Rendered as a bound, not a permission — "≤ $5,000", not "$5,000 allowed". */
  label: string;
  /** The tool call whose success demonstrates this rule was satisfied. */
  provenTool: string;
  /** Which agent is held to it. */
  role: AgentRole;
}

export const MANDATE_RULES: readonly MandateRule[] = [
  {
    id: "sender",
    label: "Sender allowlist",
    provenTool: "gmail.find_invoice",
    role: "mail.reader",
  },
  {
    id: "channel",
    label: "One approval channel",
    provenTool: "slack.post_proposal",
    role: "comms.poster",
  },
  {
    id: "approval",
    label: "Human approval",
    provenTool: "slack.await_approval",
    role: "comms.poster",
  },
  {
    id: "vendor",
    label: "Vendor allowlist + cap",
    provenTool: "pay.charge",
    role: "pay.clerk",
  },
] as const;

/** Did this case actually make a verified call to that tool? */
function calledSuccessfully(c: Case, tool: string): boolean {
  return c.hops.some(
    (h) => h.status === "verified" && h.calls.some((call) => call.tool === tool)
  );
}

/**
 * Which rules have bound, in order. Drives the bezel ticks on AuthorityRing.
 *
 * Note what this does NOT do: it never marks the vendor/cap rule bound on a
 * case that halted at the pay hop. The refused payment made no successful
 * `pay.charge` call, so the tick stays unlit and the ring stays visibly
 * incomplete — the geometry and the refusal agree because both read the same
 * record.
 */
export function boundRules(c: Case): MandateRule[] {
  return MANDATE_RULES.filter((r) => calledSuccessfully(c, r.provenTool));
}

export function boundRuleCount(c: Case): number {
  return boundRules(c).length;
}

/** Is this specific rule bound yet? Used for the per-rule legend beside the ring. */
export function ruleIsBound(c: Case, id: MandateRule["id"]): boolean {
  const rule = MANDATE_RULES.find((r) => r.id === id);
  return rule ? calledSuccessfully(c, rule.provenTool) : false;
}

// --- timeline shape ----------------------------------------------------------

/**
 * A row in the timeline: either a hop that ran, or a step the case never
 * reached. Pending steps are rendered, not hidden — an operator needs to see
 * that `notify` and `proof` never happened when a payment was refused. A
 * timeline that silently ends at the refusal reads like the case finished.
 */
export interface TimelineStep {
  kind: HopKind;
  label: string;
  /** The hop, if this step ran. Null for steps the chain never reached. */
  hop: Hop | null;
  /** "unreached" is distinct from "awaiting": nothing is pending, the chain stopped. */
  state: HopStatus | "unreached";
  role: AgentRole;
  agentName: string;
}

/** Who runs each step of the AP Clerk spine, for steps that never ran. */
const EXPECTED_ROLE: Record<HopKind, AgentRole> = {
  ingest: "mail.reader",
  plan: "orchestrator",
  gate: "comms.poster",
  pay: "pay.clerk",
  notify: "comms.poster",
  proof: "orchestrator",
};

export function timeline(c: Case): TimelineStep[] {
  return HOP_ORDER.map((kind) => {
    const hop = c.hops.find((h) => h.kind === kind) ?? null;
    const role = hop?.role ?? EXPECTED_ROLE[kind];
    return {
      kind,
      label: HOP_LABEL[kind],
      hop,
      state: hop ? hop.status : ("unreached" as const),
      role,
      agentName: ROSTER[role].name,
    };
  });
}

/** The hop that stopped the chain, if one did. Drives the why-blocked panel. */
export function refusedHop(c: Case): Hop | null {
  return c.hops.find((h) => h.status === "refused") ?? null;
}

/**
 * Agents that actually did work in this case, in first-touch order.
 * The roster header shows all four; this is for "three specialists ran this".
 */
export function participatingRoles(c: Case): AgentRole[] {
  const seen: AgentRole[] = [];
  for (const h of c.hops) if (!seen.includes(h.role)) seen.push(h.role);
  return seen;
}

// --- formatting the evidence surface ----------------------------------------

/**
 * Hash display: head and tail, never a silent truncation (MASTER.md §7).
 * The full value is always one click away in the proof panel.
 */
export function shortHash(hash: string | null, head = 10, tail = 6): string {
  if (!hash) return "—";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

/**
 * A complete sentence for the live region, not a bare status word.
 *
 * Screen-reader users get the same information sighted operators read off the
 * ring geometry: what happened, to which step, and why it stopped.
 */
export function announce(c: Case): string {
  const blocked = refusedHop(c);
  if (blocked) {
    return `Case halted at ${HOP_LABEL[blocked.kind]}. ${blocked.refusal?.message ?? "The chain stopped."}`;
  }
  if (c.status === "completed") {
    const paid = c.invoice
      ? ` ${c.invoice.vendor} for ${(c.invoice.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`
      : "";
    return `Case completed. All six hops verified and sealed, paying${paid}.`;
  }
  const done = c.hops.filter((h) => h.status === "verified").length;
  return `Case running. ${done} of ${HOP_ORDER.length} hops verified.`;
}
