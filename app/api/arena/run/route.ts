import { NextResponse } from "next/server";
import { z } from "zod";
import { runArenaCase } from "@/lib/cases/arena";
import { DatasetSubmission, GameSubmission } from "@/lib/arena/verify";
import { MAX_BYTES } from "@/lib/arena/csv";

// Groq, the adapters and the Terminal 3 SDK are all server-side, and the SDK
// ships a WASM component, so this route must run on Node rather than the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =============================================================================
// POST /api/arena/run — the one way into the Arena.
//
// Everything past this line is untrusted until lib/arena/verify.ts has re-derived
// it, so the job here is narrow: reject what is not a valid submission, hand the
// rest to the case runner, and return whatever the run concluded.
//
// A halted or partial case comes back 200. That is not sloppiness: the request
// succeeded and the system did its job, and returning 4xx for a refusal would
// make the deny path — the thing this product exists to demonstrate — look like
// a client bug. The status lives in the body, where the UI reads it.
// =============================================================================

const Body = z.discriminatedUnion("kind", [
  GameSubmission.extend({ kind: z.literal("game") }),
  DatasetSubmission.extend({ kind: z.literal("dataset") }),
]);

/**
 * A ceiling on the request itself, checked before the body is read into memory.
 *
 * The Zod schema already caps the CSV text, but it can only do that after the
 * whole body has been parsed — which on a hostile request is exactly too late.
 * The allowance over MAX_BYTES covers JSON escaping of the same text.
 */
const MAX_REQUEST_BYTES = MAX_BYTES * 2 + 64 * 1024;

export async function POST(req: Request) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: `That file is larger than the ${Math.floor(MAX_BYTES / 1_000_000)} MB limit.` },
      { status: 413 }
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    // The first issue only. A list of Zod paths is noise to an operator, and the
    // client cannot act on more than one thing at a time anyway.
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: `That submission was not accepted: ${first?.message ?? "unrecognised shape"}.` },
      { status: 400 }
    );
  }

  try {
    const kase = await runArenaCase(parsed.data);
    return NextResponse.json(kase);
  } catch (e) {
    // A genuine bug, not a policy outcome — refusals never reach here, because
    // the runner converts them to values. The message is passed through because
    // nothing in this codebase puts a credential in an Error.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The run could not be completed." },
      { status: 500 }
    );
  }
}
