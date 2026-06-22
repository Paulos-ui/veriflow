import { NextResponse } from "next/server";
import { authenticateOperator, executeDelegatedAction } from "@/lib/t3n-client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const operator = await authenticateOperator();
    const attestation = await executeDelegatedAction({
      operatorDid: operator.did,
      agentPubkey: body.agentPubkey,
      credentialId: body.credentialId,
      payload: body.payload,
    });
    return NextResponse.json(attestation);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "execution failed" },
      { status: 500 }
    );
  }
}
