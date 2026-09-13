import "server-only";
import { randomUUID } from "node:crypto";
import type { Case } from "@/lib/cases/model";
import type { HopAttempt } from "@/lib/cases/machine";
import { createCase, rule, refuse, complete, withInvoice } from "@/lib/cases/machine";
import { ROSTER, defaultMandates } from "@/lib/agents/roster";
import { approvalChannel } from "@/lib/agents/channel";
import { nowSecs } from "@/lib/mandate/model";
import { runTool } from "@/lib/tools/runner";
import { planCase } from "@/lib/agents/orchestrator";
import { caseProofHash, hashArgs } from "@/lib/proof/attest";
import { saveCase } from "@/lib/cases/store";
import type { InvoiceMessage } from "@/lib/tools/gmail";
import type { Approval } from "@/lib/tools/slack";
import { fixtureFor } from "@/lib/tools/fixtures";

// =============================================================================
// The AP Clerk case: one invoice carried across Gmail → Slack → payment, with
// every hop ruled on before it runs and recorded after.
//
// The shape of every hop below is identical and deliberate:
//
//     const attempt = { ...what the agent wants to do... };
//     const ruling  = rule(kase, attempt);
//     if (!ruling.ok) return halt(refuse(kase, attempt, ruling));
//     const out     = await runTool({ ...same thing... });
//
// There is no branch anywhere that skips the ruling, and `halt` is the only
// exit from a refusal — an agent cannot decide to continue past its own denial.
// A refusal is a normal, recorded outcome, not an exception.
// =============================================================================

// The approval channel is resolved once, here, and handed to BOTH the mandate
// that allowlists it and the calls that target it. One value, so a real channel
// id cannot make a correct post look like a scope violation.
const CHANNEL = approvalChannel();
const LABEL = "INBOX/Invoices";
const APPROVAL_WINDOW_SECS = 120;

export interface RunOptions {
  /** Which fixture to ingest when Gmail credentials are absent. */
  invoiceKey?: "aurora" | "meridian" | "halcyon";
  /** Demo-mode approval outcome. Ignored when a real Slack token is present. */
  demoApproval?: "approve" | "deny" | "silence";
}

export async function runApClerkCase(opts: RunOptions = {}): Promise<Case> {
  const invoiceKey = opts.invoiceKey ?? "aurora";
  const fixture = fixtureFor(invoiceKey);
  const at = nowSecs();
  const mandates = defaultMandates(at - 60, { approvalChannel: CHANNEL });

  let kase = createCase(
    `case_${randomUUID().slice(0, 8)}`,
    `${fixture.facts.vendor} — ${fixture.facts.reference}`
  );

  const halt = async (c: Case): Promise<Case> => {
    await saveCase(c);
    return c;
  };

  // --- hop 1 · ingest (Gmail, mail reader) ----------------------------------
  const ingestInput = { sender: fixture.sender, label: LABEL, query: "has:attachment invoice" };
  const ingestAttempt: HopAttempt = {
    kind: "ingest",
    role: "mail.reader",
    agentPubkey: ROSTER["mail.reader"].agentPubkey,
    tool: "gmail.find_invoice",
    input: ingestInput,
    demand: { gmailSender: fixture.sender, gmailLabel: LABEL },
    mandate: mandates["mail.reader"],
    note: `Searched ${LABEL} for an invoice from ${fixture.sender}.`,
    at,
  };

  const ingestRuling = rule(kase, ingestAttempt);
  if (!ingestRuling.ok) return halt(refuse(kase, ingestAttempt, ingestRuling));

  const ingestRun = await runTool({
    agentPubkey: ROSTER["mail.reader"].agentPubkey,
    tool: "gmail.find_invoice",
    input: ingestInput,
    mandate: mandates["mail.reader"],
    at,
  });
  if (!ingestRun.ok) return halt(refuse(kase, ingestAttempt, ingestRun.ruling));

  const message = ingestRun.result.output as InvoiceMessage;
  kase = complete(kase, { ...ingestAttempt, note: `Found "${message.subject}".` }, {
    output: ingestRun.result.output,
    provenance: ingestRun.result.provenance,
  });

  // --- hop 2 · plan (orchestrator, no tool, no tokens) ----------------------
  const plan = await planCase(message);
  const planAttempt: HopAttempt = {
    kind: "plan",
    role: "orchestrator",
    agentPubkey: ROSTER.orchestrator.agentPubkey,
    tool: null,
    input: { subject: message.subject, messageId: message.messageId },
    mandate: mandates.orchestrator,
    note: `${plan.rationale} Proposing payment to ${plan.facts.vendor}.`,
    at,
  };

  const planRuling = rule(kase, planAttempt);
  if (!planRuling.ok) return halt(refuse(kase, planAttempt, planRuling));

  kase = withInvoice(
    complete(kase, planAttempt, { output: plan.facts, provenance: plan.method === "model" ? "live" : "fixture" }),
    plan.facts
  );

  // --- hop 3 · gate (Slack, comms poster) -----------------------------------
  // Two calls under one hop: post the proposal, then wait on it. Both are
  // attested; see model.AttestedCall for why they aren't collapsed into one.
  const proposalInput = {
    channel: CHANNEL,
    caseId: kase.id,
    vendor: plan.facts.vendor,
    amountCents: plan.facts.amountCents,
    dueDate: plan.facts.dueDate,
  };
  const gateAttempt: HopAttempt = {
    kind: "gate",
    role: "comms.poster",
    agentPubkey: ROSTER["comms.poster"].agentPubkey,
    tool: "slack.post_proposal",
    input: proposalInput,
    demand: { slackChannel: CHANNEL },
    mandate: mandates["comms.poster"],
    note: `Posted the proposal to the approval channel.`,
    at,
  };

  const gateRuling = rule(kase, gateAttempt);
  if (!gateRuling.ok) return halt(refuse(kase, gateAttempt, gateRuling));

  const proposalRun = await runTool({
    agentPubkey: ROSTER["comms.poster"].agentPubkey,
    tool: "slack.post_proposal",
    input: proposalInput,
    mandate: mandates["comms.poster"],
    at,
  });
  if (!proposalRun.ok) return halt(refuse(kase, gateAttempt, proposalRun.ruling));

  const posted = proposalRun.result.output as { messageTs: string };
  // In demo mode the marker rides on the ts so the waiter can resolve it;
  // with a real token the reaction on the real message decides.
  const marker =
    opts.demoApproval === "deny" ? "-deny" : opts.demoApproval === "silence" ? "" : "-approve";
  const waitInput = {
    channel: CHANNEL,
    messageTs: proposalRun.result.provenance === "live" ? posted.messageTs : `${posted.messageTs}${marker}`,
    deadlineSecs: APPROVAL_WINDOW_SECS,
  };

  const waitRun = await runTool({
    agentPubkey: ROSTER["comms.poster"].agentPubkey,
    tool: "slack.await_approval",
    input: waitInput,
    mandate: mandates["comms.poster"],
    at,
  });
  if (!waitRun.ok) return halt(refuse(kase, gateAttempt, waitRun.ruling));

  const decision = (waitRun.result.output as { approval: Approval }).approval;
  const gateNote =
    decision === "approved"
      ? "A human approved the payment in the channel."
      : decision === "denied"
        ? "A human denied the payment in the channel."
        : "The approval window closed with no answer.";

  kase = complete(
    kase,
    {
      ...gateAttempt,
      note: gateNote,
      extraCalls: [
        {
          tool: "slack.await_approval",
          argsHash: hashArgs(waitInput),
          resultHash: hashArgs(waitRun.result.output),
          mandateVersion: mandates["comms.poster"].version,
          provenance: waitRun.result.provenance,
        },
      ],
    },
    { output: proposalRun.result.output, provenance: proposalRun.result.provenance }
  );

  // --- hop 4 · pay (pay clerk) ----------------------------------------------
  const approval = decision === "approved" ? "approved" : decision === "denied" ? "denied" : "timeout";
  const chargeInput = {
    vendor: plan.facts.vendor,
    amountCents: plan.facts.amountCents,
    reference: plan.facts.reference,
    idempotencyKey: `${kase.id}-pay-01`,
  };
  const payAttempt: HopAttempt = {
    kind: "pay",
    role: "pay.clerk",
    agentPubkey: ROSTER["pay.clerk"].agentPubkey,
    tool: "pay.charge",
    input: chargeInput,
    demand: { vendor: plan.facts.vendor, amountCents: plan.facts.amountCents },
    mandate: mandates["pay.clerk"],
    approval,
    note: `Paying ${plan.facts.vendor}.`,
    at,
  };

  const payRuling = rule(kase, payAttempt);
  if (!payRuling.ok) return halt(refuse(kase, payAttempt, payRuling));

  const payRun = await runTool({
    agentPubkey: ROSTER["pay.clerk"].agentPubkey,
    tool: "pay.charge",
    input: chargeInput,
    mandate: mandates["pay.clerk"],
    approval,
    at,
  });
  if (!payRun.ok) return halt(refuse(kase, payAttempt, payRun.ruling));

  const charged = payRun.result.output as { chargeId: string; status: string };
  kase = complete(
    kase,
    { ...payAttempt, note: `Paid ${plan.facts.vendor} (${charged.status}).` },
    { output: payRun.result.output, provenance: payRun.result.provenance }
  );

  // --- hop 5 · notify (Slack, comms poster) ---------------------------------
  const proofHash = caseProofHash(kase);
  const proofInput = { channel: CHANNEL, caseId: kase.id, proofHash };
  const notifyAttempt: HopAttempt = {
    kind: "notify",
    role: "comms.poster",
    agentPubkey: ROSTER["comms.poster"].agentPubkey,
    tool: "slack.post_proof",
    input: proofInput,
    demand: { slackChannel: CHANNEL },
    mandate: mandates["comms.poster"],
    note: "Posted the sealed proof back to the channel.",
    at,
  };

  const notifyRuling = rule(kase, notifyAttempt);
  if (!notifyRuling.ok) return halt(refuse(kase, notifyAttempt, notifyRuling));

  const notifyRun = await runTool({
    agentPubkey: ROSTER["comms.poster"].agentPubkey,
    tool: "slack.post_proof",
    input: proofInput,
    mandate: mandates["comms.poster"],
    at,
  });
  if (!notifyRun.ok) return halt(refuse(kase, notifyAttempt, notifyRun.ruling));

  kase = complete(kase, notifyAttempt, {
    output: notifyRun.result.output,
    provenance: notifyRun.result.provenance,
  });

  // --- hop 6 · proof (orchestrator seals the chain) -------------------------
  const proofAttempt: HopAttempt = {
    kind: "proof",
    role: "orchestrator",
    agentPubkey: ROSTER.orchestrator.agentPubkey,
    tool: null,
    input: { caseId: kase.id, hops: kase.hops.length },
    mandate: mandates.orchestrator,
    note: "Sealed the chain. Every hop is hashed against its predecessor.",
    at,
  };

  const proofRuling = rule(kase, proofAttempt);
  if (!proofRuling.ok) return halt(refuse(kase, proofAttempt, proofRuling));

  kase = complete(kase, proofAttempt, {
    output: { proofHash: caseProofHash(kase) },
    provenance: "fixture",
  });

  await saveCase(kase);
  return kase;
}
