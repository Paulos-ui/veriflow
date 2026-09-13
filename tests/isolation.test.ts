import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// =============================================================================
// Credential isolation, checked against the source rather than asserted in a
// README.
//
// The claim is: each adapter reads only its own app's secrets, the orchestrator
// reads no app secrets at all, and a refused call never even loads the module
// holding the credential. The first two are greppable; the third follows from
// runner.ts importing adapters dynamically, after the ruling — asserted below
// by reading the runner's own source.
// =============================================================================

const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

const GOOGLE = ["GOOGLE_ACCESS_TOKEN", "GOOGLE_REFRESH_TOKEN", "GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_ID"];
const SLACK = ["SLACK_BOT_TOKEN"];
const STRIPE = ["STRIPE_SECRET_KEY"];

describe("each adapter reads only its own credentials", () => {
  test("the Gmail adapter never reads Slack or Stripe secrets", () => {
    const src = read("lib/tools/gmail.ts") + read("lib/tools/google-auth.ts");
    for (const name of [...SLACK, ...STRIPE]) {
      assert.ok(!src.includes(name), `Gmail adapter must not reference ${name}`);
    }
  });

  test("the Slack adapter never reads Google or Stripe secrets", () => {
    const src = read("lib/tools/slack.ts");
    for (const name of [...GOOGLE, ...STRIPE]) {
      assert.ok(!src.includes(name), `Slack adapter must not reference ${name}`);
    }
  });

  test("the pay adapter never reads Google or Slack secrets", () => {
    const src = read("lib/tools/pay.ts");
    for (const name of [...GOOGLE, ...SLACK]) {
      assert.ok(!src.includes(name), `Pay adapter must not reference ${name}`);
    }
  });

  test("the orchestrator holds no app credentials at all", () => {
    // It may read GROQ_API_KEY — reasoning, not an app token. Nothing else.
    const src = read("lib/agents/orchestrator.ts");
    for (const name of [...GOOGLE, ...SLACK, ...STRIPE]) {
      assert.ok(!src.includes(name), `Orchestrator must not reference ${name}`);
    }
    const envReads = src.match(/process\.env\.([A-Z_]+)/g) ?? [];
    assert.deepEqual([...new Set(envReads)], ["process.env.GROQ_API_KEY"]);
  });

  test("STRIPE_SECRET_KEY is USED in exactly one module", () => {
    // Refined from "appears in one module" once the connection-status module
    // landed. links.ts must observe whether a key EXISTS to badge the UI
    // live-vs-recorded, which is presence, not use. The distinction is worth
    // keeping precise rather than waving through: a module that may see the
    // name must still be incapable of spending it.
    const USE_ALLOWED = path.join("lib", "tools", "pay.ts");
    const PRESENCE_ALLOWED = path.join("lib", "tools", "links.ts");

    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (entry.name.endsWith(".ts") && read(rel).includes("STRIPE_SECRET_KEY")) hits.push(rel);
      }
    };
    walk("lib");
    assert.deepEqual(hits.sort(), [USE_ALLOWED, PRESENCE_ALLOWED].sort());

    // The presence-only module cannot reach the network at all, so it has no
    // way to spend a key even though it can see that one is set.
    const links = read(PRESENCE_ALLOWED);
    assert.ok(!links.includes("fetch("), "links.ts must not make network calls");
    assert.ok(!links.includes("Authorization"), "links.ts must not build auth headers");
  });
});

describe("a refused call never loads the credential-holding module", () => {
  test("adapters are imported dynamically, after the ruling", () => {
    const src = read("lib/tools/runner.ts");

    // No static adapter imports at the top of the file: if `./pay` were
    // imported statically, its module body — and its env read — would execute
    // on every call, including refused ones.
    const staticImports = src.match(/^import .* from "\.\/(gmail|slack|pay)"/gm) ?? [];
    assert.deepEqual(staticImports, [], "adapters must not be statically imported by the runner");

    // And the dynamic load must sit below the enforce() call.
    const gateAt = src.indexOf("const ruling = enforce(");
    const loadAt = src.indexOf("const execute = await load(");
    assert.ok(gateAt > 0 && loadAt > gateAt, "the adapter must load only after enforcement");
  });

  test("no module reaches an adapter except the runner", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (entry.name.endsWith(".ts")) {
          const posix = rel.split(path.sep).join("/");
          if (posix === "lib/tools/runner.ts") continue;
          const src = read(rel);
          // Importing a TYPE from an adapter is fine — types vanish at runtime
          // and carry no credential. Importing a value is not.
          const valueImport = /^import\s+(?!type\b)\{[^}]*\}\s+from\s+"@?\/?[./]*(?:lib\/tools\/)?(gmail|slack|pay)"/m;
          if (valueImport.test(src)) offenders.push(posix);
        }
      }
    };
    walk("lib");
    assert.deepEqual(offenders, [], "only the runner may import adapter values");
  });
});

describe("the honesty surface", () => {
  test("nothing can report live provenance without a real response", () => {
    // Every "live" in the adapters must sit after a successful fetch, never in
    // the credential-absent branch. Checked by asserting the fixture/simulated
    // branches return before any "live" literal in each file.
    for (const f of ["lib/tools/gmail.ts", "lib/tools/slack.ts", "lib/tools/pay.ts"]) {
      const src = read(f);
      const firstLive = src.indexOf('provenance: "live"');
      const firstFetch = src.indexOf("await fetch(");
      assert.ok(firstLive > firstFetch, `${f}: a live badge must follow a real request`);
    }
  });

  test("the pay adapter cannot fake a succeeded charge", () => {
    const src = read("lib/tools/pay.ts");
    // The simulated branch must mark status "simulated", never "succeeded".
    const simBranch = src.slice(src.indexOf("if (!key)"), src.indexOf("// Stripe test mode"));
    assert.ok(simBranch.includes('status: "simulated"'));
    assert.ok(!simBranch.includes('status: "succeeded"'));
  });

  test("the pay adapter re-checks nothing the gate already ruled", () => {
    // Policy lives in exactly one place. A second cap check here would be a
    // second place for the rules to drift.
    const src = read("lib/tools/pay.ts");
    assert.ok(!src.includes("batchCapCents"), "the cap belongs to enforce.ts alone");
    assert.ok(!src.includes("allowlist"), "vendor scope belongs to enforce.ts alone");
  });
});
