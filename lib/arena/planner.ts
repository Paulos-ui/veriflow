import "server-only";
import { z } from "zod";
import type { ActionPlan, ActionType, PlannedAction, Verification } from "./events";
import { ACTION_LABEL, ACTION_TYPES, isAlarming, worstSeverity } from "./events";

// =============================================================================
// The action planner: from a verified event to a list of writes.
//
// The rule this module is built around, and the only one that really matters:
//
//     THE MODEL MAY NARROW THE PLAN. IT MAY NEVER WIDEN IT.
//
// Policy below decides what is permitted for an event. The model is then asked
// what it would do, and its answer is intersected with that permission — so an
// action policy did not allow cannot be argued into existence, no matter how
// convincing the justification. A model that asks for something outside the
// ceiling does not get it; it gets a line in the rationale saying it asked.
//
// This is the same shape as the mandate gate one layer down, applied a layer up.
// The gate stops an agent exceeding its authority at the moment of the call; this
// stops a plan exceeding its authority before a call is ever proposed. Neither
// relies on the model behaving.
//
// One action is required rather than permitted. Every verified event is archived,
// because a ledger with discretionary gaps is not a ledger — and "the model
// decided this one was not worth recording" is exactly the gap that makes an
// audit trail worthless.
// =============================================================================

const Proposed = z.object({
  actions: z.array(z.string()).max(ACTION_TYPES.length),
  reason: z.string().min(1).max(400),
});

const MODEL = "llama-3.3-70b-versatile";

/** Filed always. See the header: a ledger with holes in it is not evidence. */
const REQUIRED: readonly ActionType[] = ["archive"] as const;

// --- policy ---------------------------------------------------------------------

/**
 * What this event permits, and why — the ceiling the model cannot exceed.
 *
 * The distinction between `record` and `signal` is deliberate and is the part
 * worth reading: a GitHub issue is a queue and a Telegram message is an
 * interruption. Anything that needs work earns a queue entry. Only something
 * critical earns the right to interrupt a person. Collapsing the two would
 * either lose real problems in a backlog or train everyone to ignore the alerts.
 */
export function permitted(v: Verification): Map<ActionType, string> {
  const out = new Map<ActionType, string>();
  const worst = worstSeverity(v.findings);
  const counted = v.findings.length;

  out.set(
    "archive",
    `Every verified event is filed. This one: ${v.outcome.toLowerCase().replace(/\.$/, "")}.`
  );

  if (worst === "warning" || worst === "critical") {
    out.set(
      "record",
      `${counted} finding${counted === 1 ? "" : "s"} at ${worst} need an owner and a place to be tracked.`
    );
  }

  if (isAlarming(v.findings)) {
    out.set("signal", "A critical finding is worth interrupting someone for.");
  }

  // An unfinished game has no result to commit to, and anchoring a hash of
  // "we do not know yet" would put a claim on a public ledger that says nothing.
  if (v.verdict !== "unfinished") {
    out.set("anchor", `The result is settled, so it can be proved later without trusting us.`);
  }

  return out;
}

/**
 * The reference plan: everything the event permits.
 *
 * Runs the Arena end to end with no API key, and is what the model's proposal is
 * measured against. Not a fallback stub — the fallback IS the reference, which is
 * the only arrangement where falling back cannot quietly lower the standard.
 */
export function planDeterministically(v: Verification): ActionPlan {
  const allowed = permitted(v);
  const actions = order([...allowed.keys()]).map((type) => action(type, allowed.get(type) ?? "", v));

  return {
    actions,
    method: "deterministic",
    rationale: `Policy permits ${actions.length} of ${ACTION_TYPES.length} actions for this event.`,
  };
}

// --- helpers --------------------------------------------------------------------

/** Spine order, so the plan panel and the timeline read top-to-bottom alike. */
function order(types: ActionType[]): ActionType[] {
  return ACTION_TYPES.filter((t) => types.includes(t));
}

function action(type: ActionType, reason: string, v: Verification): PlannedAction {
  return {
    type,
    reason,
    // Derived from the event, which is itself derived from the subject — so a
    // double-click, a retry, and a re-run of the identical event all produce the
    // same key, and the adapters de-duplicate on it.
    idempotencyKey: `${v.event.id}-${type}`,
  };
}

function readTypes(raw: string[]): ActionType[] {
  const known = new Set<string>(ACTION_TYPES);
  const out: ActionType[] = [];
  for (const value of raw) {
    const cleaned = value.trim().toLowerCase();
    if (known.has(cleaned) && !out.includes(cleaned as ActionType)) out.push(cleaned as ActionType);
  }
  return out;
}

// --- the prompt -----------------------------------------------------------------

function instructions(allowed: Map<ActionType, string>): string {
  const menu = [...allowed.keys()].map((t) => `"${t}" (${ACTION_LABEL[t]})`).join(", ");
  return [
    "You are deciding which follow-up actions a verified event deserves.",
    `The only actions available for this event are: ${menu}.`,
    `You may choose fewer than all of them. You may not choose anything else; any other name is discarded.`,
    `"archive" always happens and does not need to be chosen.`,
    "Leave out an action when it would be noise — a routine result does not need to interrupt anyone.",
    `Reply ONLY with JSON: {"actions": string[], "reason": string}.`,
    '"reason" is one sentence explaining the choice, under 400 characters.',
  ].join(" ");
}

function brief(v: Verification): string {
  const findings = v.findings.length
    ? v.findings.map((f) => `- [${f.severity}] ${f.message}`).join("\n")
    : "(none)";
  return [
    `Kind: ${v.event.kind}`,
    `Outcome: ${v.outcome}`,
    `Verdict: ${v.verdict}`,
    "",
    "Findings:",
    findings,
  ].join("\n");
}

// --- the planner ----------------------------------------------------------------

export async function planActions(v: Verification): Promise<ActionPlan> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return planDeterministically(v);

  const allowed = permitted(v);

  try {
    const { default: Groq } = await import("groq-sdk");
    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: instructions(allowed) },
        { role: "user", content: brief(v) },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = Proposed.safeParse(JSON.parse(raw));
    if (!parsed.success) return planDeterministically(v);

    const wanted = readTypes(parsed.data.actions);

    // The intersection. Anything the model asked for that policy does not permit
    // is dropped here and named in the rationale — an over-reach that is refused
    // and visible is worth more to an operator than one that never appears.
    const overreach = wanted.filter((t) => !allowed.has(t));
    const chosen = order([...new Set([...REQUIRED, ...wanted.filter((t) => allowed.has(t))])]);

    const declined = [...allowed.keys()].filter((t) => !chosen.includes(t));

    const notes = [parsed.data.reason.trim()];
    if (declined.length) {
      notes.push(`Left out: ${declined.map((t) => ACTION_LABEL[t].toLowerCase()).join(", ")}.`);
    }
    if (overreach.length) {
      notes.push(
        `Asked for ${overreach.join(", ")}, which policy does not permit for this event; dropped.`
      );
    }

    return {
      actions: chosen.map((type) => action(type, allowed.get(type) ?? "", v)),
      method: "model",
      rationale: notes.join(" "),
    };
  } catch {
    return planDeterministically(v);
  }
}
