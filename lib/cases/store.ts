import "server-only";
import type { Case } from "./model";
import { readStore, writeStore } from "@/lib/storage/root";

// =============================================================================
// Case persistence. A file store, isolated from the keystore on purpose.
//
// Cases are business records; keys are secrets. They live in separate files
// with separate modules and no shared reader, so a bug that dumps the case
// store cannot dump a private key with it. Same reason this file holds no
// encryption: there is nothing here worth encrypting, and pretending otherwise
// would blur the line that matters.
//
// WHERE those files live is lib/storage/root.ts's problem, not this module's —
// on Vercel the bundle directory is read-only and the old hardcoded
// process.cwd()/.data threw ENOENT before the first hop ran.
//
// `server-only` at the top: importing this from a client component is a build
// error, not a runtime surprise.
// =============================================================================

const FILE = "cases.json";

type Shelf = Record<string, Case>;

const readShelf = () => readStore<Shelf>(FILE, {});

export async function saveCase(c: Case): Promise<void> {
  const shelf = await readShelf();
  shelf[c.id] = c;
  await writeStore(FILE, shelf);
}

export async function loadCase(id: string): Promise<Case | null> {
  const shelf = await readShelf();
  return shelf[id] ?? null;
}

export async function listCases(): Promise<Case[]> {
  const shelf = await readShelf();
  return Object.values(shelf).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
