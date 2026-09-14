import type { Refusal } from "@/lib/mandate/refusal";
import type { Provenance } from "@/lib/tools/types";
import type { AgentRole } from "@/lib/agents/roster";
import type { ArenaDossier } from "@/lib/arena/events";

// =============================================================================
// The Case: one unit of work crossing three apps, and the hop chain that
// records how it went.
//
// A Case is the shared object all four agents read and append to. It is
// append-only: hops are never edited or removed, because the attestation chain
// in lib/proof/attest.ts hashes each hop together with its predecessor. Editing
// hop 3 after the fact breaks hops 4 through 6, visibly.
//
// Pure types + pure transitions. The client renders straight from these.
// =============================================================================

/** The fixed spine of the AP Clerk case. Order is meaning, not decoration. */
export const AP_HOPS = ["ingest", "plan", "gate", "pay", "notify", "proof"] as const;
export type ApHopKind = (typeof AP_HOPS)[number];

/**
 * The Arena spine: an event is observed, verified against a deterministic
 * engine, turned into a plan, then carried out as four independent writes to
 * four different apps, and finally sealed.
 *
 * `plan` is shared with the AP spine on purpose — it means the same thing in
 * both, and giving it a second name would imply a second concept.
 */
export const ARENA_HOPS = [
  "observe",
  "verify",
  "plan",
  "record",
  "signal",
  "archive",
  "anchor",
  "seal",
] as const;
export type ArenaHopKind = (typeof ARENA_HOPS)[number];

export type HopKind = ApHopKind | ArenaHopKind;

/**
 * Kept as an alias rather than deleted: `HOP_ORDER` means "the AP Clerk spine"
 * everywhere it is already used, and that is still exactly what it is. Code
 * that needs the spine of *some* case asks the case — see `spineKinds()`.
 */
export const HOP_ORDER = AP_HOPS;

export const HOP_LABEL: Record<HopKind, string> = {
  ingest: "Ingest",
  plan: "Plan",
  gate: "Human gate",
  pay: "Pay",
  notify: "Notify",
  proof: "Proof",
  observe: "Observe",
  verify: "Verify",
  record: "Record",
  signal: "Signal",
  archive: "Archive",
  anchor: "Anchor",
  seal: "Seal",
};

// --- the spine ---------------------------------------------------------------
// A spine is the ordered list of hops a case is entitled to run, plus what a
// refusal at each one MEANS. That second half is the load-bearing part.
//
// In the AP case every refusal is fatal, and it has to be: you must not pay
// when the human gate said no, and you must not notify that you paid when you
// did not. Each hop there is a precondition for the next.
//
// In the Arena case the four integration hops are siblings, not a chain. GitHub
// being unreachable says nothing about whether Notion should be written. Halting
// the whole case on the first failed integration would destroy evidence of the
// three that succeeded — so those steps record their refusal into the chain and
// the case carries on. The refusal is still sealed, still shown, still counted
// against the run; it just does not pretend to be a reason to stop.
//
// This is the one dimension on which the two flows differ. Everything else —
// the gate, the runner, the hashing — is identical for both.

export type RefusalSeverity = "halt" | "record";

export interface SpineStep {
  kind: HopKind;
  /**
   * `halt` stops the case, because the hops after this one depend on it.
   * `record` seals the refusal and continues, because they do not.
   */
  onRefusal: RefusalSeverity;
}

export type Spine = readonly SpineStep[];

const halting = (kinds: readonly HopKind[]): Spine =>
  kinds.map((kind) => ({ kind, onRefusal: "halt" as const }));

export const AP_SPINE: Spine = halting(AP_HOPS);

export const ARENA_SPINE: Spine = ARENA_HOPS.map((kind) => ({
  kind,
  // The four writes are independent of one another; the reasoning hops that
  // produce the plan, and the seal that closes the record, are not optional.
  onRefusal: (["record", "signal", "archive", "anchor"] as readonly HopKind[]).includes(kind)
    ? ("record" as const)
    : ("halt" as const),
}));

/**
 * The spine of a case. Falls back to the AP spine because cases persisted
 * before spines were data do not carry one, and that is what they were.
 */
export function spineOf(c: Case): Spine {
  return c.spine ?? AP_SPINE;
}

export function spineKinds(c: Case): HopKind[] {
  return spineOf(c).map((s) => s.kind);
}

export function stepFor(c: Case, kind: HopKind): SpineStep | undefined {
  return spineOf(c).find((s) => s.kind === kind);
}

/**
 * A hop kind is *settled* once it has reached an outcome — verified, skipped, or
 * refused at a step whose refusal the spine treats as non-fatal. Ordering is
 * checked against settlement rather than success, so a refused-but-recorded
 * integration does not block the next one. In the AP case a refusal halts, so
 * nothing downstream is ever reached and this reads identically to "verified".
 */
export function settledKinds(c: Case): Set<HopKind> {
  const out = new Set<HopKind>();
  for (const h of c.hops) {
    if (h.status === "verified" || h.status === "skipped") out.add(h.kind);
    else if (h.status === "refused" && stepFor(c, h.kind)?.onRefusal === "record") out.add(h.kind);
  }
  return out;
}

/**
 * Three of these match the three ring states in the design system
 * (MASTER.md §4.2). There is no "error" distinct from "refused": if a hop did
 * not complete, the operator's question is always "what stopped it", and the
 * refusal carries that.
 *
 * `skipped` is the fourth, and it is not a ring state because no authority was
 * exercised for it to report. A skipped hop was never attempted — the planner
 * did not choose that destination, or it has no credentials configured. Filing
 * that as `refused` would be a lie in the operator's favour, because it would
 * claim the gate stopped something that was never asked for; filing it as
 * `verified` would be a lie in the other direction. So it gets its own word,
 * carries a plain-language `note` and no refusal, and settles the hop without
 * advancing the ring.
 */
export type HopStatus = "awaiting" | "verified" | "refused" | "skipped";

/**
 * What the authority ring is able to report. Narrower than `HopStatus` on
 * purpose: the ring animates authority contracting, and a hop nobody attempted
 * contributed no contraction to draw.
 *
 * Mirrors `RingState` in components/seal/AuthorityRing.tsx, which owns its own
 * copy so the design-system primitive does not have to know what a case is. The
 * two must stay identical; TypeScript checks that at the one place they meet,
 * `ringStateOf` → `<AuthorityRing state=…>` in components/case/CaseSeal.tsx.
 */
export type RingState = "awaiting" | "verified" | "refused";

/**
 * One attested tool call. Most hops make exactly one; the human gate makes two
 * (post the proposal, then wait on it), and collapsing those into a single row
 * would lose the argument hash of the second. Every call that left the server
 * gets its own row, and all of them are under the hop's seal.
 */
export interface AttestedCall {
  tool: string;
  argsHash: string;
  resultHash: string | null;
  mandateVersion: number | null;
  provenance: Provenance | null;
}

/**
 * Why a hop was never attempted. The difference matters to the case's final
 * status, so it is recorded rather than inferred from prose:
 *
 *   `unplanned`    — the planner considered this destination and did not choose
 *                    it. Clean data needs no incident issue. Nothing is wrong.
 *   `unconfigured` — the planner wanted it and the credentials are absent. The
 *                    run is incomplete through no decision of its own.
 *
 * It is under the seal (see hopPreimage in lib/proof/attest.ts) precisely
 * because it moves the case between `completed` and `partial`. A field that can
 * change the verdict has to be tamper-evident.
 */
export type SkipReason = "unplanned" | "unconfigured";

export interface Hop {
  /** Position in the chain, 0-based. Also its index in `case.hops`. */
  index: number;
  kind: HopKind;
  /** Which agent ran it, by role; the key is recorded in the attestation. */
  role: AgentRole;
  /** Primary tool, or null for hops that are pure reasoning (plan). */
  tool: string | null;
  status: HopStatus;
  /** Hash of the canonicalised tool input — args are never stored in the open. */
  argsHash: string | null;
  resultHash: string | null;
  /** Every call this hop made, including the primary one. */
  calls: AttestedCall[];
  /** Mandate version in force when this ran. Pins the rules to the moment. */
  mandateVersion: number | null;
  /**
   * Why it stopped. Present iff status === "refused".
   *
   * The WHOLE refusal is kept, not just its kind: the evidence rows
   * (`cap $5,000.00` vs `requested $18,000.00`) and the remedy are what the
   * why-blocked panel renders, and an operator deciding whether to widen a
   * mandate needs the comparison rather than a category name. Storing only the
   * kind here would force the UI to re-derive numbers it cannot see.
   */
  refusal: Refusal | null;
  /** Present iff status === "skipped". */
  skipReason: SkipReason | null;
  provenance: Provenance | null;
  /**
   * One human line for the timeline. On a skipped hop this is the whole
   * explanation — "Notion is not configured yet" — because there is no refusal
   * to expand into a why-blocked panel.
   */
  note: string;
  startedAt: string;
  endedAt: string | null;
  /** Chain linkage, filled by sealHop(). */
  prevHopHash: string | null;
  hopHash: string | null;
}

/**
 * `partial` exists so a run with three successful writes and one refused one
 * cannot be filed as either a success or a failure. Calling it `completed`
 * would overstate it; calling it `halted` would erase the work that landed.
 * Only spines with `record`-severity steps can reach it.
 */
export type CaseStatus = "running" | "completed" | "partial" | "halted";

export interface InvoiceFacts {
  vendor: string;
  amountCents: number;
  dueDate: string;
  reference: string;
  sourceMessageId: string | null;
}

export interface Case {
  id: string;
  /** What this case is for, in one line, for the workspace header. */
  title: string;
  status: CaseStatus;
  /**
   * Which hops this case may run, and what a refusal at each one means.
   * Optional only for records written before the spine was data; `spineOf()`
   * reads those as the AP spine, which is what they were.
   */
  spine?: Spine;
  /** Extracted during ingest/plan; null until then. AP cases only. */
  invoice: InvoiceFacts | null;
  /**
   * The verified event and the action plan, for Arena cases. Sits beside
   * `invoice` for the same reason that does: a case carries the facts its own
   * flow established, and neither flow has to know about the other's.
   */
  arena?: ArenaDossier;
  hops: Hop[];
  createdAt: string;
  /** Set when the chain stops early. Null on a clean completion. */
  haltedReason: string | null;
}

// --- derived views the UI needs ---------------------------------------------

export function lastHop(c: Case): Hop | null {
  return c.hops.length ? c.hops[c.hops.length - 1] : null;
}

/** The next hop the case is entitled to run, or null when the spine is done. */
export function nextHopKind(c: Case): HopKind | null {
  const done = settledKinds(c);
  for (const k of spineKinds(c)) if (!done.has(k)) return k;
  return null;
}

/**
 * How far authority has narrowed, 0..1 — drives AuthorityRing's `narrowing`.
 * Derived from verified hops so the ring in the live timeline and the ring in
 * /about are running the same physics off different drivers (MASTER.md §4.3).
 *
 * Counts verified hops only. A recorded refusal advances the case but does not
 * advance the ring, because the ring reports authority exercised successfully —
 * and a failed write exercised none.
 */
export function narrowingOf(c: Case): number {
  const verified = c.hops.filter((h) => h.status === "verified").length;
  return Math.min(1, verified / Math.max(1, spineOf(c).length));
}

export function ringStateOf(c: Case): RingState {
  if (c.status === "halted") return "refused";
  // A partial run is not a verified one. The ring locks mid-contraction, which
  // is the honest reading: something in this case did not go through.
  if (c.status === "partial") return "refused";
  if (c.status === "completed") return "verified";
  return "awaiting";
}

export function isTerminal(c: Case): boolean {
  return c.status !== "running";
}
