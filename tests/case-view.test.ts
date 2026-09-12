import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import path from "node:path";

import { runApClerkCase } from "@/lib/cases/ap-clerk";
import { verifyChain } from "@/lib/proof/attest";
import { HOP_ORDER } from "@/lib/cases/model";
import type { Case } from "@/lib/cases/model";
import {
  MANDATE_RULES,
  announce,
  boundRuleCount,
  boundRules,
  participatingRoles,
  refusedHop,
  shortHash,
  timeline,
} from "@/lib/cases/view";

// =============================================================================
// The workspace's derived views, and the evidence the why-blocked panel needs.
//
// These matter because the UI makes claims — "3 of 4 rules bound", "cap
// $5,000.00 vs $18,000.00" — and a claim the record cannot back is worse than
// no claim at all. Everything here asserts the view agrees with the chain.
// =============================================================================

const DATA = path.join(process.cwd(), ".data");
const clean = () => rm(path.join(DATA, "cases.json"), { force: true });

before(clean);
after(clean);

describe("a refusal carries its evidence to the UI", () => {
  let over: Case;

  before(async () => {
    over = await runApClerkCase({ invoiceKey: "meridian", demoApproval: "approve" });
  });

  test("the cap refusal keeps both numbers, not just a category", () => {
    // MASTER.md §5.3: the operator is deciding whether to widen a mandate, so
    // the panel must show the comparison. Storing only `kind` would force the
    // UI to invent numbers it cannot see.
    const hop = refusedHop(over);
    assert.equal(hop?.refusal?.kind, "cap_exceeded");

    const evidence = hop?.refusal?.evidence;
    assert.ok(evidence, "a cap refusal must carry evidence");
    assert.match(evidence.allowed, /5,000/);
    assert.match(evidence.attempted, /18,000/);
  });

  test("it carries a recovery path", () => {
    assert.ok(refusedHop(over)?.refusal?.remedy, "every refusal needs a way forward");
  });

  test("the scope refusal names the allowlist it failed", async () => {
    const kase = await runApClerkCase({ invoiceKey: "halcyon", demoApproval: "approve" });
    const evidence = refusedHop(kase)?.refusal?.evidence;
    assert.match(evidence?.label ?? "", /vendor/i);
    assert.match(evidence?.attempted ?? "", /Halcyon/);
  });
});

describe("refusal evidence is under the seal", () => {
  let kase: Case;

  before(async () => {
    kase = await runApClerkCase({ invoiceKey: "meridian", demoApproval: "approve" });
  });

  test("the honest chain verifies", () => {
    assert.equal(verifyChain(kase).intact, true);
  });

  test("rewriting the displayed cap breaks the chain", () => {
    // The attack this defends against: leave the refusal kind alone so the UI
    // still says "over cap", but edit the number the operator reads from
    // $5,000 to $50,000 — making a correct refusal look like a mistake, or a
    // tight mandate look generous. If evidence were outside the preimage this
    // would verify clean.
    const idx = kase.hops.findIndex((h) => h.status === "refused");
    assert.ok(idx >= 0);

    const hop = kase.hops[idx];
    const tampered: Case = {
      ...kase,
      hops: kase.hops.map((h, i) =>
        i === idx
          ? {
              ...h,
              refusal: {
                ...h.refusal!,
                evidence: { ...h.refusal!.evidence!, allowed: "$50,000.00" },
              },
            }
          : h
      ),
    };

    const check = verifyChain(tampered);
    assert.equal(check.intact, false, "edited evidence must break the seal");
    assert.equal(check.brokenAt, hop.index);
  });

  test("rewriting the remedy also breaks the chain", () => {
    const idx = kase.hops.findIndex((h) => h.status === "refused");
    const tampered: Case = {
      ...kase,
      hops: kase.hops.map((h, i) =>
        i === idx ? { ...h, refusal: { ...h.refusal!, remedy: "Just run it again." } } : h
      ),
    };
    assert.equal(verifyChain(tampered).intact, false);
  });
});

describe("bound rules are derived from the record, never assumed", () => {
  test("a completed case binds all four", async () => {
    const kase = await runApClerkCase({ invoiceKey: "aurora", demoApproval: "approve" });
    assert.equal(kase.status, "completed");
    assert.equal(boundRuleCount(kase), MANDATE_RULES.length);
  });

  test("a case halted at pay never binds the vendor/cap rule", async () => {
    // The ring's geometry and the refusal must agree, because both read the
    // same record. A tick lit here would claim authority the case never had.
    const kase = await runApClerkCase({ invoiceKey: "meridian", demoApproval: "approve" });
    const ids = boundRules(kase).map((r) => r.id);

    assert.ok(ids.includes("sender"), "the mail read did happen");
    assert.ok(ids.includes("channel"), "the proposal was posted");
    assert.ok(!ids.includes("vendor"), "no successful pay.charge — the tick must stay unlit");
    assert.ok(boundRuleCount(kase) < MANDATE_RULES.length);
  });

  test("a denied case binds no payment rule either", async () => {
    const kase = await runApClerkCase({ invoiceKey: "aurora", demoApproval: "deny" });
    assert.ok(!boundRules(kase).some((r) => r.id === "vendor"));
  });
});

describe("the timeline shows what did not happen", () => {
  let halted: Case;

  before(async () => {
    halted = await runApClerkCase({ invoiceKey: "meridian", demoApproval: "approve" });
  });

  test("every step in the spine gets a row", () => {
    // A timeline that simply ends at the refusal reads like the case finished.
    // `notify` and `proof` must be visible as never-reached.
    assert.equal(timeline(halted).length, HOP_ORDER.length);
  });

  test("steps after the refusal are marked unreached, not awaiting", () => {
    const steps = timeline(halted);
    const notify = steps.find((s) => s.kind === "notify");
    assert.equal(notify?.state, "unreached");
    assert.equal(notify?.hop, null);
  });

  test("unreached steps still name the agent that would have run them", () => {
    const proof = timeline(halted).find((s) => s.kind === "proof");
    assert.ok(proof?.agentName, "an empty row teaches the operator nothing");
  });

  test("three specialists plus the orchestrator touched the case", () => {
    const roles = participatingRoles(halted);
    assert.ok(roles.includes("mail.reader"));
    assert.ok(roles.includes("comms.poster"));
    assert.ok(roles.includes("orchestrator"));
  });
});

describe("the announcement is a sentence, not a status word", () => {
  test("a halt announces the step and the reason", async () => {
    const kase = await runApClerkCase({ invoiceKey: "meridian", demoApproval: "approve" });
    const said = announce(kase);
    assert.match(said, /halted/i);
    assert.match(said, /Pay/i, "name the step that stopped");
    assert.match(said, /cap/i, "carry the reason, not just the fact");
  });

  test("a completion announces what was paid", async () => {
    const kase = await runApClerkCase({ invoiceKey: "aurora", demoApproval: "approve" });
    const said = announce(kase);
    assert.match(said, /completed/i);
    assert.match(said, /Aurora Systems/);
  });
});

describe("hashes are truncated head and tail, never silently", () => {
  test("a long hash keeps both ends", () => {
    const h = "a".repeat(20) + "b".repeat(20) + "c123ef";
    const short = shortHash(h);
    assert.ok(short.includes("…"), "the elision must be visible");
    assert.ok(short.startsWith("aaaaaaaaaa"));
    assert.ok(short.endsWith("c123ef"));
  });

  test("a short value is returned whole rather than padded", () => {
    assert.equal(shortHash("abc"), "abc");
  });

  test("a missing hash renders as an em dash, not the string null", () => {
    assert.equal(shortHash(null), "—");
  });
});
