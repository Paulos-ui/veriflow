import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { storageRoot, storagePath, readStore, writeStore } from "@/lib/storage/root";
import { runTool } from "@/lib/tools/runner";
import { ROSTER, defaultMandates } from "@/lib/agents/roster";

// =============================================================================
// The deployment surface: the two ways this app died in front of a user, turned
// into properties so they cannot come back.
//
//   1. It crashed on Vercel because three stores each computed
//      `process.cwd()/.data`, which resolves inside the READ-ONLY bundle:
//      ENOENT: no such file or directory, mkdir '/var/task/.data'
//
//   2. A missing credential has to fail CLOSED — a refusal with a reason and a
//      remedy — rather than either crashing or quietly serving a recorded
//      invoice as though a real mailbox had answered.
//
// Both are asserted here against behaviour, not comments.
// =============================================================================

const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/**
 * Set env for one test and put it back exactly as it was, including unset.
 *
 * Always async: half of these cases await, and restoring the environment while
 * the body was still suspended would silently test the wrong configuration.
 */
async function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => T | Promise<T>
): Promise<T> {
  const prior = Object.keys(vars).map((k) => [k, process.env[k]] as const);
  const apply = (pairs: readonly (readonly [string, string | undefined])[]) => {
    for (const [k, v] of pairs) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  apply(Object.entries(vars));
  try {
    return await fn();
  } finally {
    apply(prior);
  }
}

describe("the writable root survives a read-only bundle", () => {
  test("a serverless host writes to /tmp, never beside the code", async () => {
    for (const host of ["VERCEL", "AWS_LAMBDA_FUNCTION_NAME"]) {
      const resolved = await withEnv({ [host]: "1", VERIFLOW_DATA_DIR: undefined }, storageRoot);
      assert.ok(
        resolved.startsWith("/tmp/"),
        `${host} must resolve into /tmp, got ${resolved}`
      );
      assert.ok(
        !resolved.includes("/var/task"),
        "the deployment bundle is read-only and must never be a write target"
      );
    }
  });

  test("a local run keeps its records beside the project", async () => {
    const resolved = await withEnv(
      { VERCEL: undefined, AWS_LAMBDA_FUNCTION_NAME: undefined, VERIFLOW_DATA_DIR: undefined },
      storageRoot
    );
    assert.equal(resolved, path.join(process.cwd(), ".data"));
  });

  test("VERIFLOW_DATA_DIR overrides everything — the seam for a real volume", async () => {
    assert.equal(await withEnv({ VERCEL: "1", VERIFLOW_DATA_DIR: "/mnt/disk" }, storageRoot), "/mnt/disk");
    assert.equal(
      await withEnv({ VERIFLOW_DATA_DIR: "/mnt/disk" }, () => storagePath("cases.json")),
      "/mnt/disk/cases.json"
    );
  });

  test("no store computes its own data directory", () => {
    // The whole bug was three modules each deciding where to write. One file is
    // allowed to know; everyone else asks it.
    //
    // Comments are stripped before scanning, because the stores explain the
    // outage in prose and that history is worth keeping readable.
    const code = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(rel);
        else if (entry.name.endsWith(".ts")) {
          const posix = rel.split(path.sep).join("/");
          if (posix === "lib/storage/root.ts") continue;
          if (code(read(rel)).includes("process.cwd()")) offenders.push(posix);
        }
      }
    };
    walk("lib");
    assert.deepEqual(offenders, [], "only lib/storage/root.ts may resolve a write path");
  });

  test("an unwritable disk degrades to memory instead of killing the case", async () => {
    // A path whose parent is a regular file can never be created — ENOTDIR, the
    // same shape of failure as the read-only bundle, and deterministic whatever
    // user the suite runs as. A store that threw here would reproduce the
    // original outage; a store that returns has merely lost durability.
    const dir = mkdtempSync(path.join(tmpdir(), "veriflow-nodisk-"));
    const blocker = path.join(dir, "not-a-directory");
    writeFileSync(blocker, "");

    const shelf = { note: "kept in memory" };
    await withEnv({ VERIFLOW_DATA_DIR: path.join(blocker, "store") }, async () => {
      await writeStore("ephemeral.json", shelf);
      assert.deepEqual(await readStore("ephemeral.json", null), shelf);
    });
  });

  test("a real write round-trips and stays in its own file", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "veriflow-store-"));
    await withEnv({ VERIFLOW_DATA_DIR: dir }, async () => {
      await writeStore("alpha.json", { a: 1 });
      await writeStore("beta.json", { b: 2 });
      assert.deepEqual(await readStore("alpha.json", null), { a: 1 });
      assert.deepEqual(await readStore("beta.json", null), { b: 2 });
      // No temp files left behind by the atomic rename.
      assert.deepEqual(
        readdirSync(dir).filter((f) => f.endsWith(".tmp")),
        []
      );
    });
  });
});

describe("a missing Gmail credential fails closed, not open and not loudly", () => {
  const MANDATES = defaultMandates(Math.floor(Date.now() / 1000) - 60);
  const INPUT = {
    sender: "billing@aurora-systems.com",
    label: "INBOX/Invoices",
    query: "has:attachment invoice",
  };

  const call = () =>
    runTool({
      agentPubkey: ROSTER["mail.reader"].agentPubkey,
      tool: "gmail.find_invoice",
      input: INPUT,
      mandate: MANDATES["mail.reader"],
    });

  // Point the token store at an empty directory so a developer's real
  // connection on disk cannot decide the outcome of this test.
  let dir: string;
  let restore: () => void;

  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), "veriflow-gmail-"));
    const prior = {
      VERIFLOW_DATA_DIR: process.env.VERIFLOW_DATA_DIR,
      GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
      GOOGLE_ACCESS_TOKEN: process.env.GOOGLE_ACCESS_TOKEN,
    };
    process.env.VERIFLOW_DATA_DIR = dir;
    delete process.env.GOOGLE_REFRESH_TOKEN;
    delete process.env.GOOGLE_ACCESS_TOKEN;
    restore = () => {
      for (const [k, v] of Object.entries(prior)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    };
  });

  after(() => restore());

  test("configured but unconnected refuses with a reason and a remedy", async () => {
    const outcome = await withEnv(
      { GOOGLE_CLIENT_ID: "demo.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "demo-secret" },
      call
    );

    assert.equal(outcome.ok, false, "an operator who asked for live mail must not get a fixture");
    if (outcome.ok) return;

    assert.equal(outcome.ruling.refusal.kind, "adapter_unavailable");
    assert.equal(outcome.ruling.refusal.evidence?.attempted, "gmail_not_connected");
    assert.ok(outcome.ruling.refusal.remedy, "a refusal without a remedy is a dead end");
  });

  test("with no OAuth app at all, the recorded demo still runs and says so", async () => {
    const outcome = await withEnv(
      { GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined },
      call
    );

    assert.equal(outcome.ok, true, "the zero-credential demo must keep working");
    if (!outcome.ok) return;
    assert.equal(outcome.result.provenance, "fixture", "and must never claim to be live");
  });
});
