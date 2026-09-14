import type { Case, Hop, HopKind, HopStatus } from "./model";
import { HOP_LABEL, spineKinds, spineOf, stepFor } from "./model";
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
  id: string;
  /** Rendered as a bound, not a permission — "≤ $5,000", not "$5,000 allowed". */
  label: string;
  /** The tool call whose success demonstrates this rule was satisfied. */
  provenTool: string;
  /** Which agent is held to it. */
  role: AgentRole;
}

export const MANDATE_RULES = [
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
] as const satisfies readonly MandateRule[];

/**
 * The Arena's four limits: one destination per agent, and no agent holding more
 * than one key.
 *
 * Same shape, same proof rule, different flow. An Arena run never calls
 * `pay.charge`, so holding it to the AP Clerk's rules would leave the ring at
 * zero on a run that did everything right — the geometry would be reporting on a
 * mandate nobody in that case was ever under.
 *
 * These bind less often than the AP rules do, and that is the honest reading
 * rather than a defect: a clean spreadsheet only needs filing, so only the
 * archivist's limit gets tested. The legend distinguishes a limit that held from
 * one that was never put to the question.
 */
export const ARENA_RULES = [
  {
    id: "repo",
    label: "One repository",
    provenTool: "github.open_issue",
    role: "repo.scribe",
  },
  {
    id: "chat",
    label: "One chat, no broadcast",
    provenTool: "telegram.send_message",
    role: "signal.courier",
  },
  {
    id: "database",
    label: "One database",
    provenTool: "notion.create_entry",
    role: "ledger.archivist",
  },
  {
    id: "cluster",
    label: "Devnet, memo only",
    provenTool: "solana.anchor_memo",
    role: "chain.notary",
  },
] as const satisfies readonly MandateRule[];

/**
 * Which set of limits a case is held to.
 *
 * Read off the spine rather than stored on the case, because the spine IS the
 * flow: a case that runs `observe` is an Arena run and a case that runs `ingest`
 * is an invoice. A separate field saying which one would be a second fact that
 * could drift out of agreement with the record.
 */
export function rulesFor(c: Case): readonly MandateRule[] {
  return spineKinds(c).includes("observe") ? ARENA_RULES : MANDATE_RULES;
}

/** Did this case actually make a verified call to that tool? */
function calledSuccessfully(c: Case, tool: string): boolean {
  return c.hops.some(
    (h) => h.status === "verified" && h.calls.some((call) => call.tool === tool)
  );
}

/** Was the call named, gated, and stopped? Distinct from never being made. */
function calledAndRefused(c: Case, tool: string): boolean {
  return c.hops.some((h) => h.status === "refused" && h.tool === tool);
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
  return rulesFor(c).filter((r) => calledSuccessfully(c, r.provenTool));
}

export function boundRuleCount(c: Case): number {
  return boundRules(c).length;
}

/** Is this specific rule bound yet? Used for the per-rule legend beside the ring. */
export function ruleIsBound(c: Case, id: string): boolean {
  const rule = rulesFor(c).find((r) => r.id === id);
  return rule ? calledSuccessfully(c, rule.provenTool) : false;
}

/**
 * The three things that can be true of a limit, kept apart because two of them
 * are routinely confused.
 *
 *   bound    — a call was made under this rule and went through. It held.
 *   refused  — a call was made and the rule stopped it. It also held, loudly.
 *   untested — no call was made. The rule says nothing about this run.
 *
 * An unlit tick means "untested" far more often than it means "failed", and a
 * legend that renders both the same way invites an operator to read a clean run
 * as a broken one.
 */
export type RuleState = "bound" | "refused" | "untested";

export function ruleStateOf(c: Case, id: string): RuleState {
  const rule = rulesFor(c).find((r) => r.id === id);
  if (!rule) return "untested";
  if (calledSuccessfully(c, rule.provenTool)) return "bound";
  if (calledAndRefused(c, rule.provenTool)) return "refused";
  return "untested";
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
  /**
   * Did the chain END here? Only true for a refusal the spine treats as fatal.
   *
   * The timeline draws a connector from each step to the next, and it must stop
   * at the point the case stopped. "Was this refused" is the wrong test for
   * that, because an Arena run steps over a refused integration and carries on —
   * breaking the connector there would draw a chain that ended when it did not.
   */
  terminal: boolean;
  role: AgentRole;
  agentName: string;
}

/** Who runs each step, for steps that never ran and so carry no role. */
const EXPECTED_ROLE: Record<HopKind, AgentRole> = {
  // AP Clerk spine
  ingest: "mail.reader",
  plan: "orchestrator",
  gate: "comms.poster",
  pay: "pay.clerk",
  notify: "comms.poster",
  proof: "orchestrator",
  // Arena spine. The orchestrator does every reasoning step and holds nothing;
  // each of the four writes belongs to the one agent holding that app's key.
  observe: "orchestrator",
  verify: "orchestrator",
  record: "repo.scribe",
  signal: "signal.courier",
  archive: "ledger.archivist",
  anchor: "chain.notary",
  seal: "orchestrator",
};

export function timeline(c: Case): TimelineStep[] {
  return spineKinds(c).map((kind) => {
    const hop = c.hops.find((h) => h.kind === kind) ?? null;
    const role = hop?.role ?? EXPECTED_ROLE[kind];
    // Default to fatal for a step the spine does not describe, matching the
    // machine's own default. An unrecognised step grants nothing, including
    // permission to keep drawing.
    const halts = (stepFor(c, kind)?.onRefusal ?? "halt") === "halt";
    return {
      kind,
      label: HOP_LABEL[kind],
      hop,
      state: hop ? hop.status : ("unreached" as const),
      terminal: hop?.status === "refused" && halts,
      role,
      agentName: ROSTER[role].name,
    };
  });
}

/**
 * The hop that stopped the chain, if one did. Drives the why-blocked panel.
 *
 * Only refusals that actually halted the case count here. An Arena run where
 * Telegram was unreachable has a refused hop in its chain but was not stopped by
 * it, and pointing the "why blocked" panel at that would claim the run ended
 * when it did not. Those refusals are reported per action instead.
 */
export function refusedHop(c: Case): Hop | null {
  if (c.status === "partial") return null;
  return c.hops.find((h) => h.status === "refused") ?? null;
}

/** Every refused hop, halting or not — the honest count for a run's report. */
export function refusedHops(c: Case): Hop[] {
  return c.hops.filter((h) => h.status === "refused");
}

/**
 * Steps the plan wanted and could not have, because the integration has no
 * credentials. Kept separate from the steps nobody asked for: only this kind of
 * skip is a shortfall, and only this kind belongs in the summary sentence.
 */
export function unconfiguredHops(c: Case): Hop[] {
  return c.hops.filter((h) => h.status === "skipped" && h.skipReason === "unconfigured");
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
  if (c.status === "partial") {
    const failed = refusedHops(c);
    const missing = unconfiguredHops(c);
    const clauses: string[] = [];
    if (failed.length) {
      clauses.push(`${failed.length} refused: ${failed.map((h) => HOP_LABEL[h.kind]).join(", ")}`);
    }
    if (missing.length) {
      clauses.push(
        `${missing.length} not configured: ${missing.map((h) => HOP_LABEL[h.kind]).join(", ")}`
      );
    }
    return `Case finished with ${clauses.join(" and ")}, out of ${spineOf(c).length} steps. The rest were verified and sealed.`;
  }
  if (c.status === "completed") {
    const paid = c.invoice
      ? ` ${c.invoice.vendor} for ${(c.invoice.amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}`
      : "";
    const total = spineOf(c).length;
    const verified = c.hops.filter((h) => h.status === "verified").length;
    if (c.invoice) return `Case completed. All ${total} hops verified and sealed, paying${paid}.`;
    // An Arena run that needed two of its four writes completed cleanly, and
    // saying "all 8 verified" would claim four writes that never happened.
    return verified === total
      ? `Case completed. All ${total} hops verified and sealed.`
      : `Case completed. ${verified} of ${total} hops verified and sealed; the rest were not needed.`;
  }
  const done = c.hops.filter((h) => h.status === "verified").length;
  return `Case running. ${done} of ${spineOf(c).length} hops verified.`;
}
