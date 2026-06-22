import { NextResponse } from "next/server";
import { authenticateOperator, issueDelegation } from "@/lib/t3n-client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const operator = await authenticateOperator();
    const result = await issueDelegation({
      operatorDid: operator.did,
      agentPubkey: body.agentPubkey,
      maxApprovalAmount: Number(body.maxApprovalAmount),
      allowedVendors: body.allowedVendors ?? [],
      functions: body.functions ?? ["invoice.analyze", "invoice.pay"],
      expiresAt: body.expiresAt ?? null,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "delegation failed" },
      { status: 500 }
    );
  }
}
