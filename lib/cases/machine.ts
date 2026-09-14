import type { AgentRole } from "@/lib/agents/roster";
import type { Demand, Mandate } from "@/lib/mandate/model";
import { enforce } from "@/lib/mandate/enforce";
import type { Ruling } from "@/lib/mandate/refusal";
import { ALLOW, deny } from "@/lib/mandate/refusal";
import { descriptorFor } from "@/lib/tools/registry";
import type { Provenance } from "@/lib/tools/types";
import { hashArgs, sealHop } from "@/lib/proof/attest";
import type { Case, Hop, HopKind, InvoiceFacts, AttestedCall, SkipReason, Spine } from "./model";
import { AP_SPINE, isTerminal, settledKinds, spineKinds, stepFor } from "./model";
import type { ArenaDossier } from "@/lib/arena/events";

// =============================================================================
// The case machine. Two rules, both structural:
//
//   1. A hop may only run if every hop before it in the case's spine has
//      SETTLED. This is what stops `pay` from running when `gate` was denied —
//      not a conditional in the orchestrator, which a model could plan its way
//      around, but a precondition checked here on every append.
//
//   2. A halted case accepts no further hops. Agents cannot self-exit: there is
//      no resume(), no force flag, no "retry with override". The only way past
//      a halt is an operator issuing a new mandate and starting a new case.
//
// "Settled" rather than "verified" because a spine may declare a step's refusal
// non-fatal — see RefusalSeverity in model.ts. In the AP case every refusal
// halts, so nothing downstream is ever reachable and the two readings coincide.
// In the Arena case the four integration writes are independent, and one of them
// failing must not delete the evidence that the others succeeded.
//
// The machine never mutates: every transition returns a new Case. That keeps
// the attestation chain honest, since a sealed hop can't be reached and edited.
// =============================================================================

export function createCase(
  id: string,
  title: string,
  at: Date = new Date(),
  spine: Spine = AP_SPINE
): Case {
  return {
    id,
    title,
    status: "running",
    spine,
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

  const settled = settledKinds(c);
  const order = spineKinds(c);
  const position = order.indexOf(kind);

  // A hop kind that is not in this case's spine is refused rather than being
  // appended somewhere arbitrary. An AP hop has no meaning in an Arena chain.
  if (position < 0) {
    return deny("predecessor_missing", `${kind} is not a hop in this case's spine.`, {
      evidence: { label: "Spine", allowed: order.join(" → "), attempted: kind },
    });
  }

  const missing = order.slice(0, position).filter((k) => !settled.has(k));

  if (missing.length) {
    return deny("predecessor_missing", `${kind} cannot run before ${missing.join(", ")}.`, {
      evidence: {
        label: "Required first",
        allowed: missing.join(", "),
        attempted: kind,
      },
    });
  }

  if (settled.has(kind)) {
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
    skipReason: null,
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
 * Close the case if its spine is fully settled.
 *
 * `completed` means every step either verified or was deliberately not needed.
 * `partial` means every step settled but the run did not do everything it set
 * out to: a write was refused, or a destination the plan wanted had no
 * credentials. Three writes landing and one not is neither a success nor a
 * failure, and the status says so rather than rounding to the nearer one.
 */
function settle(c: Case): Case {
  const settled = settledKinds(c);
  if (!spineKinds(c).every((k) => settled.has(k))) return c;

  const shortfall = c.hops.some(
    (h) =>
      (h.status === "refused" && stepFor(c, h.kind)?.onRefusal === "record") ||
      (h.status === "skipped" && h.skipReason === "unconfigured")
  );
  return shortfall ? { ...c, status: "partial" } : { ...c, status: "completed" };
}

/**
 * Record a refused hop.
 *
 * A refusal is written into the record, not thrown away — the deny path is
 * evidence of the system working, and the judge needs to see it in the
 * timeline. Whether it also STOPS the case is the spine's decision, not this
 * function's: a refusal at a step the rest of the chain depends on halts
 * everything, and a refusal at an independent step is sealed and stepped over.
 *
 * Either way the refusal is under the seal and counted against the run. The
 * severity changes what happens next, never whether it is recorded.
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

  // Default to halting when a spine does not mention this step. Failing closed
  // on an unrecognised hop kind is the same instinct as the gate's: an absent
  // rule grants nothing, including permission to carry on.
  const severity = stepFor(c, attempt.kind)?.onRefusal ?? "halt";
  if (severity === "halt") {
    return { ...withHop, status: "halted", haltedReason: ruling.refusal.message };
  }
  return settle(withHop);
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
  return settle(append(c, hop));
}

/**
 * Record a hop that was never attempted.
 *
 * The Arena plans four writes and rarely wants all four. A hop that nobody
 * asked for has to end up SOMEWHERE in the chain, because the spine is fixed
 * and the case cannot close while a step is unsettled — and the two obvious
 * places to put it are both dishonest. Marking it verified claims a write that
 * never happened. Marking it refused claims the gate stopped something, when
 * the gate was never consulted; it would also inflate the refusal count, which
 * is the number this whole product asks people to trust.
 *
 * So it is skipped: settled, sealed, visible in the timeline, and carrying its
 * own reason. No tool was named and no mandate was consulted, so there is
 * nothing here to enforce — only the ordering rule applies, and a skip that
 * breaks ordering is a refusal like any other.
 */
export function skip(
  c: Case,
  attempt: HopAttempt,
  reason: SkipReason,
  at: Date = new Date()
): Case {
  const ordering = canRun(c, attempt.kind);
  if (!ordering.ok) return refuse(c, attempt, ordering, at);

  const stamp = at.toISOString();
  const hop: Hop = {
    ...baseHop(c, attempt, stamp),
    tool: null, // nothing was called, so nothing is attested
    status: "skipped",
    argsHash: null,
    skipReason: reason,
    endedAt: stamp,
  };
  return settle(append(c, hop));
}

export function withInvoice(c: Case, invoice: InvoiceFacts): Case {
  return { ...c, invoice };
}

/** Attach the Arena's verified event, plan and per-action outcomes. */
export function withArena(c: Case, arena: ArenaDossier): Case {
  return { ...c, arena };
}
