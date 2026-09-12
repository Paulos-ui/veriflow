import { z } from "zod";

// =============================================================================
// Refusal taxonomy — the reason a tool call did not leave the server.
//
// Refusals are VALUES, never exceptions. A thrown error can be swallowed by a
// stray try/catch three frames up; a returned discriminated union has to be
// destructured, and the `never` check at the bottom of this file means adding a
// refusal kind without handling it is a compile error.
//
// Every refusal carries the numbers behind it, so the "why blocked" panel can
// show `cap $5,000.00 vs requested $7,400.00` rather than a category name. An
// operator deciding whether to widen a mandate needs the comparison, not a code.
// =============================================================================

export const RefusalKind = z.enum([
  "unknown_tool",          // no such tool in the registry — fail closed on typos
  "tool_not_in_mandate",   // tool exists, but this agent's mandate omits it
  "wrong_agent",           // tool is bound to a different agent than the caller
  "mandate_missing",       // agent has no mandate at all — zero authority
  "mandate_expired",       // not_after_secs has passed
  "mandate_revoked",       // operator pulled it
  "scope_mismatch",        // sender / channel / vendor outside the allowlist
  "cap_exceeded",          // amount over batch_cap_cents
  "approval_denied",       // a human said no at the gate
  "approval_timeout",      // the gate deadline passed — silence is NOT consent
  "predecessor_missing",   // hop order violated; cannot pay before the gate
  "invalid_input",         // args failed the tool's own schema — never executed
  "adapter_unavailable",   // credentials absent and no fixture to fall back to
]);
export type RefusalKind = z.infer<typeof RefusalKind>;

/** A refusal, with the evidence an operator needs to act on it. */
export interface Refusal {
  kind: RefusalKind;
  /** One plain sentence. Never an error code, never an apology. */
  message: string;
  /** The comparison that produced the refusal, rendered side by side in the UI. */
  evidence?: {
    label: string;
    allowed: string;
    attempted: string;
  };
  /** What the operator would have to change for this to pass. */
  remedy?: string;
}

export type Allowed = { ok: true };
export type Denied = { ok: false; refusal: Refusal };

/**
 * The outcome of a gate. Named `Ruling`, not `Verdict`, because `Verdict` is
 * already taken in types/index.ts for the model's approve|reject|needs_review
 * opinion. Those are different things and must never be confused: a Verdict is
 * what the agent *thinks*, a Ruling is what the mandate *permits*. A model can
 * return "approve" and still be refused here.
 */
export type Ruling = Allowed | Denied;

export const ALLOW: Allowed = { ok: true };

export function deny(
  kind: RefusalKind,
  message: string,
  extra?: { evidence?: Refusal["evidence"]; remedy?: string }
): Denied {
  return { ok: false, refusal: { kind, message, ...extra } };
}

/** Money, formatted the way the evidence rows expect it. */
export function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/**
 * Human copy for a refusal kind. Used by the why-blocked panel heading and by
 * the Slack notification when a chain stops.
 *
 * The `never` in the default arm is the point: add a kind to RefusalKind
 * without adding a heading here and the build fails.
 */
export function refusalHeading(kind: RefusalKind): string {
  switch (kind) {
    case "unknown_tool":         return "Unknown tool";
    case "tool_not_in_mandate":  return "Tool not in mandate";
    case "wrong_agent":          return "Wrong agent";
    case "mandate_missing":      return "No mandate";
    case "mandate_expired":      return "Mandate expired";
    case "mandate_revoked":      return "Mandate revoked";
    case "scope_mismatch":       return "Outside scope";
    case "cap_exceeded":         return "Over cap";
    case "approval_denied":      return "Approval denied";
    case "approval_timeout":     return "Approval timed out";
    case "predecessor_missing":  return "Out of order";
    case "invalid_input":        return "Malformed call";
    case "adapter_unavailable":  return "Adapter unavailable";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
