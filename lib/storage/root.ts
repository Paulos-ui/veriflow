import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";

// =============================================================================
// Where VeriFlow is allowed to write.
//
// The bug this module exists to kill: every store used to compute
// `path.join(process.cwd(), ".data")` independently. On Vercel the deployment
// bundle is mounted READ-ONLY at /var/task, so the first `mkdir` threw
//
//     ENOENT: no such file or directory, mkdir '/var/task/.data'
//
// and the case died before hop one — an infrastructure failure wearing the
// costume of a product failure. The only writable path in that runtime is
// /tmp, so that is where we go.
//
// One resolver, three callers. The stores still own their own files and their
// own read/write logic: the case shelf and the keystore share a ROOT, never a
// reader, so a bug that dumps cases still cannot dump a private key with it.
// Callers name the file they want; nothing here returns "everything".
//
// /tmp on a serverless host is per-instance and evaporates on cold start. That
// is acceptable for a demo and stated plainly in the README — what is NOT
// acceptable is crashing, or pretending a write survived when it did not.
// =============================================================================

/** True when the filesystem next to the code is read-only. */
function isServerless(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * The directory VeriFlow may write to.
 *
 * `VERIFLOW_DATA_DIR` overrides everything — that is the seam where a real
 * deployment points this at a mounted volume without touching a line of code.
 */
export function storageRoot(): string {
  const override = process.env.VERIFLOW_DATA_DIR;
  if (override) return override;
  if (isServerless()) return path.join("/tmp", "veriflow");
  return path.join(process.cwd(), ".data");
}

/** Absolute path for a named store file. */
export function storagePath(file: string): string {
  return path.join(storageRoot(), file);
}

// ---- last-resort memory shelf ----------------------------------------------
// If even /tmp refuses a write, the case still has to run. Losing persistence
// degrades the product; throwing kills it. The memory shelf is process-local
// and deliberately dumb — one Map keyed by the SAME filename the disk would
// have used, so a caller cannot accidentally read another store's records.
const memory = new Map<string, unknown>();

let warnedEphemeral = false;

function warnOnce(err: unknown): void {
  if (warnedEphemeral) return;
  warnedEphemeral = true;
  console.warn(
    `[storage] Disk unavailable at ${storageRoot()} — falling back to memory for this instance. ` +
      `Records will not survive a restart. (${err instanceof Error ? err.message : String(err)})`
  );
}

/**
 * Read a JSON store file. A missing file is not an error: an empty shelf and a
 * shelf that was never created are the same thing to every caller here.
 */
export async function readStore<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(storagePath(file), "utf8")) as T;
  } catch {
    return (memory.get(file) as T | undefined) ?? fallback;
  }
}

/**
 * Write a JSON store file atomically: temp file then rename, so a crash
 * mid-write cannot leave a truncated shelf behind. Falls back to memory rather
 * than throwing — see the note above on degrading instead of dying.
 */
export async function writeStore(
  file: string,
  data: unknown,
  opts: { mode?: number } = {}
): Promise<void> {
  const target = storagePath(file);
  const body = JSON.stringify(data, null, 2);

  try {
    await fs.mkdir(storageRoot(), { recursive: true });
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, body, opts.mode ? { encoding: "utf8", mode: opts.mode } : "utf8");
    await fs.rename(tmp, target);
    // Mirror into memory so a later read survives the disk vanishing mid-run.
    memory.set(file, JSON.parse(body));
  } catch (err) {
    warnOnce(err);
    memory.set(file, JSON.parse(body));
  }
}
