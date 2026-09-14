import { createHash } from "node:crypto";
import type { Case, Hop } from "@/lib/cases/model";

// =============================================================================
// The proof chain.
//
// Each hop is hashed together with the hash of the hop before it, so the chain
// is only as editable as its last link. Change the amount on hop 3 and hops 4,
// 5, 6 stop verifying — which is the property that makes the timeline evidence
// rather than a log.
//
// What this proves and what it does not, stated plainly because the reliability
// brief has to say it out loud:
//
//   PROVES  — this sequence of tool calls, with these arguments and these
//             results, was recorded in this order under this mandate version,
//             and has not been altered since.
//   DOES NOT PROVE — that Gmail told the truth, that the vendor is legitimate,
//             or that the human who approved was authorised to. Those are
//             upstream trust decisions; the chain records them, it cannot audit
//             them.
//
// Uses node:crypto, so this is server-side. The client renders hashes it is
// given; it never recomputes them.
// =============================================================================

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Deterministic JSON: keys sorted at every depth, undefined dropped. Two
 * structurally equal objects must hash identically regardless of key order, or
 * the chain would break on a harmless reserialisation.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(sortValue);
  const src = v as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src).sort()) {
    if (src[k] !== undefined) out[k] = sortValue(src[k]);
  }
  return out;
}

export function hashArgs(input: unknown): string {
  return sha256(canonical(input));
}

/** The fields that are under the seal. Anything not listed is not protected. */
function hopPreimage(h: Hop, prev: string | null): string {
  return canonical({
    index: h.index,
    kind: h.kind,
    role: h.role,
    tool: h.tool,
    status: h.status,
    argsHash: h.argsHash,
    resultHash: h.resultHash,
    // Every call the hop made is under the seal, not just the primary one —
    // otherwise the approval wait could be swapped out invisibly.
    calls: (h.calls ?? []).map((c) => ({
      tool: c.tool,
      argsHash: c.argsHash,
      resultHash: c.resultHash,
      mandateVersion: c.mandateVersion,
    })),
    mandateVersion: h.mandateVersion,
    // The ENTIRE refusal is under the seal, not just its kind. The evidence
    // rows are what an operator reads when deciding whether to widen a
    // mandate; if only the kind were hashed, "cap $5,000.00" could be
    // rewritten to "cap $50,000.00" without breaking the chain. The reason a
    // chain stopped is itself evidence, so it has to be tamper-evident.
    refusal: h.refusal
      ? {
          kind: h.refusal.kind,
          message: h.refusal.message,
          evidence: h.refusal.evidence ?? null,
          remedy: h.refusal.remedy ?? null,
        }
      : null,
    // Under the seal because it decides whether the case reads as `completed`
    // or `partial`: rewriting "unconfigured" to "unplanned" would turn a run
    // that could not finish into one that chose not to.
    skipReason: h.skipReason ?? null,
    startedAt: h.startedAt,
    endedAt: h.endedAt,
    prevHopHash: prev,
  });
}

/** Seal a hop against its predecessor. Returns a new hop; never mutates. */
export function sealHop(hop: Hop, prev: Hop | null): Hop {
  const prevHash = prev?.hopHash ?? null;
  const sealed: Hop = { ...hop, prevHopHash: prevHash };
  return { ...sealed, hopHash: sha256(hopPreimage(sealed, prevHash)) };
}

export interface ChainCheck {
  intact: boolean;
  /** Index of the first hop that fails, or null when the chain verifies. */
  brokenAt: number | null;
  reason: string | null;
}

export function verifyChain(c: Case): ChainCheck {
  let prev: Hop | null = null;
  for (const h of c.hops) {
    const expectedPrev = prev?.hopHash ?? null;
    if (h.prevHopHash !== expectedPrev) {
      return { intact: false, brokenAt: h.index, reason: "Hop does not point at its predecessor." };
    }
    if (h.hopHash !== sha256(hopPreimage(h, expectedPrev))) {
      return { intact: false, brokenAt: h.index, reason: "Hop contents do not match its seal." };
    }
    prev = h;
  }
  return { intact: true, brokenAt: null, reason: null };
}

/** One hash standing for the whole case — what gets posted back to Slack. */
export function caseProofHash(c: Case): string {
  return sha256(canonical({ caseId: c.id, tip: lastSealedHash(c), hops: c.hops.length }));
}

function lastSealedHash(c: Case): string | null {
  for (let i = c.hops.length - 1; i >= 0; i--) {
    const h = c.hops[i].hopHash;
    if (h) return h;
  }
  return null;
}
