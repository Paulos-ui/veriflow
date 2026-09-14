import "server-only";
import { z } from "zod";
import type { Narration, Verdict, Verification } from "./events";
import { VERDICT_LABEL, verdictsFor } from "./events";

// =============================================================================
// The narrator. Writes the sentence a human reads, and gets checked while it
// does it.
//
// This is the only place a model touches an Arena event, and it runs last, after
// the verdict already exists. The ordering is the safeguard: a narrator that ran
// first could shape the record it was supposed to be describing.
//
// The model is asked for two things at once — prose, and a verdict token from a
// closed list. The prose is what the page shows. The token is what makes
// `agreedWithEngine` a fact rather than a decoration: it is compared to the
// engine's verdict exactly, and a mismatch is kept and displayed rather than
// quietly resolved. The engine's answer always wins; the model's is never
// written into `Verification.verdict`.
//
// For games this is a real test. The prompt carries the board and the move log
// and withholds the outcome, so naming the winner is work the model can fail —
// and a model that confidently miscounts a diagonal is exactly the failure this
// product exists to catch. For datasets the findings are in the prompt, so
// agreement is easy and the check only catches a summary that misreports what it
// was handed. Worth having, but not the same test, and the UI should not imply
// that it is.
//
// GROQ_API_KEY is read here. It is a reasoning credential, not an app credential:
// no mandate grants access to it, because nothing it can do is a side effect. If
// it is absent the deterministic writer below produces the sentence instead, and
// `method` says which one ran.
// =============================================================================

const MODEL = "llama-3.3-70b-versatile";

/** Long enough to say what happened, short enough that nobody skims past it. */
const MAX_CHARS = 420;

const Told = z.object({
  text: z.string().min(1),
  verdict: z.string().min(1),
});

// --- the deterministic writer ---------------------------------------------------

/**
 * Not a stub. This runs the whole Arena with no API key configured, and it is
 * also what the model falls back to on a malformed reply — so the page never has
 * an empty summary and never has an invented one.
 */
export function narrateDeterministically(v: Verification): Narration {
  const counted = v.findings.length;
  const noun = counted === 1 ? "finding" : "findings";
  const worst = v.findings.filter((f) => f.severity === "critical").length;

  const detail = counted
    ? `${counted} ${noun}${worst ? `, ${worst} of them critical` : ""}.`
    : "Nothing anomalous was found.";

  return {
    text: `${v.outcome} ${detail}`,
    method: "deterministic",
    // Written FROM the engine's verdict, so agreement is trivially true and
    // claiming otherwise would be false modesty. There is no second opinion here
    // because there is no second opinion to have.
    agreedWithEngine: true,
    claimed: v.verdict,
    model: null,
  };
}

// --- the prompt -----------------------------------------------------------------

function subjectLines(v: Verification): string {
  return Object.entries(v.event.subject)
    .map(([k, value]) => `${k}: ${String(value)}`)
    .join("\n");
}

function findingLines(v: Verification): string {
  if (!v.findings.length) return "(none)";
  return v.findings
    .map((f) => `- [${f.severity}] ${f.message}${f.where ? ` (${f.where})` : ""}`)
    .join("\n");
}

function instructions(v: Verification): string {
  const allowed = verdictsFor(v.event.kind).join('", "');
  const shared = [
    `Reply ONLY with JSON: {"text": string, "verdict": string}.`,
    `"verdict" must be exactly one of: "${allowed}".`,
    `"text" is at most two sentences and under ${MAX_CHARS} characters, in plain English, for an operator scanning a record.`,
    "Do not speculate about causes. Do not recommend actions. Do not use bullet points.",
  ];

  if (v.event.kind === "game") {
    return [
      "You are reading the record of a finished tic-tac-toe game. X moved first.",
      "The board is three rows separated by |, where · is an empty square.",
      "Work out the result yourself from the board and the move log. You have not been told it.",
      'Use "illegal" if the listed problems show the game broke the rules.',
      ...shared,
    ].join(" ");
  }

  return [
    "You are summarising an automated check of an uploaded CSV file.",
    "The findings below were produced by deterministic code. Report them faithfully; do not add findings of your own and do not drop any.",
    'Choose the verdict that matches the most severe finding: "unusable" for critical, "anomalous" for warning, "minor" for info, "clean" for none.',
    ...shared,
  ].join(" ");
}

// --- the check ------------------------------------------------------------------

/** A verdict the model returned, if it is one this kind of event can have. */
function readVerdict(raw: string, v: Verification): Verdict | null {
  const cleaned = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const allowed = verdictsFor(v.event.kind);
  return (allowed as readonly string[]).includes(cleaned) ? (cleaned as Verdict) : null;
}

// --- the tool -------------------------------------------------------------------

export async function narrate(v: Verification): Promise<Narration> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return narrateDeterministically(v);

  try {
    const { default: Groq } = await import("groq-sdk");
    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: instructions(v) },
        {
          role: "user",
          content: `${subjectLines(v)}\n\nProblems found by the checker:\n${findingLines(v)}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = Told.safeParse(JSON.parse(raw));
    if (!parsed.success) return narrateDeterministically(v);

    const claimed = readVerdict(parsed.data.verdict, v);

    // A verdict outside the list is not a disagreement, it is an unusable
    // reply — there is nothing to compare. Falling back keeps the page honest
    // rather than displaying a mismatch the model never actually asserted.
    if (!claimed) return narrateDeterministically(v);

    const agreedWithEngine = claimed === v.verdict;
    const text = parsed.data.text.trim().slice(0, MAX_CHARS);

    return {
      // When the two disagree, the model's prose is kept AND labelled. Replacing
      // it would hide the disagreement, which is the one piece of evidence we
      // get about whether this narrator can be trusted at all.
      text: agreedWithEngine
        ? text
        : `${text} (This account says ${VERDICT_LABEL[claimed]}; the engine found ${VERDICT_LABEL[v.verdict]}.)`,
      method: "model",
      agreedWithEngine,
      claimed,
      model: MODEL,
    };
  } catch {
    return narrateDeterministically(v);
  }
}

/** Attach a narration to a verification. Returns a new object; never mutates. */
export function withNarration(v: Verification, narration: Narration): Verification {
  return { ...v, narration };
}
