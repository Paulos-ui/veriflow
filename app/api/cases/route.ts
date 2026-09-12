import { NextResponse } from "next/server";
import { z } from "zod";
import { runApClerkCase } from "@/lib/cases/ap-clerk";
import { listCases, loadCase } from "@/lib/cases/store";

// Terminal 3 and Groq are server-only and the SDK ships a WASM component, so
// this route must run on Node, never the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RunBody = z.object({
  invoiceKey: z.enum(["aurora", "meridian", "halcyon"]).default("aurora"),
  demoApproval: z.enum(["approve", "deny", "silence"]).default("approve"),
});

export async function POST(req: Request) {
  const parsed = RunBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Unrecognised case options." }, { status: 400 });
  }

  try {
    const kase = await runApClerkCase(parsed.data);
    // A halted case is a SUCCESSFUL request: the system worked, and the refusal
    // is the result. Returning 4xx here would make the deny path look like a
    // bug in the client rather than the mandate doing its job.
    return NextResponse.json(kase);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "The case could not be run." },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const kase = await loadCase(id);
    return kase
      ? NextResponse.json(kase)
      : NextResponse.json({ error: "No such case." }, { status: 404 });
  }
  return NextResponse.json(await listCases());
}
