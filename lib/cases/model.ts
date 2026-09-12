import type { Refusal } from "@/lib/mandate/refusal";
import type { Provenance } from "@/lib/tools/types";
import type { AgentRole } from "@/lib/agents/roster";

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
export const HOP_ORDER = ["ingest", "plan", "gate", "pay", "notify", "proof"] as const;
export type HopKind = (typeof HOP_ORDER)[number];

export const HOP_LABEL: Record<HopKind, string> = {
  ingest: "Ingest",
  plan: "Plan",
  gate: "Human gate",
  pay: "Pay",
  notify: "Notify",
  proof: "Proof",
};

/**
 * Three states, matching the three ring states in the design system
 * (MASTER.md §4.2). There is no "error" distinct from "refused": if a hop did
 * not complete, the operator's question is always "what stopped it", and the
 * refusal carries that.
 */
export type HopStatus = "awaiting" | "verified" | "refused";

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
  provenance: Provenance | null;
  /** One human line for the timeline. */
  note: string;
  startedAt: string;
  endedAt: string | null;
  /** Chain linkage, filled by sealHop(). */
  prevHopHash: string | null;
  hopHash: string | null;
}

export type CaseStatus = "running" | "completed" | "halted";

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
  /** Extracted during ingest/plan; null until then. */
  invoice: InvoiceFacts | null;
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
  const done = new Set(c.hops.filter((h) => h.status === "verified").map((h) => h.kind));
  for (const k of HOP_ORDER) if (!done.has(k)) return k;
  return null;
}

/**
 * How far authority has narrowed, 0..1 — drives AuthorityRing's `narrowing`.
 * Derived from verified hops so the ring in the live timeline and the ring in
 * /about are running the same physics off different drivers (MASTER.md §4.3).
 */
export function narrowingOf(c: Case): number {
  const verified = c.hops.filter((h) => h.status === "verified").length;
  return Math.min(1, verified / HOP_ORDER.length);
}

export function ringStateOf(c: Case): HopStatus {
  if (c.status === "halted") return "refused";
  if (c.status === "completed") return "verified";
  return "awaiting";
}

export function isTerminal(c: Case): boolean {
  return c.status !== "running";
}
