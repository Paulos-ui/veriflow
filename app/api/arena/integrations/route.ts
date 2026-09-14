import { NextResponse } from "next/server";
import { ACTION_APP, ACTION_LABEL, ACTION_TYPES } from "@/lib/arena/events";
import { NOT_CONFIGURED, arenaTargets, configured } from "@/lib/agents/targets";
import { ROSTER } from "@/lib/agents/roster";
import type { AgentRole } from "@/lib/agents/roster";
import type { ActionType, IntegrationReport } from "@/lib/arena/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// =============================================================================
// GET /api/arena/integrations — what this deployment can actually reach.
//
// The Arena has to say what it cannot do BEFORE somebody presses run, or the
// first thing a visitor learns is that half the buttons do nothing. So this
// reports, per integration, whether it is wired up and exactly which single
// destination it may write to.
//
// On what is returned and what is not: destinations are returned, credentials
// never are. A repository name, a chat id, a database id and a cluster name are
// not secrets — none of them grants anything without the token that pairs with
// it, and all four are already visible in the mandate the UI renders. Publishing
// the ALLOWLIST is the product: an operator who cannot see where an agent may
// write has no way to judge whether the limit is tight enough.
//
// The tokens themselves are read in exactly two places — lib/agents/targets.ts,
// which only ever tests them for presence, and the adapters, which are loaded
// dynamically and only past the gate. Neither is reachable from the client.
// =============================================================================

const AGENT: Record<ActionType, AgentRole> = {
  record: "repo.scribe",
  signal: "signal.courier",
  archive: "ledger.archivist",
  anchor: "chain.notary",
};

export async function GET() {
  const targets = arenaTargets();
  const ready = configured();

  const destination: Record<ActionType, string> = {
    record: targets.repo,
    signal: targets.chat,
    archive: targets.database,
    anchor: targets.cluster,
  };

  const body: IntegrationReport = {
    integrations: ACTION_TYPES.map((type) => {
      const agent = ROSTER[AGENT[type]];
      return {
        type,
        app: ACTION_APP[type],
        action: ACTION_LABEL[type],
        agent: agent.name,
        charter: agent.charter,
        configured: ready[type],
        /** The one place this agent may write. Empty when nothing is set. */
        target: destination[type],
        /** What to show instead of a result. Null when the integration is live. */
        hint: ready[type] ? null : NOT_CONFIGURED[type],
      };
    }),
    // Whether narration and planning will be done by a model or by the
    // deterministic writers. Stated up front so nobody has to guess which one
    // produced the sentence they are reading.
    reasoning: {
      configured: Boolean(process.env.GROQ_API_KEY?.trim()),
      hint: process.env.GROQ_API_KEY?.trim()
        ? null
        : "Groq is not configured yet. Set GROQ_API_KEY. Runs still work; the summary and the plan come from the deterministic writers instead.",
    },
  };

  return NextResponse.json(body);
}
