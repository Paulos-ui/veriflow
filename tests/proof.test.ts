import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { canonical, hashArgs, verifyChain, caseProofHash, sealHop } from "@/lib/proof/attest";
import { createCase, complete } from "@/lib/cases/machine";
import type { HopAttempt } from "@/lib/cases/machine";
import { ROSTER, defaultMandates } from "@/lib/agents/roster";

const MANDATES = defaultMandates(1_780_000_000);
const ok = { provenance: "fixture" as const, output: { id: "x" } };

function threeHopCase() {
  let c = createCase("case_1", "Aurora Systems invoice AUR-4417");
  c = complete(c, {
    kind: "ingest", role: "mail.reader", agentPubkey: ROSTER["mail.reader"].agentPubkey,
    tool: "gmail.find_invoice", input: { sender: "billing@aurora-systems.com" },
    mandate: MANDATES["mail.reader"], note: "Found invoice.",
  } satisfies HopAttempt, ok);
  c = complete(c, {
    kind: "plan", role: "orchestrator", agentPubkey: ROSTER.orchestrator.agentPubkey,
    tool: null, input: { vendor: "Aurora Systems", amountCents: 482_000 },
    mandate: MANDATES.orchestrator, note: "Proposed payment.",
  } satisfies HopAttempt, ok);
  c = complete(c, {
    kind: "gate", role: "comms.poster", agentPubkey: ROSTER["comms.poster"].agentPubkey,
    tool: "slack.post_proposal", input: { channel: "C07APCLERK01" },
    mandate: MANDATES["comms.poster"], note: "Posted proposal.",
  } satisfies HopAttempt, ok);
  return c;
}

describe("canonical hashing", () => {
  test("key order does not change the hash", () => {
    assert.equal(hashArgs({ a: 1, b: 2 }), hashArgs({ b: 2, a: 1 }));
  });

  test("nested key order does not change the hash", () => {
    assert.equal(hashArgs({ x: { p: 1, q: 2 } }), hashArgs({ x: { q: 2, p: 1 } }));
  });

  test("undefined is dropped, null is kept", () => {
    assert.equal(canonical({ a: 1, b: undefined }), '{"a":1}');
    assert.equal(canonical({ a: 1, b: null }), '{"a":1,"b":null}');
  });

  test("different values hash differently", () => {
    assert.notEqual(hashArgs({ amountCents: 482_000 }), hashArgs({ amountCents: 482_001 }));
  });

  test("array order is preserved — sequence is meaning", () => {
    assert.notEqual(hashArgs([1, 2]), hashArgs([2, 1]));
  });
});

describe("the chain detects tampering", () => {
  test("an untouched chain verifies", () => {
    const check = verifyChain(threeHopCase());
    assert.equal(check.intact, true, check.reason ?? "");
  });

  test("every hop points at its predecessor", () => {
    const c = threeHopCase();
    assert.equal(c.hops[0].prevHopHash, null);
    assert.equal(c.hops[1].prevHopHash, c.hops[0].hopHash);
    assert.equal(c.hops[2].prevHopHash, c.hops[1].hopHash);
  });

  test("editing a sealed hop breaks the chain at that hop", () => {
    const c = threeHopCase();
    const tampered = {
      ...c,
      hops: c.hops.map((h, i) => (i === 1 ? { ...h, resultHash: hashArgs({ id: "forged" }) } : h)),
    };
    const check = verifyChain(tampered);
    assert.equal(check.intact, false);
    assert.equal(check.brokenAt, 1);
  });

  test("re-sealing the edited hop still breaks the NEXT one", () => {
    // The point of the chain: a forger who fixes hop 1's own hash still cannot
    // make hop 2 point at it without re-sealing hop 2, and so on to the tip.
    const c = threeHopCase();
    const forgedHop = { ...c.hops[1], resultHash: hashArgs({ id: "forged" }) };
    const resealed = sealHop(forgedHop, c.hops[0]);
    const tampered = { ...c, hops: [c.hops[0], resealed, c.hops[2]] };

    const check = verifyChain(tampered);
    assert.equal(check.intact, false);
    assert.equal(check.brokenAt, 2);
  });

  test("dropping a hop breaks the chain", () => {
    const c = threeHopCase();
    const check = verifyChain({ ...c, hops: [c.hops[0], c.hops[2]] });
    assert.equal(check.intact, false);
  });

  test("the case proof hash changes when any hop changes", () => {
    const c = threeHopCase();
    const before = caseProofHash(c);
    const tampered = { ...c, hops: c.hops.map((h, i) => (i === 2 ? { ...h, hopHash: "deadbeef" } : h)) };
    assert.notEqual(before, caseProofHash(tampered));
  });
});

describe("arguments are hashed, never stored in the open", () => {
  test("a hop keeps an args hash, not the args", () => {
    const c = threeHopCase();
    const hop = c.hops[0];
    assert.ok(hop.argsHash && /^[0-9a-f]{64}$/.test(hop.argsHash));
    assert.ok(!JSON.stringify(hop).includes("billing@aurora-systems.com"));
  });
});

describe("credential isolation is structural", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const read = (p: string) => readFileSync(path.join(root, p), "utf8");

  test("the policy layer reads no environment variables", () => {
    // If enforcement or planning could read a token, "the orchestrator holds no
    // app tokens" would be a convention. This makes it a property of the files.
    for (const f of [
      "lib/mandate/enforce.ts",
      "lib/mandate/model.ts",
      "lib/mandate/refusal.ts",
      "lib/tools/registry.ts",
      "lib/tools/types.ts",
      "lib/agents/roster.ts",
      "lib/cases/model.ts",
      "lib/cases/machine.ts",
    ]) {
      assert.ok(!read(f).includes("process.env"), `${f} must not read process.env`);
    }
  });

  test("the policy layer is importable without server-only", () => {
    for (const f of ["lib/mandate/enforce.ts", "lib/cases/machine.ts", "lib/tools/registry.ts"]) {
      assert.ok(!read(f).includes('"server-only"'), `${f} should stay environment-agnostic`);
    }
  });

  test("the policy layer really does import in a plain (non-server) context", async () => {
    // The suite runs with --conditions=react-server so adapters can be tested,
    // which neuters `server-only`. So this spawns a child WITHOUT that flag:
    // if a credential-holding module ever leaks into the policy graph, its
    // server-only guard throws here and this test fails.
    const { spawnSync } = await import("node:child_process");
    const probe = [
      "import('@/lib/mandate/enforce')",
      "import('@/lib/cases/machine')",
      "import('@/lib/tools/registry')",
    ].join(".then(()=>") + ")".repeat(2);

    const res = spawnSync(
      process.execPath,
      ["--import", "./tests/register.mjs", "--input-type=module", "-e", `await ${probe}`],
      { cwd: root, encoding: "utf8" }
    );
    assert.equal(res.status, 0, `policy layer failed to import standalone:\n${res.stderr}`);
  });

  test("the case store is marked server-only", () => {
    assert.ok(read("lib/cases/store.ts").includes('import "server-only"'));
  });
});
