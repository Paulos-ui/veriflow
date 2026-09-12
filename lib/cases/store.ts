import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Case } from "./model";

// =============================================================================
// Case persistence. A file store, isolated from the keystore on purpose.
//
// Cases are business records; keys are secrets. They live in separate files
// under .data/ with separate modules and no shared reader, so a bug that dumps
// the case store cannot dump a private key with it. Same reason this file holds
// no encryption: there is nothing here worth encrypting, and pretending
// otherwise would blur the line that matters.
//
// `server-only` at the top: importing this from a client component is a build
// error, not a runtime surprise.
// =============================================================================

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "cases.json");

type Shelf = Record<string, Case>;

async function readShelf(): Promise<Shelf> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Shelf;
  } catch {
    return {};
  }
}

/** Write to a temp file then rename, so a crash mid-write cannot truncate. */
async function writeShelf(shelf: Shelf): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(shelf, null, 2), "utf8");
  await fs.rename(tmp, FILE);
}

export async function saveCase(c: Case): Promise<void> {
  const shelf = await readShelf();
  shelf[c.id] = c;
  await writeShelf(shelf);
}

export async function loadCase(id: string): Promise<Case | null> {
  const shelf = await readShelf();
  return shelf[id] ?? null;
}

export async function listCases(): Promise<Case[]> {
  const shelf = await readShelf();
  return Object.values(shelf).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
