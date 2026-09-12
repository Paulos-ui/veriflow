import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { createCase, canRun, rule, refuse, complete } from "@/lib/cases/machine";
import type { HopAttempt } from "@/lib/cases/machine";
import { HOP_ORDER, narrowingOf, ringStateOf } from "@/lib/cases/model";
import { ROSTER, defaultMandates } from "@/lib/agents/roster";
import type { Denied } from "@/lib/mandate/refusal";

const NOW = 1_780_000_000;
const MANDATES = defaultMandates(NOW - 60);

const ingest: HopAttempt = {
  kind: "ingest",
  role: "mail.reader",
  agentPubkey: ROSTER["mail.reader"].agentPubkey,
  tool: "gmail.find_invoice",
  input: { sender: "billing@aurora-systems.com", label: "INBOX/Invoices", query: "invoice" },
  demand: { gmailSender: "billing@aurora-systems.com", gmailLabel: "INBOX/Invoices" },
  mandate: MANDATES["mail.reader"],
  note: "Found invoice AUR-4417 from Aurora Systems.",
  at: NOW,
};

const plan: HopAttempt = {
  kind: "plan",
  role: "orchestrator",
  agentPubkey: ROSTER.orchestrator.agentPubkey,
  tool: null,
  input: { vendor: "Aurora Systems", amountCents: 482_000 },
  mandate: MANDATES.orchestrator,
  note: "Extracted vendor and amount; proposing payment.",
  at: NOW,
};

const gate: HopAttempt = {
  kind: "gate",
  role: "comms.poster",
  agentPubkey: ROSTER["comms.poster"].agentPubkey,
  tool: "slack.post_proposal",
  input: { channel: "C07APCLERK01", caseId: "case_1", vendor: "Aurora Systems", amountCents: 482_000, dueDate: "2026-10-01" },
  demand: { slackChannel: "C07APCLERK01" },
  mandate: MANDATES["comms.poster"],
  note: "Posted proposal to #ap-clerk.",
  at: NOW,
};

const pay: HopAttempt = {
  kind: "pay",
  role: "pay.clerk",
  agentPubkey: ROSTER["pay.clerk"].agentPubkey,
  tool: "pay.charge",
  input: { vendor: "Aurora Systems", amountCents: 482_000, reference: "AUR-4417", idempotencyKey: "case_1-pay-01" },
  demand: { vendor: "Aurora Systems", amountCents: 482_000 },
  mandate: MANDATES["pay.clerk"],
  approval: "approved" as const,
  note: "Paid Aurora Systems $4,820.00.",
  at: NOW,
};

const ok = { provenance: "fixture" as const, output: { id: "x" } };

function runTo(kinds: number) {
  let c = createCase("case_1", "Aurora Systems invoice AUR-4417");
  const seq = [ingest, plan, gate, pay];
  for (let i = 0; i < kinds; i++) c = complete(c, seq[i], ok);
  return c;
}

describe("hop order is structural", () => {
  test("a fresh case may only ingest", () => {
    const c = createCase("case_1", "t");
    assert.equal(canRun(c, "ingest").ok, true);
    assert.equal(canRun(c, "pay").ok, false);
  });

  test("pay before the gate is refused as out of order", () => {
    const c = runTo(2); // ingest + plan verified, no gate
    const r = rule(c, pay);
    assert.equal(r.ok, false);
    assert.equal((r as Denied).refusal.kind, "predecessor_missing");
  });

  test("order is checked before the mandate", () => {
    // Out-of-order AND over cap. The operator should be told the order problem,
    // because fixing the cap would not make this call legitimate.
    const c = runTo(2);
    const r = rule(c, { ...pay, demand: { vendor: "Aurora Systems", amountCents: 99_999_999 } });
    assert.equal((r as Denied).refusal.kind, "predecessor_missing");
  });

  test("a completed hop is not re-run", () => {
    const c = runTo(1);
    assert.equal(canRun(c, "ingest").ok, false);
  });

  test("the full spine runs in order", () => {
    const c = runTo(4);
    assert.equal(c.hops.length, 4);
    assert.equal(c.status, "running"); // notify + proof still outstanding
    assert.deepEqual(c.hops.map((h) => h.kind), ["ingest", "plan", "gate", "pay"]);
  });
});

describe("a halted case cannot be resumed", () => {
  test("refuse() halts the chain and records the reason", () => {
    const c = runTo(2);
    const over = { ...pay, demand: { vendor: "Aurora Systems", amountCents: 1_800_000 } };
    const withGate = complete(c, gate, ok);
    const r = rule(withGate, over);
    assert.equal(r.ok, false);

    const halted = refuse(withGate, over, r as Denied);
    assert.equal(halted.status, "halted");
    assert.ok(halted.haltedReason);
    assert.equal(halted.hops[halted.hops.length - 1].status, "refused");
    assert.equal(halted.hops[halted.hops.length - 1].refusal?.kind, "cap_exceeded");
  });

  test("agents cannot self-exit: every later hop is refused", () => {
    const withGate = complete(runTo(2), gate, ok);
    const over = { ...pay, demand: { vendor: "Aurora Systems", amountCents: 1_800_000 } };
    const halted = refuse(withGate, over, rule(withGate, over) as Denied);

    for (const kind of HOP_ORDER) {
      const r = canRun(halted, kind);
      assert.equal(r.ok, false, `${kind} should be refused on a halted case`);
    }
  });

  test("the refused hop stays in the record", () => {
    const withGate = complete(runTo(2), gate, ok);
    const denied = { ...pay, approval: "denied" as const };
    const halted = refuse(withGate, denied, rule(withGate, denied) as Denied);
    // The deny path is evidence, not an error to be swallowed.
    assert.equal(halted.hops.filter((h) => h.status === "refused").length, 1);
    assert.equal(ringStateOf(halted), "refused");
  });
});

describe("case completion", () => {
  test("a case completes only when every hop has verified", () => {
    let c = runTo(4);
    c = complete(c, { ...gate, kind: "notify", tool: "slack.post_proof", note: "Posted proof." }, ok);
    assert.equal(c.status, "running");
    c = complete(c, { ...plan, kind: "proof", note: "Sealed the chain." }, ok);
    assert.equal(c.status, "completed");
    assert.equal(narrowingOf(c), 1);
    assert.equal(ringStateOf(c), "verified");
  });

  test("narrowing rises monotonically with verified hops", () => {
    const seen = [0, 1, 2, 3, 4].map((n) => narrowingOf(runTo(n)));
    for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1]);
  });
});

describe("transitions never mutate", () => {
  test("complete() leaves the input case untouched", () => {
    const before = createCase("case_1", "t");
    const snapshot = JSON.stringify(before);
    complete(before, ingest, ok);
    assert.equal(JSON.stringify(before), snapshot);
  });

  test("refuse() leaves the input case untouched", () => {
    const c = runTo(1);
    const snapshot = JSON.stringify(c);
    refuse(c, pay, rule(c, pay) as Denied);
    assert.equal(JSON.stringify(c), snapshot);
  });
});
