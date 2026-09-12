import type { AgentRole } from "@/lib/agents/roster";
import type { Demand, Mandate } from "@/lib/mandate/model";
import { enforce } from "@/lib/mandate/enforce";
import type { Ruling } from "@/lib/mandate/refusal";
import { ALLOW, deny } from "@/lib/mandate/refusal";
import { descriptorFor } from "@/lib/tools/registry";
import type { Provenance } from "@/lib/tools/types";
import { hashArgs, sealHop } from "@/lib/proof/attest";
import type { Case, Hop, HopKind, InvoiceFacts, AttestedCall } from "./model";
import { HOP_ORDER, isTerminal } from "./model";

// =============================================================================
// The case machine. Two rules, both structural:
//
//   1. A hop may only run if every hop before it in HOP_ORDER has verified.
//      This is what stops `pay` from running when `gate` was denied — not a
//      conditional in the orchestrator, which a model could plan its way
//      around, but a precondition checked here on every append.
//
//   2. A halted case accepts no further hops. Agents cannot self-exit: there is
//      no resume(), no force flag, no "retry with override". The only way past
//      a halt is an operator issuing a new mandate and starting a new case.
//
// The machine never mutates: every transition returns a new Case. That keeps
// the attestation chain honest, since a sealed hop can't be reached and edited.
// =============================================================================

export function createCase(id: string, title: string, at: Date = new Date()): Case {
  return {
    id,
    title,
    status: "running",
    invoice: null,
    hops: [],
    createdAt: at.toISOString(),
    haltedReason: null,
  };
}

/** Can this kind of hop run right now? Rule 1 and rule 2, in that order. */
export function canRun(c: Case, kind: HopKind): Ruling {
  if (isTerminal(c)) {
    return deny("predecessor_missing", `This case is ${c.status}; it accepts no further hops.`, {
      remedy: "Start a new case. A halted chain cannot be resumed.",
    });
  }

  const verified = new Set(c.hops.filter((h) => h.status === "verified").map((h) => h.kind));
  const position = HOP_ORDER.indexOf(kind);
  const missing = HOP_ORDER.slice(0, position).filter((k) => !verified.has(k));

  if (missing.length) {
    return deny("predecessor_missing", `${kind} cannot run before ${missing.join(", ")}.`, {
      evidence: {
        label: "Required first",
        allowed: missing.join(", "),
        attempted: kind,
      },
    });
  }

  if (verified.has(kind)) {
    return deny("predecessor_missing", `${kind} has already completed on this case.`, {
      remedy: "Hops are append-only; a completed hop is not re-run.",
    });
  }

  return ALLOW;
}

export interface HopAttempt {
  kind: HopKind;
  role: AgentRole;
  agentPubkey: string;
  /** Null for reasoning-only hops (plan) that call no external tool. */
  tool: string | null;
  input?: unknown;
  demand?: Demand;
  mandate: Mandate | null;
  approval?: "approved" | "denied" | "timeout" | "pending";
  note: string;
  at?: number;
  /** Extra calls this hop made beyond the primary one (see model.AttestedCall). */
  extraCalls?: AttestedCall[];
}

/**
 * The single decision point for whether a hop is permitted: order first, then
 * the mandate. Order comes first because "you cannot pay before the gate" is
 * true regardless of what the pay clerk's mandate says.
 */
export function rule(c: Case, attempt: HopAttempt): Ruling {
  const ordering = canRun(c, attempt.kind);
  if (!ordering.ok) return ordering;

  // Reasoning hops touch nothing external, so there is no tool call to gate.
  // They still get a hop row and still chain — the plan is part of the record.
  if (!attempt.tool) return ALLOW;

  return enforce(
    {
      agentPubkey: attempt.agentPubkey,
      tool: attempt.tool,
      demand: attempt.demand ?? {},
      mandate: attempt.mandate,
      approval: attempt.approval,
      at: attempt.at,
    },
    descriptorFor(attempt.tool)
  );
}

function baseHop(c: Case, attempt: HopAttempt, startedAt: string): Hop {
  const argsHash = attempt.input === undefined ? null : hashArgs(attempt.input);
  return {
    index: c.hops.length,
    kind: attempt.kind,
    role: attempt.role,
    tool: attempt.tool,
    status: "awaiting",
    argsHash,
    resultHash: null,
    calls: [],
    mandateVersion: attempt.mandate?.version ?? null,
    refusal: null,
    provenance: null,
    note: attempt.note,
    startedAt,
    endedAt: null,
    prevHopHash: null,
    hopHash: null,
  };
}

function append(c: Case, hop: Hop): Case {
  const prev = c.hops.length ? c.hops[c.hops.length - 1] : null;
  return { ...c, hops: [...c.hops, sealHop(hop, prev)] };
}

/**
 * Record a refused hop and halt the chain.
 *
 * A refusal is written into the record, not thrown away — the deny path is
 * evidence of the system working, and the judge needs to see it in the
 * timeline. Safe mode: any refusal stops the case.
 */
export function refuse(c: Case, attempt: HopAttempt, ruling: Extract<Ruling, { ok: false }>, at: Date = new Date()): Case {
  const stamp = at.toISOString();
  const hop: Hop = {
    ...baseHop(c, attempt, stamp),
    status: "refused",
    // The whole refusal, evidence and remedy included — it is what the
    // why-blocked panel renders and what the seal below covers.
    refusal: ruling.refusal,
    endedAt: stamp,
  };
  const withHop = append(c, hop);
  return { ...withHop, status: "halted", haltedReason: ruling.refusal.message };
}

/** Record a hop that ran and came back clean. */
export function complete(
  c: Case,
  attempt: HopAttempt,
  result: { output?: unknown; provenance: Provenance },
  at: Date = new Date()
): Case {
  const stamp = at.toISOString();
  const base = baseHop(c, attempt, stamp);
  const resultHash = result.output === undefined ? null : hashArgs(result.output);
  const primary: AttestedCall[] = attempt.tool
    ? [{
        tool: attempt.tool,
        argsHash: base.argsHash ?? hashArgs(null),
        resultHash,
        mandateVersion: base.mandateVersion,
        provenance: result.provenance,
      }]
    : [];

  const hop: Hop = {
    ...base,
    status: "verified",
    resultHash,
    calls: [...primary, ...(attempt.extraCalls ?? [])],
    provenance: result.provenance,
    endedAt: stamp,
  };
  const withHop = append(c, hop);
  const allDone = HOP_ORDER.every((k) =>
    withHop.hops.some((h) => h.kind === k && h.status === "verified")
  );
  return allDone ? { ...withHop, status: "completed" } : withHop;
}

export function withInvoice(c: Case, invoice: InvoiceFacts): Case {
  return { ...c, invoice };
}
