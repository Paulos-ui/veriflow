import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

// Resolver hook for `node --test`.
//
// Node 22 runs TypeScript by stripping types, but it does not read tsconfig:
// it cannot follow the `@/` path alias the app uses, and it insists on explicit
// file extensions. Rather than bend every import in lib/ to suit the test
// runner — which would leave the codebase half-aliased and half-relative — the
// weirdness is confined to this one file.
//
// Registered by tests/register.mjs, used only by `npm test`. Next's bundler
// never sees it.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SUFFIXES = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx"];

function firstFile(base) {
  for (const suffix of SUFFIXES) {
    const candidate = base + suffix;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  let base = null;

  if (specifier.startsWith("@/")) {
    base = path.join(ROOT, specifier.slice(2));
  } else if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }

  if (base) {
    const found = firstFile(base);
    if (found) return { url: pathToFileURL(found).href, format: undefined, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
