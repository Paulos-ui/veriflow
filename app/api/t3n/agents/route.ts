import { NextResponse } from "next/server";
import { authenticateOperator, provisionAgent } from "@/lib/t3n-client";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { name, role } = await req.json();
    if (!name || !role) {
      return NextResponse.json({ error: "name and role are required" }, { status: 400 });
    }
    const operator = await authenticateOperator();
    const agent = await provisionAgent({ name, role });
    return NextResponse.json({
      id: agent.id,
      name,
      role,
      did: agent.did,
      agentPubkey: agent.agentPubkey,
      status: agent.status,
      operatorDid: operator.did,
      createdAt: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "provisioning failed" },
      { status: 500 }
    );
  }
}
