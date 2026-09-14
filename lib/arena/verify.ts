import "server-only";
import { z } from "zod";
import { canonical, sha256 } from "@/lib/proof/attest";
import type {
  DatasetVerdict,
  Finding,
  GameVerdict,
  Verification,
  VerificationEvent,
} from "./events";
import { worstSeverity } from "./events";
import { analyseDataset, MAX_BYTES } from "./csv";
import type { ColumnProfile } from "./csv";
import type { Move } from "./tictactoe";
import { BOARD_SIZE, auditMachinePlay, describeOutcome, replay } from "./tictactoe";

// =============================================================================
// The verifier: untrusted submission in, sealed Verification out.
//
// Everything that arrives here came from a browser, which means none of it is
// evidence yet. A move log is not a game and an uploaded file is not a dataset —
// they are claims. This module turns a claim into a finding of fact by re-deriving
// the result from the raw input with the pure engines, and it is the only place
// in the Arena entitled to say what happened.
//
// No model is called from this file. Narration is a separate step
// (lib/arena/narrate.ts) that runs AFTER the verdict exists, precisely so the
// model cannot influence it — you cannot check an answer against a reference the
// answer helped write.
//
// One detail that looks arbitrary and is not: the game's `subject` carries the
// board and the move log but NOT the winner. The subject is what the narrator is
// shown, and a subject containing "winner: X" would turn the model's verdict into
// a copying exercise. The conclusion lives in `outcome` and `verdict`, beside the
// subject rather than inside it.
// =============================================================================

// --- submissions --------------------------------------------------------------
// Parsed with Zod at the boundary. A malformed body is rejected here rather than
// reaching an engine that would have to guess what a half-present move meant.

export const GameSubmission = z.object({
  moves: z
    .array(
      z.object({
        index: z.number().int().min(0).max(BOARD_SIZE - 1),
        mark: z.enum(["X", "O"]),
      })
    )
    // A legal game is at most nine moves. Longer logs are not rejected outright
    // — a few extra moves are exactly the tampering the replay is meant to
    // catch — but the cap stops an unbounded array from reaching the engine.
    .max(64),
});

export const DatasetSubmission = z.object({
  filename: z.string().trim().min(1).max(200),
  text: z.string().max(MAX_BYTES * 2),
});

export type GameSubmissionInput = z.infer<typeof GameSubmission>;
export type DatasetSubmissionInput = z.infer<typeof DatasetSubmission>;

// --- identity -----------------------------------------------------------------

/**
 * The event id is derived from the subject, not from a clock or a counter.
 *
 * That makes the whole pipeline idempotent for free: the same board verified
 * twice produces the same id, therefore the same action keys, therefore the same
 * GitHub issue rather than a second one. Double-clicking the run button, or a
 * retry after a dropped connection, lands on the existing record.
 *
 * The cost is real and worth stating: two people who play the identical game
 * share an id, and the second run will find the first one's issue already open.
 * That is the correct behaviour for a proof — the subject is the same, so the
 * proof is the same — but it does mean the id identifies the thing verified, not
 * the occasion of verifying it. `occurredAt` is deliberately left out of the
 * hash for that reason.
 */
function identify(subject: Record<string, unknown>): { id: string; subjectHash: string } {
  const subjectHash = sha256(canonical(subject));
  return { id: subjectHash.slice(0, 12), subjectHash };
}

// --- games ---------------------------------------------------------------------

/** `X·O|··X|O··` — compact, readable, and stable enough to hash. */
function renderBoard(cells: readonly (string | null)[]): string {
  const row = (start: number) =>
    cells
      .slice(start, start + 3)
      .map((c) => c ?? "·")
      .join("");
  return [row(0), row(3), row(6)].join("|");
}

function renderMoves(moves: readonly Move[]): string {
  return moves.map((m) => `${m.mark}${m.index}`).join(" ");
}

function gameVerdict(r: ReturnType<typeof replay>): GameVerdict {
  // Illegality outranks the result. A board showing three X's in a row is not a
  // win if one of those X's was played out of turn, and reporting it as one
  // would make the seal vouch for a cheated game.
  if (r.findings.some((f) => f.severity === "critical")) return "illegal";
  if (r.outcome.kind === "win") return r.outcome.winner === "X" ? "x_won" : "o_won";
  if (r.outcome.kind === "draw") return "drawn";
  return "unfinished";
}

export function verifyGame(
  submission: GameSubmissionInput,
  occurredAt: Date = new Date()
): Verification {
  const moves = submission.moves as Move[];
  const result = replay(moves);

  // Two independent passes over the same log: the replay establishes whether the
  // game was legal, the audit asks whether the opponent played well. They are
  // separate because a weak reply is a fact about our code and an illegal move
  // is a fact about the submission, and merging them would blur which is which.
  const findings: Finding[] = [...result.findings, ...auditMachinePlay(moves)];

  const subject = {
    game: "tic-tac-toe",
    board: renderBoard(result.board),
    moves: renderMoves(result.accepted),
    movesSubmitted: moves.length,
    movesAccepted: result.accepted.length,
  };

  const { id, subjectHash } = identify(subject);
  const verdict = gameVerdict(result);

  const event: VerificationEvent = {
    id,
    kind: "game",
    title: `Game ${id.slice(0, 6)} — ${describeOutcome(result)}`,
    occurredAt: occurredAt.toISOString(),
    subject,
  };

  return {
    event,
    outcome: describeOutcome(result),
    verdict,
    findings,
    subjectHash,
    narration: null,
  };
}

// --- datasets -------------------------------------------------------------------

function datasetVerdict(findings: Finding[]): DatasetVerdict {
  const worst = worstSeverity(findings);
  if (!worst) return "clean";
  if (worst === "critical") return "unusable";
  if (worst === "warning") return "anomalous";
  return "minor";
}

/**
 * The verification plus the column profile.
 *
 * The profile is what makes the Verify page worth looking at — row counts, a
 * type per column, how many cells are blank — and it is deliberately NOT part of
 * the sealed subject. The subject has to stay small enough to read at a glance
 * and stable enough to hash; a table of statistics is neither, and it is fully
 * re-derivable from the file anyway.
 */
export interface DatasetVerification {
  verification: Verification;
  columns: ColumnProfile[];
}

export function verifyDataset(
  submission: DatasetSubmissionInput,
  occurredAt: Date = new Date()
): DatasetVerification {
  const report = analyseDataset(submission.text);

  const subject = {
    file: submission.filename,
    rows: report.rowCount,
    columns: report.columns.map((c) => `${c.name}:${c.type}`).join(","),
    truncated: report.truncated,
    // The anchor has to commit to the actual bytes, not to a summary of them.
    // Without this, two different spreadsheets with the same shape would hash
    // identically and the on-chain memo would prove nothing about the contents.
    datasetHash: sha256(submission.text),
  };

  const { id, subjectHash } = identify(subject);

  const event: VerificationEvent = {
    id,
    kind: "dataset",
    title: `${submission.filename} — ${report.rowCount.toLocaleString()} rows`,
    occurredAt: occurredAt.toISOString(),
    subject,
  };

  return {
    verification: {
      event,
      outcome: report.outcome,
      verdict: datasetVerdict(report.findings),
      findings: report.findings,
      subjectHash,
      narration: null,
    },
    columns: report.columns,
  };
}
