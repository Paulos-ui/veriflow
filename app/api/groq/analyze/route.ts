import { NextResponse } from "next/server";
import { analyzeInvoice } from "@/lib/groq";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { invoice, permission } = await req.json();
    const decision = await analyzeInvoice(invoice, permission ?? null);
    return NextResponse.json(decision);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "analysis failed" },
      { status: 500 }
    );
  }
}
