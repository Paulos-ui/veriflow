import type { Refusal } from "@/lib/mandate/refusal";
import type { Provenance } from "@/lib/tools/types";

// =============================================================================
// The Arena vocabulary: one event shape, one finding shape, one action shape.
//
// Two very different things happen in the Arena — somebody plays a game, and
// somebody uploads a spreadsheet — and the whole point is that they converge
// here. A finished game and a validated dataset both become a VerificationEvent
// with findings attached, and from that point on there is exactly one pipeline:
//
//     event → verification → plan → actions → sealed chain
//
// If these were two systems, the second one would drift: a different idea of
// what "verified" means, a different way of recording a failed write, a second
// place to audit. Sharing the model is what keeps one audit trail honest.
//
// Pure types and pure functions. No credentials, no I/O, no `server-only` — the
// Arena UI renders findings straight from these, and the engine tests import
// them without pulling an adapter into the process.
// =============================================================================

/** What was verified. Add a kind here and the whole pipeline carries it. */
export type EventKind = "game" | "dataset";

export const EVENT_LABEL: Record<EventKind, string> = {
  game: "Game",
  dataset: "Dataset",
};

/**
 * The four things VeriFlow can do about a verified event, one per external app.
 *
 * These names are deliberately the same strings as the Arena hop kinds in
 * lib/cases/model.ts. One vocabulary: the action the planner chose, the hop that
 * carried it out, and the row in the report are all called the same thing, so
 * nothing has to be translated between layers and then kept in sync.
 */
export const ACTION_TYPES = ["record", "signal", "archive", "anchor"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_LABEL: Record<ActionType, string> = {
  record: "Open a GitHub issue",
  signal: "Send a Telegram message",
  archive: "Write a Notion entry",
  anchor: "Anchor a Solana memo",
};

/** Which app each action touches. Shown on the plan so the reach is visible. */
export const ACTION_APP: Record<ActionType, string> = {
  record: "GitHub",
  signal: "Telegram",
  archive: "Notion",
  anchor: "Solana devnet",
};

export type Severity = "info" | "warning" | "critical";

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

/**
 * The engine's conclusion reduced to one token — the thing the model's account
 * is checked against.
 *
 * `Narration.agreedWithEngine` has to mean something, and it cannot mean "the
 * prose sounded right", because comparing free text is guesswork. So the model
 * is asked for a verdict from this fixed list alongside its sentences, and the
 * two tokens are compared exactly. Disagreement is kept and shown; the engine's
 * verdict is the one that counts.
 *
 * The two halves are not equally hard, and it would be dishonest to present them
 * as the same test. For a game the model is handed the move log and the board
 * and nothing else, so naming the winner is real work it can genuinely get
 * wrong. For a dataset it is handed the findings, so agreeing is easy and the
 * check only catches a summary that misreports what it was given. Both are
 * worth having; only the first is a test of reasoning.
 */
export type GameVerdict = "x_won" | "o_won" | "drawn" | "unfinished" | "illegal";
export type DatasetVerdict = "clean" | "minor" | "anomalous" | "unusable";
export type Verdict = GameVerdict | DatasetVerdict;

export const GAME_VERDICTS: readonly GameVerdict[] = [
  "x_won",
  "o_won",
  "drawn",
  "unfinished",
  "illegal",
] as const;

export const DATASET_VERDICTS: readonly DatasetVerdict[] = [
  "clean",
  "minor",
  "anomalous",
  "unusable",
] as const;

export function verdictsFor(kind: EventKind): readonly Verdict[] {
  return kind === "game" ? GAME_VERDICTS : DATASET_VERDICTS;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  x_won: "X won",
  o_won: "O won",
  drawn: "Drawn",
  unfinished: "Unfinished",
  illegal: "Illegal game",
  clean: "Clean",
  minor: "Minor notes",
  anomalous: "Anomalies found",
  unusable: "Unusable",
};

/**
 * One thing the deterministic engine noticed. Findings are the unit of evidence
 * in the Arena, and they are produced by code, never by a model.
 *
 * `code` is stable and machine-readable so a finding can be counted and
 * compared across runs; `message` is the sentence a human reads. Both are under
 * the seal once the event is hashed.
 */
export interface Finding {
  /** Stable identifier, e.g. `amount_outlier`, `illegal_move`. */
  code: string;
  severity: Severity;
  /** One plain sentence. States what is wrong, not what to feel about it. */
  message: string;
  /** Where it was found: `row 42`, `column amount`, `move 5`. */
  where?: string;
}

export interface VerificationEvent {
  id: string;
  kind: EventKind;
  /** One line for the activity list: "Game 7f3a — X won in 5 moves". */
  title: string;
  occurredAt: string;
  /**
   * The canonical thing being verified: the final board, or the dataset's
   * shape and row digest. Hashed into `subjectHash`, so this is what the
   * on-chain anchor actually commits to.
   */
  subject: Record<string, unknown>;
}

/**
 * The model's account of the event, kept strictly separate from the engine's.
 *
 * `agreedWithEngine` is the field that matters. The engine decides the outcome;
 * the model only describes it. When the two disagree we keep the engine's
 * answer, keep the model's text, and say so on the page — a disagreement is
 * information about the model, and hiding it would waste the one cheap check we
 * get on whether the narration can be trusted at all.
 */
export interface Narration {
  text: string;
  method: "model" | "deterministic";
  agreedWithEngine: boolean;
  /** The verdict the model reached on its own, or null when it gave none. */
  claimed: Verdict | null;
  /** Which model produced it, or null when the deterministic writer did. */
  model: string | null;
}

export interface Verification {
  event: VerificationEvent;
  /**
   * The engine's conclusion, in one line. Produced by pure code in
   * lib/arena/tictactoe.ts or lib/arena/csv.ts. Never produced by a model.
   */
  outcome: string;
  /** The same conclusion as one token, for checking the narration against. */
  verdict: Verdict;
  findings: Finding[];
  /** sha256 of the canonical subject. What the anchor commits to. */
  subjectHash: string;
  narration: Narration | null;
}

export interface PlannedAction {
  type: ActionType;
  /** Why the planner chose this action, in one line, for the plan panel. */
  reason: string;
  /**
   * Stable across retries and double-clicks: derived from the event id and the
   * action type, so asking twice for the same action on the same event produces
   * the same key. Adapters pass it to whichever de-duplication the app offers.
   */
  idempotencyKey: string;
}

export interface ActionPlan {
  actions: PlannedAction[];
  method: "model" | "deterministic";
  rationale: string;
}

/**
 * What actually happened when an action ran.
 *
 * `succeeded` is only ever set from a confirmed API response — see the adapters,
 * which read the identifier out of the response body rather than treating a
 * 2xx as proof. `skipped` covers both an action the planner did not choose and
 * one whose integration has no credentials; `note` says which, because to an
 * operator those are completely different facts. There is no status that means
 * "probably worked".
 */
export interface ActionOutcome {
  type: ActionType;
  status: "succeeded" | "refused" | "skipped";
  provenance: Provenance | null;
  /** What the app returned: issue url, message id, transaction signature. */
  refs: Record<string, string>;
  /** One plain line. On a skip this is the whole story. */
  note: string;
  /** Present iff status is `refused`. Carries the evidence and the remedy. */
  refusal: Refusal | null;
}

/** Everything the Arena established about one run, carried on the Case. */
export interface ArenaDossier {
  verification: Verification;
  plan: ActionPlan;
  outcomes: ActionOutcome[];
  /**
   * Per-column statistics, for dataset runs only. Not part of the sealed
   * subject — see DatasetVerification in lib/arena/verify.ts for why.
   */
  columns?: DatasetColumn[];
}

/**
 * The column shape the UI renders. Structurally the profile produced by
 * lib/arena/csv.ts, re-declared here so a client component can import the
 * dossier's types without pulling the parser in with them.
 */
export interface DatasetColumn {
  name: string;
  index: number;
  type: "number" | "date" | "text" | "empty";
  filled: number;
  blank: number;
  distinct: number;
  numeric: { min: number; max: number; mean: number; median: number; mad: number } | null;
}

/**
 * What one integration can and cannot do in THIS deployment.
 *
 * `target` is the single destination the agent's mandate allows — a repository
 * name, a chat id, a database id, a cluster. None of those is a secret and all
 * of them are already on the mandate the UI renders; the token that would make
 * them usable is never in this shape and never leaves the server.
 *
 * `hint` is what to show instead of a result when `configured` is false. It says
 * which variable is missing, because "not configured" with no remedy is a dead
 * end for whoever is trying to set this up.
 */
export interface IntegrationStatus {
  type: ActionType;
  app: string;
  action: string;
  agent: string;
  charter: string;
  configured: boolean;
  target: string;
  hint: string | null;
}

/** The whole answer from GET /api/arena/integrations. */
export interface IntegrationReport {
  integrations: IntegrationStatus[];
  /** Whether a model will write the summary and the plan, or the fallbacks will. */
  reasoning: { configured: boolean; hint: string | null };
}

// --- derived views -----------------------------------------------------------

export function worstSeverity(findings: Finding[]): Severity | null {
  let worst: Severity | null = null;
  for (const f of findings) {
    if (!worst || SEVERITY_RANK[f.severity] > SEVERITY_RANK[worst]) worst = f.severity;
  }
  return worst;
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const out: Record<Severity, number> = { info: 0, warning: 0, critical: 0 };
  for (const f of findings) out[f.severity] += 1;
  return out;
}

/** Findings worth waking someone up for. Drives whether `signal` is planned. */
export function isAlarming(findings: Finding[]): boolean {
  return findings.some((f) => f.severity === "critical");
}

export function outcomeFor(d: ArenaDossier, type: ActionType): ActionOutcome | undefined {
  return d.outcomes.find((o) => o.type === type);
}

/** "3 of 4 actions confirmed" — the one number the report leads with. */
export function actionTally(d: ArenaDossier): { confirmed: number; attempted: number } {
  const attempted = d.outcomes.filter((o) => o.status !== "skipped").length;
  const confirmed = d.outcomes.filter((o) => o.status === "succeeded").length;
  return { confirmed, attempted };
}
