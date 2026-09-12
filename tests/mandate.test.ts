import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { enforce } from "@/lib/mandate/enforce";
import type { Mandate } from "@/lib/mandate/model";
import { descriptorFor } from "@/lib/tools/registry";
import { ROSTER, defaultMandates } from "@/lib/agents/roster";
import type { Denied } from "@/lib/mandate/refusal";

// =============================================================================
// Deny paths.
//
// Every test here asserts a REFUSAL. The allow cases exist only to prove the
// refusals aren't coming from a gate that refuses everything — a test suite
// where `enforce` returns Denied unconditionally would otherwise pass.
// =============================================================================

const NOW = 1_780_000_000; // fixed clock; expiry must not depend on wall time
const MANDATES = defaultMandates(NOW - 60);

const MAIL = ROSTER["mail.reader"].agentPubkey;
const COMMS = ROSTER["comms.poster"].agentPubkey;
const PAY = ROSTER["pay.clerk"].agentPubkey;
const ORCH = ROSTER.orchestrator.agentPubkey;

/** Assert refused, and return the refusal so the caller can check specifics. */
function refusalOf(r: ReturnType<typeof enforce>, kind: string): Denied["refusal"] {
  assert.equal(r.ok, false, `expected a refusal (${kind}) but the call was allowed`);
  const refusal = (r as Denied).refusal;
  assert.equal(refusal.kind, kind);
  return refusal;
}

function call(over: Partial<Parameters<typeof enforce>[0]> & { tool: string }) {
  const req = {
    agentPubkey: MAIL,
    demand: {},
    mandate: MANDATES["mail.reader"],
    at: NOW,
    ...over,
  } as Parameters<typeof enforce>[0];
  return enforce(req, descriptorFor(req.tool));
}

describe("the gate lets correct calls through", () => {
  test("mail reader reads an allowlisted sender in the allowed label", () => {
    const r = call({
      tool: "gmail.find_invoice",
      demand: { gmailSender: "billing@aurora-systems.com", gmailLabel: "INBOX/Invoices" },
    });
    assert.equal(r.ok, true);
  });

  test("a display-name sender matches its bare address", () => {
    const r = call({
      tool: "gmail.find_invoice",
      demand: { gmailSender: "Aurora Billing <billing@aurora-systems.com>", gmailLabel: "INBOX/Invoices" },
    });
    assert.equal(r.ok, true);
  });

  test("pay clerk pays an allowlisted vendor under cap with approval", () => {
    const r = call({
      agentPubkey: PAY,
      tool: "pay.charge",
      mandate: MANDATES["pay.clerk"],
      demand: { vendor: "Aurora Systems", amountCents: 482_000 },
      approval: "approved",
    });
    assert.equal(r.ok, true);
  });
});

describe("unknown and misrouted tools", () => {
  test("a tool that does not exist is refused, not ignored", () => {
    const r = call({ tool: "stripe.refund" });
    refusalOf(r, "unknown_tool");
  });

  test("the mail reader cannot call the pay clerk's tool", () => {
    // The decisive test for credential separation: even with the pay clerk's
    // own mandate in hand, the key binding on the tool refuses first.
    const r = call({
      agentPubkey: MAIL,
      tool: "pay.charge",
      mandate: MANDATES["pay.clerk"],
      demand: { vendor: "Aurora Systems", amountCents: 1000 },
      approval: "approved",
    });
    refusalOf(r, "wrong_agent");
  });

  test("the orchestrator cannot post to Slack", () => {
    const r = call({
      agentPubkey: ORCH,
      tool: "slack.post_proposal",
      mandate: MANDATES.orchestrator,
      demand: { slackChannel: "C07APCLERK01" },
    });
    refusalOf(r, "wrong_agent");
  });

  test("the orchestrator's own mandate grants no functions at all", () => {
    assert.deepEqual(MANDATES.orchestrator.functions, []);
    assert.equal(MANDATES.orchestrator.batchCapCents, 0);
  });
});

describe("mandate validity", () => {
  test("an agent with no mandate has no authority", () => {
    const r = call({ tool: "gmail.find_invoice", mandate: null });
    refusalOf(r, "mandate_missing");
  });

  test("a revoked mandate refuses", () => {
    const revoked: Mandate = { ...MANDATES["mail.reader"], revoked: true };
    const r = call({ tool: "gmail.find_invoice", mandate: revoked });
    refusalOf(r, "mandate_revoked");
  });

  test("an expired mandate refuses", () => {
    const expired: Mandate = { ...MANDATES["mail.reader"], notAfterSecs: NOW - 1 };
    const r = call({ tool: "gmail.find_invoice", mandate: expired });
    refusalOf(r, "mandate_expired");
  });

  test("a mandate that has not started yet refuses", () => {
    const future: Mandate = {
      ...MANDATES["mail.reader"],
      notBeforeSecs: NOW + 60,
      notAfterSecs: NOW + 3600,
    };
    const r = call({ tool: "gmail.find_invoice", mandate: future });
    refusalOf(r, "mandate_expired");
  });

  test("a mandate issued to another key refuses", () => {
    const r = call({ tool: "gmail.find_invoice", agentPubkey: MAIL, mandate: { ...MANDATES["mail.reader"], agentPubkey: COMMS } });
    refusalOf(r, "wrong_agent");
  });

  test("a tool absent from the mandate refuses even for its owning agent", () => {
    const narrowed: Mandate = { ...MANDATES["mail.reader"], functions: ["gmail.find_invoice"] };
    const r = call({
      tool: "gmail.fetch_attachment",
      mandate: narrowed,
      demand: { gmailSender: "billing@aurora-systems.com" },
    });
    refusalOf(r, "tool_not_in_mandate");
  });
});

describe("scopes fail closed", () => {
  test("an unlisted sender refuses", () => {
    const r = call({
      tool: "gmail.find_invoice",
      demand: { gmailSender: "attacker@elsewhere.test", gmailLabel: "INBOX/Invoices" },
    });
    const refusal = refusalOf(r, "scope_mismatch");
    assert.match(refusal.evidence?.attempted ?? "", /attacker@elsewhere\.test/);
  });

  test("an unlisted label refuses", () => {
    const r = call({
      tool: "gmail.find_invoice",
      demand: { gmailSender: "billing@aurora-systems.com", gmailLabel: "INBOX" },
    });
    refusalOf(r, "scope_mismatch");
  });

  test("a channel the mandate never mentions refuses", () => {
    const r = call({
      agentPubkey: COMMS,
      tool: "slack.post_proposal",
      mandate: MANDATES["comms.poster"],
      demand: { slackChannel: "C0GENERAL99" },
    });
    refusalOf(r, "scope_mismatch");
  });

  test("a SILENT scope authorises nothing", () => {
    // The fail-closed hinge: scopes.vendors is undefined here, not conflicting.
    // A mandate that forgot to name vendors must authorise payment to nobody.
    const silent: Mandate = { ...MANDATES["pay.clerk"], scopes: {} };
    const r = call({
      agentPubkey: PAY,
      tool: "pay.charge",
      mandate: silent,
      demand: { vendor: "Aurora Systems", amountCents: 1000 },
      approval: "approved",
    });
    refusalOf(r, "scope_mismatch");
  });

  test("an unknown vendor refuses", () => {
    const r = call({
      agentPubkey: PAY,
      tool: "pay.charge",
      mandate: MANDATES["pay.clerk"],
      demand: { vendor: "Unknown Vendor LLC", amountCents: 1000 },
      approval: "approved",
    });
    refusalOf(r, "scope_mismatch");
  });
});

describe("the cap is exact", () => {
  const cap = MANDATES["pay.clerk"].batchCapCents;

  const payFor = (amountCents: number) =>
    call({
      agentPubkey: PAY,
      tool: "pay.charge",
      mandate: MANDATES["pay.clerk"],
      demand: { vendor: "Aurora Systems", amountCents },
      approval: "approved",
    });

  test("exactly at the cap is allowed", () => {
    assert.equal(payFor(cap).ok, true);
  });

  test("one cent over the cap refuses", () => {
    const refusal = refusalOf(payFor(cap + 1), "cap_exceeded");
    assert.equal(refusal.evidence?.allowed, "$5,000.00");
    assert.equal(refusal.evidence?.attempted, "$5,000.01");
  });

  test("a wildly over-cap invoice refuses with both numbers shown", () => {
    const refusal = refusalOf(payFor(1_800_000), "cap_exceeded");
    assert.equal(refusal.evidence?.attempted, "$18,000.00");
  });

  test("a non-finite amount refuses", () => {
    refusalOf(payFor(Number.NaN), "cap_exceeded");
  });
});

describe("the human gate", () => {
  const payWith = (approval: "approved" | "denied" | "timeout" | "pending" | undefined) =>
    call({
      agentPubkey: PAY,
      tool: "pay.charge",
      mandate: MANDATES["pay.clerk"],
      demand: { vendor: "Aurora Systems", amountCents: 100_000 },
      approval,
    });

  test("a denial stops the payment", () => {
    refusalOf(payWith("denied"), "approval_denied");
  });

  test("silence is not consent", () => {
    refusalOf(payWith("timeout"), "approval_timeout");
  });

  test("a pending gate does not authorise payment", () => {
    refusalOf(payWith("pending"), "approval_timeout");
  });

  test("a missing approval field does not authorise payment", () => {
    // The default arm. Forgetting to pass approval must never read as yes.
    refusalOf(payWith(undefined), "approval_timeout");
  });
});

describe("refusals carry what an operator needs", () => {
  test("every refusal has a message that is a sentence, not a code", () => {
    const cases = [
      call({ tool: "stripe.refund" }),
      call({ tool: "gmail.find_invoice", mandate: null }),
      call({ tool: "gmail.find_invoice", demand: { gmailSender: "x@y.test", gmailLabel: "INBOX/Invoices" } }),
    ];
    for (const r of cases) {
      assert.equal(r.ok, false);
      const { message, kind } = (r as Denied).refusal;
      assert.ok(message.length > 20, `message too terse for ${kind}: ${message}`);
      assert.ok(/[.!]$/.test(message), `message should read as a sentence: ${message}`);
      assert.ok(!message.includes("_"), `message leaks an enum: ${message}`);
    }
  });
});
