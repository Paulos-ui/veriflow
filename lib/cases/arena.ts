import "server-only";
import { randomUUID } from "node:crypto";
import type { AgentRole } from "@/lib/agents/roster";
import { ROSTER, arenaMandates } from "@/lib/agents/roster";
import type { ArenaTargets } from "@/lib/agents/roster";
import { NOT_CONFIGURED, arenaTargets, configured } from "@/lib/agents/targets";
import type { Demand } from "@/lib/mandate/model";
import { nowSecs } from "@/lib/mandate/model";
import { runTool } from "@/lib/tools/runner";
import { caseProofHash } from "@/lib/proof/attest";
import type { Case } from "@/lib/cases/model";
import { ARENA_SPINE } from "@/lib/cases/model";
import type { HopAttempt } from "@/lib/cases/machine";
import { complete, createCase, refuse, rule, skip, withArena } from "@/lib/cases/machine";
import { saveCase } from "@/lib/cases/store";
import type {
  ActionOutcome,
  ActionType,
  ArenaDossier,
  Verification,
} from "@/lib/arena/events";
import {
  ACTION_APP,
  ACTION_TYPES,
  EVENT_LABEL,
  VERDICT_LABEL,
  worstSeverity,
} from "@/lib/arena/events";
import type { ColumnProfile } from "@/lib/arena/csv";
import type { DatasetSubmissionInput, GameSubmissionInput } from "@/lib/arena/verify";
import { verifyDataset, verifyGame } from "@/lib/arena/verify";
import { narrate, withNarration } from "@/lib/arena/narrate";
import { planActions } from "@/lib/arena/planner";

// =============================================================================
// The Arena case: one verified event carried across four apps that have never
// heard of each other.
//
// Structurally this is the same run as the AP Clerk case in ap-clerk.ts, and
// that is the point of the whole exercise. Same machine, same gate, same
// hashing, same refusal vocabulary — only the spine and the specialists change.
// If the Arena needed its own version of any of that, the claim that VeriFlow is
// a control plane rather than one hardcoded demo would be false.
//
// Two things differ from the invoice case, both deliberate:
//
//   1. The four writes are SIBLINGS, not a chain. ARENA_SPINE marks them
//      `record` severity, so GitHub being down seals a refusal and the run
//      carries on to Telegram. Halting there would destroy the evidence that
//      three of the four landed, which is the evidence an operator most needs.
//
//   2. Most runs do not want all four. An action the planner declined, and an
//      action whose integration has no credentials, are both `skipped` hops —
//      with different reasons, because one is a decision and the other is a
//      shortfall, and only the second makes the case `partial`.
//
// Every outcome recorded here comes from an adapter that read a confirming
// identifier out of a response body. Nothing in this file can report a success
// the app did not confirm, because nothing in this file constructs a success.
// =============================================================================

export type ArenaSubmission =
  | ({ kind: "game" } & GameSubmissionInput)
  | ({ kind: "dataset" } & DatasetSubmissionInput);

/** One agent per destination. The reason a single prompt cannot reach all four. */
const ACTION_ROLE: Record<ActionType, AgentRole> = {
  record: "repo.scribe",
  signal: "signal.courier",
  archive: "ledger.archivist",
  anchor: "chain.notary",
};

const ACTION_TOOL: Record<ActionType, string> = {
  record: "github.open_issue",
  signal: "telegram.send_message",
  archive: "notion.create_entry",
  anchor: "solana.anchor_memo",
};

/**
 * What the timeline says where a declined action would have been.
 *
 * Written as a statement about the event rather than about the plan, because
 * "no issue was opened, nothing here needs an owner" tells an operator something
 * and "the planner did not select this action" tells them only that software ran.
 */
const UNPLANNED: Record<ActionType, string> = {
  record: "No issue opened. Nothing here needs an owner.",
  signal: "Nobody interrupted. Nothing here is urgent.",
  archive: "Not filed. The plan did not include it.",
  anchor: "Nothing anchored. There is no settled result to commit to.",
};

// --- what each app is told ----------------------------------------------------
// Four different audiences, so four different renderings of the same facts. The
// GitHub body is for someone picking up work; the Telegram text is for someone
// glancing at a phone; the Notion row is for a table; the Solana memo is for a
// stranger checking a hash years from now. The one thing they share is that
// every number in them came from the engine.

function findingLines(v: Verification, bullet: string): string {
  if (!v.findings.length) return `${bullet} Nothing anomalous was found.`;
  return v.findings
    .map((f) => `${bullet} **${f.severity}** — ${f.message}${f.where ? ` (${f.where})` : ""}`)
    .join("\n");
}

function issueTitle(v: Verification): string {
  // The schema caps this at 256; a 200-character filename plus a verdict can
  // exceed that, and a truncated title is better than a refused write.
  return `${v.event.title} — ${VERDICT_LABEL[v.verdict]}`.slice(0, 240);
}

function issueBody(v: Verification, caseId: string): string {
  const counted = v.findings.length;
  return [
    `**Verdict:** ${VERDICT_LABEL[v.verdict]}`,
    `**Outcome:** ${v.outcome}`,
    `**Findings:** ${counted}`,
    "",
    findingLines(v, "-"),
    "",
    v.narration ? `> ${v.narration.text}` : null,
    v.narration && !v.narration.agreedWithEngine
      ? "> \n> The account above disagreed with the engine. The engine's verdict is the one recorded."
      : null,
    "",
    "---",
    `Subject hash \`${v.subjectHash}\``,
    `VeriFlow case \`${caseId}\` · verified ${v.event.occurredAt}`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function alertText(v: Verification): string {
  const worst = worstSeverity(v.findings);
  const critical = v.findings.filter((f) => f.severity === "critical");
  const lines = [
    `VeriFlow — ${EVENT_LABEL[v.event.kind]} ${v.event.id}`,
    `${VERDICT_LABEL[v.verdict]} · ${v.outcome}`,
    "",
    // Only the critical findings go to a phone. Sending all of them would make
    // the one that matters harder to see, which defeats the point of alerting.
    ...critical.map((f) => `! ${f.message}${f.where ? ` (${f.where})` : ""}`),
    "",
    `${v.findings.length} finding${v.findings.length === 1 ? "" : "s"}${worst ? `, worst ${worst}` : ""}`,
    `Subject ${v.subjectHash.slice(0, 16)}…`,
  ];
  return lines.join("\n").slice(0, 4096);
}

/**
 * What goes on a public chain: a version tag, what kind of thing was checked,
 * its id, the verdict, and the hash of the subject. Never the subject itself.
 *
 * It commits to `subjectHash` rather than to the case's proof hash because the
 * case is not sealed yet — the seal hop runs after this one, and it must, since
 * the anchor's own result belongs under the seal. The subject hash is also the
 * more useful commitment: anyone holding the original board or the original file
 * can recompute it and check this memo without holding anything of ours.
 */
function anchorMemo(v: Verification): string {
  return `veriflow:1 ${v.event.kind} ${v.event.id} ${v.verdict} ${v.subjectHash}`;
}

interface Wiring {
  input: Record<string, unknown>;
  demand: Demand;
}

function wire(
  type: ActionType,
  v: Verification,
  targets: ArenaTargets,
  caseId: string,
  idempotencyKey: string
): Wiring {
  switch (type) {
    case "record":
      return {
        input: {
          repo: targets.repo,
          title: issueTitle(v),
          body: issueBody(v, caseId),
          idempotencyKey,
        },
        demand: { repo: targets.repo },
      };
    case "signal":
      return {
        input: { chat: targets.chat, text: alertText(v), idempotencyKey },
        demand: { chat: targets.chat },
      };
    case "archive":
      return {
        input: {
          database: targets.database,
          title: v.event.title,
          outcome: v.outcome,
          findingCount: v.findings.length,
          severity: worstSeverity(v.findings) ?? "none",
          subjectHash: v.subjectHash,
          idempotencyKey,
        },
        demand: { database: targets.database },
      };
    case "anchor":
      return {
        input: { cluster: targets.cluster, memo: anchorMemo(v), idempotencyKey },
        demand: { cluster: targets.cluster },
      };
  }
}

// --- reading a confirmation ---------------------------------------------------
// Each of these reads the identifier the app actually returned. `deduplicated`
// is reported rather than hidden: a second click that found the existing issue
// did the right thing, and saying so is more reassuring than pretending a new
// issue was opened.

interface Deduplicable {
  deduplicated?: boolean;
}

function confirmation(type: ActionType, output: unknown, cluster: string): string {
  const o = (output ?? {}) as Deduplicable & Record<string, unknown>;
  const again = o.deduplicated === true;

  switch (type) {
    case "record":
      return again
        ? `Issue #${o.number} already covered this run. Nothing was opened twice.`
        : `Opened issue #${o.number}.`;
    case "signal":
      return again
        ? `This alert had already been sent. Nothing was repeated.`
        : `Sent the alert to the allowlisted chat.`;
    case "archive":
      return again
        ? `This run was already filed. Nothing was duplicated.`
        : `Filed the run record in Notion.`;
    case "anchor":
      return `Anchored on ${cluster}. Signature ${String(o.signature ?? "").slice(0, 16)}…`;
  }
}

// --- the run ------------------------------------------------------------------

export async function runArenaCase(submission: ArenaSubmission): Promise<Case> {
  const at = nowSecs();
  const targets = arenaTargets();
  const ready = configured();
  // Resolved once and handed to BOTH the mandates and the calls, so a real repo
  // name can never make a correct write look like a scope violation.
  const mandates = arenaMandates(at - 60, targets);

  // Verification happens before the case exists, because the case is TITLED from
  // it. Nothing has been recorded yet and nothing external has been touched — at
  // this point the engines have only read what the browser sent.
  let verification: Verification;
  let columns: ColumnProfile[] | undefined;

  if (submission.kind === "game") {
    verification = verifyGame(submission);
  } else {
    const analysed = verifyDataset(submission);
    verification = analysed.verification;
    columns = analysed.columns;
  }

  // A fresh case id per run, deliberately NOT derived from the event. Re-running
  // the same board is a second run and deserves its own record; what must not
  // happen twice is the WRITE, and the idempotency keys below handle that. A
  // content-derived case id would have the second run overwrite the first, which
  // would delete evidence in the name of tidiness.
  let kase = createCase(
    `case_${randomUUID().slice(0, 8)}`,
    verification.event.title,
    new Date(),
    ARENA_SPINE
  );

  // Filled in as the four writes settle. The dossier below holds this same array,
  // so a run that halts halfway still reports exactly what had happened by then.
  const outcomes: ActionOutcome[] = [];
  let dossier: ArenaDossier | null = null;

  const stop = async (c: Case): Promise<Case> => {
    const withDossier = dossier ? withArena(c, dossier) : c;
    await saveCase(withDossier);
    return withDossier;
  };

  const orchestrator: Pick<HopAttempt, "role" | "agentPubkey" | "mandate" | "tool" | "at"> = {
    role: "orchestrator",
    agentPubkey: ROSTER.orchestrator.agentPubkey,
    mandate: mandates.orchestrator,
    tool: null,
    at,
  };

  // --- hop 1 · observe (what arrived) ---------------------------------------
  // The input hashed here is the RAW submission, in full. `baseHop` hashes it and
  // keeps only the digest, so a two-megabyte upload costs 64 characters in the
  // record and still commits to every byte of what was sent. Splitting observe
  // from verify is what lets an auditor see that the thing verified is the thing
  // that arrived, rather than something substituted in between.
  const observeAttempt: HopAttempt = {
    ...orchestrator,
    kind: "observe",
    input: submission,
    note:
      submission.kind === "game"
        ? `Took delivery of a ${submission.moves.length}-move game log. Nothing is established yet.`
        : `Took delivery of ${submission.filename}. Nothing is established yet.`,
  };

  const observeRuling = rule(kase, observeAttempt);
  if (!observeRuling.ok) return stop(refuse(kase, observeAttempt, observeRuling));

  kase = complete(kase, observeAttempt, {
    output: { kind: submission.kind },
    provenance: "derived",
  });

  // --- hop 2 · verify (what the engine established) -------------------------
  const verifyAttempt: HopAttempt = {
    ...orchestrator,
    kind: "verify",
    input: verification.event.subject,
    note: `${verification.outcome} ${verification.findings.length} finding${
      verification.findings.length === 1 ? "" : "s"
    }.`,
  };

  const verifyRuling = rule(kase, verifyAttempt);
  if (!verifyRuling.ok) return stop(refuse(kase, verifyAttempt, verifyRuling));

  kase = complete(kase, verifyAttempt, {
    output: {
      verdict: verification.verdict,
      findings: verification.findings,
      subjectHash: verification.subjectHash,
    },
    // Our code, the operator's data, no external app in the loop. See the
    // Provenance doc in lib/tools/types.ts for why this is not "fixture".
    provenance: "derived",
  });

  // --- narration (not a hop, and under the seal anyway) ---------------------
  // The only place a model touches an Arena event, and it runs here: after the
  // verdict exists, so it cannot shape what it is describing, and before the
  // plan, so the plan panel and the summary agree.
  //
  // It gets no hop of its own because it has no authority and no side effect.
  // A hop would place it in the chain of custody, and it is commentary on that
  // chain, not a link in it. It is still hashed into the seal hop below, so an
  // account edited after the fact stops matching the record.
  const narration = await narrate(verification);
  verification = withNarration(verification, narration);

  // --- hop 3 · plan (what the run intends to do) ----------------------------
  const plan = await planActions(verification);
  dossier = { verification, plan, outcomes, ...(columns ? { columns } : {}) };

  const planAttempt: HopAttempt = {
    ...orchestrator,
    kind: "plan",
    input: { actions: plan.actions.map((a) => a.type), method: plan.method },
    note: plan.actions.length
      ? `${plan.rationale} Reaching ${plan.actions.map((a) => ACTION_APP[a.type]).join(", ")}.`
      : plan.rationale,
  };

  const planRuling = rule(kase, planAttempt);
  if (!planRuling.ok) return stop(refuse(kase, planAttempt, planRuling));

  kase = complete(kase, planAttempt, {
    output: { actions: plan.actions },
    provenance: plan.method === "model" ? "live" : "derived",
  });

  // --- hops 4-7 · the four writes -------------------------------------------
  // One loop, four apps, three branches, no special cases. The order is the
  // spine's order so the plan panel and the timeline read the same way down.
  for (const type of ACTION_TYPES) {
    const role = ACTION_ROLE[type];
    const base = {
      kind: type,
      role,
      agentPubkey: ROSTER[role].agentPubkey,
      mandate: mandates[role],
      at,
    } as const;

    const planned = plan.actions.find((a) => a.type === type);

    // Branch 1 — the planner considered this and declined. Nothing is wrong.
    if (!planned) {
      const note = UNPLANNED[type];
      kase = skip(kase, { ...base, tool: null, note }, "unplanned");
      outcomes.push({ type, status: "skipped", provenance: null, refs: {}, note, refusal: null });
      continue;
    }

    // Branch 2 — the plan wanted it and this deployment cannot do it. Attempting
    // the call to produce a nicer-looking error would be theatre: we already know
    // there is no credential, and the honest record is that the run fell short.
    if (!ready[type]) {
      const note = NOT_CONFIGURED[type];
      kase = skip(kase, { ...base, tool: null, note }, "unconfigured");
      outcomes.push({ type, status: "skipped", provenance: null, refs: {}, note, refusal: null });
      continue;
    }

    // Branch 3 — run it. Gate first, adapter second, always in that order.
    const tool = ACTION_TOOL[type];
    const { input, demand } = wire(type, verification, targets, kase.id, planned.idempotencyKey);
    const attempt: HopAttempt = {
      ...base,
      tool,
      input,
      demand,
      note: `${ACTION_APP[type]} — ${planned.reason}`,
    };

    const ruling = rule(kase, attempt);
    if (!ruling.ok) {
      kase = refuse(kase, attempt, ruling);
      outcomes.push({
        type,
        status: "refused",
        provenance: null,
        refs: {},
        note: ruling.refusal.message,
        refusal: ruling.refusal,
      });
      continue;
    }

    const run = await runTool({
      agentPubkey: base.agentPubkey,
      tool,
      input,
      mandate: base.mandate,
      at,
    });

    if (!run.ok) {
      // A failed write is sealed into the chain and the run continues. The next
      // app has no dependency on this one, and deleting three successes because
      // of one failure would be the most expensive kind of dishonesty here.
      kase = refuse(kase, attempt, run.ruling);
      outcomes.push({
        type,
        status: "refused",
        provenance: null,
        refs: {},
        note: run.ruling.refusal.message,
        refusal: run.ruling.refusal,
      });
      continue;
    }

    const note = confirmation(type, run.result.output, targets.cluster);
    kase = complete(
      kase,
      { ...attempt, note },
      { output: run.result.output, provenance: run.result.provenance }
    );
    outcomes.push({
      type,
      status: "succeeded",
      provenance: run.result.provenance,
      refs: run.result.refs ?? {},
      note,
      refusal: null,
    });
  }

  // --- hop 8 · seal ---------------------------------------------------------
  // Everything the run concluded, hashed against everything before it. The
  // narration is in here by name: it is the one part of the record a model
  // wrote, so it is the part most worth making tamper-evident.
  const sealAttempt: HopAttempt = {
    ...orchestrator,
    kind: "seal",
    input: {
      caseId: kase.id,
      subjectHash: verification.subjectHash,
      verdict: verification.verdict,
      narration: narration.text,
      narrationMethod: narration.method,
      agreedWithEngine: narration.agreedWithEngine,
      outcomes: outcomes.map((o) => ({ type: o.type, status: o.status, note: o.note })),
    },
    note: "Sealed the chain. Every hop is hashed against its predecessor.",
  };

  const sealRuling = rule(kase, sealAttempt);
  if (!sealRuling.ok) return stop(refuse(kase, sealAttempt, sealRuling));

  kase = complete(kase, sealAttempt, {
    output: { proofHash: caseProofHash(kase) },
    provenance: "derived",
  });

  return stop(kase);
}
