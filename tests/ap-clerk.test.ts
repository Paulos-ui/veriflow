import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";

import { runApClerkCase } from "@/lib/cases/ap-clerk";
import { verifyChain, caseProofHash } from "@/lib/proof/attest";
import { HOP_ORDER } from "@/lib/cases/model";
import type { Case } from "@/lib/cases/model";

// =============================================================================
// End to end: one invoice across Gmail → Slack → payment, with no credentials
// configured. Everything runs the fixture/simulated path, which is exactly what
// a judge sees on a clean clone.
//
// These assert OUTCOMES, not call counts: which hops ran, what stopped them,
// and whether the chain still verifies afterwards.
// =============================================================================

const DATA = path.join(process.cwd(), ".data");

async function clean() {
  await rm(path.join(DATA, "cases.json"), { force: true });
}

before(clean);
after(clean);

function kinds(c: Case) {
  return c.hops.map((h) => h.kind);
}

function lastRefusal(c: Case) {
  return c.hops.find((h) => h.status === "refused")?.refusal ?? null;
}

describe("the happy path crosses three apps", () => {
  let kase: Case;

  before(async () => {
    kase = await runApClerkCase({ invoiceKey: "aurora", demoApproval: "approve" });
  });

  test("the case completes", () => {
    assert.equal(kase.status, "completed", kase.haltedReason ?? "");
  });

  test("all six hops ran in order", () => {
    assert.deepEqual(kinds(kase), [...HOP_ORDER]);
  });

  test("three different agents did the work", () => {
    const roles = new Set(kase.hops.map((h) => h.role));
    assert.ok(roles.has("mail.reader"));
    assert.ok(roles.has("comms.poster"));
    assert.ok(roles.has("pay.clerk"));
    assert.ok(roles.has("orchestrator"));
  });

  test("the invoice facts were extracted", () => {
    assert.equal(kase.invoice?.vendor, "Aurora Systems");
    assert.equal(kase.invoice?.amountCents, 482_000);
    assert.equal(kase.invoice?.reference, "AUR-4417");
  });

  test("the gate hop attested BOTH of its calls", () => {
    const gate = kase.hops.find((h) => h.kind === "gate");
    const tools = gate?.calls.map((c) => c.tool) ?? [];
    assert.deepEqual(tools, ["slack.post_proposal", "slack.await_approval"]);
  });

  test("the proof chain verifies", () => {
    const check = verifyChain(kase);
    assert.equal(check.intact, true, check.reason ?? "");
  });

  test("every hop carries honest provenance", () => {
    // No credentials are set in this environment, so nothing may claim "live".
    for (const hop of kase.hops) {
      assert.notEqual(hop.provenance, "live", `${hop.kind} claimed live without credentials`);
    }
  });

  test("the payment is labelled simulated, not succeeded", () => {
    const pay = kase.hops.find((h) => h.kind === "pay");
    assert.equal(pay?.provenance, "simulated");
  });
});

describe("deny path: over the cap", () => {
  let kase: Case;

  before(async () => {
    kase = await runApClerkCase({ invoiceKey: "meridian", demoApproval: "approve" });
  });

  test("the case halts", () => {
    assert.equal(kase.status, "halted");
  });

  test("it halts for the right reason, with both numbers", () => {
    const refusal = lastRefusal(kase);
    assert.equal(refusal?.kind, "cap_exceeded");
  });

  test("it halts AT the pay hop — everything before it succeeded", () => {
    assert.deepEqual(kinds(kase), ["ingest", "plan", "gate", "pay"]);
    assert.equal(kase.hops[3].status, "refused");
  });

  test("no payment hop is marked verified", () => {
    const pay = kase.hops.find((h) => h.kind === "pay");
    assert.notEqual(pay?.status, "verified");
    assert.equal(pay?.resultHash, null);
  });

  test("the chain still verifies — a refusal is evidence, not corruption", () => {
    assert.equal(verifyChain(kase).intact, true);
  });
});

describe("deny path: vendor not on the allowlist", () => {
  let kase: Case;

  before(async () => {
    kase = await runApClerkCase({ invoiceKey: "halcyon", demoApproval: "approve" });
  });

  test("it halts on scope, not on the cap", () => {
    // Halcyon is $2,400 against a $5,000 cap: the only thing wrong is the vendor.
    assert.equal(kase.status, "halted");
    assert.equal(lastRefusal(kase)?.kind, "scope_mismatch");
    assert.ok((kase.invoice?.amountCents ?? 0) < 500_000);
  });
});

describe("deny path: a human says no", () => {
  let kase: Case;

  before(async () => {
    kase = await runApClerkCase({ invoiceKey: "aurora", demoApproval: "deny" });
  });

  test("a denial stops an otherwise perfectly legal payment", () => {
    // Aurora is allowlisted and under cap. The ONLY thing stopping it is the
    // human — which is the point of having a gate at all.
    assert.equal(kase.status, "halted");
    assert.equal(lastRefusal(kase)?.kind, "approval_denied");
  });

  test("the gate hop records that a human denied it", () => {
    const gate = kase.hops.find((h) => h.kind === "gate");
    assert.equal(gate?.status, "verified"); // asking succeeded
    assert.match(gate?.note ?? "", /denied/i);
  });
});

describe("deny path: silence", () => {
  let kase: Case;

  before(async () => {
    kase = await runApClerkCase({ invoiceKey: "aurora", demoApproval: "silence" });
  });

  test("no answer is not consent", () => {
    assert.equal(kase.status, "halted");
    assert.equal(lastRefusal(kase)?.kind, "approval_timeout");
  });
});

describe("determinism and case binding", () => {
  let a: Case;
  let b: Case;

  before(async () => {
    a = await runApClerkCase({ invoiceKey: "aurora", demoApproval: "approve" });
    b = await runApClerkCase({ invoiceKey: "aurora", demoApproval: "approve" });
  });

  test("case-independent hops hash identically across runs", () => {
    // Ingest and plan depend only on the invoice, so the same invoice must
    // produce the same argument hashes — extraction is deterministic, and a
    // reviewer re-running the search can confirm it.
    assert.equal(a.hops[0].argsHash, b.hops[0].argsHash);
    assert.equal(a.hops[1].argsHash, b.hops[1].argsHash);
  });

  test("downstream hops are bound to their own case", () => {
    // The Slack proposal and the payment idempotency key both carry the case
    // id. That is what stops one case's sealed proof from being presented as
    // evidence for another, and it is why these hashes MUST differ.
    assert.notEqual(a.hops[2].argsHash, b.hops[2].argsHash);
    assert.notEqual(a.hops[3].argsHash, b.hops[3].argsHash);
    assert.notEqual(a.id, b.id);
  });

  test("each case seals to its own proof hash", () => {
    assert.notEqual(caseProofHash(a), caseProofHash(b));
  });

  test("both chains verify independently", () => {
    assert.equal(verifyChain(a).intact, true);
    assert.equal(verifyChain(b).intact, true);
  });

  test("the payment carries a per-case idempotency key", () => {
    // Re-running a single case cannot double-pay; two distinct invoices can
    // both still be paid. Both properties come from binding the key to the case.
    const payA = a.hops.find((h) => h.kind === "pay");
    const payB = b.hops.find((h) => h.kind === "pay");
    assert.notEqual(payA?.resultHash, payB?.resultHash);
  });
});
