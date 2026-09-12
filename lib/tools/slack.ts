import "server-only";
import { z } from "zod";
import type { ToolResult } from "./types";
import type { PostProposalInput, AwaitApprovalInput, PostProofInput } from "./registry";
import { usd } from "@/lib/mandate/refusal";

// =============================================================================
// Slack adapter — the comms poster's three tools.
//
// SLACK_BOT_TOKEN is read here and nowhere else in the codebase.
//
// The interesting one is awaitApproval. Slack's own semantics are "no reaction
// yet" and "no reaction ever" look identical, so the deadline is what turns the
// second into a decision. This module NEVER returns "approved" on a timeout,
// and the gate refuses on anything that isn't an explicit approval — two
// independent places that have to both be wrong before silence becomes consent.
// =============================================================================

const SLACK = "https://slack.com/api";

const APPROVE = ["white_check_mark", "heavy_check_mark", "+1"];
const DENY = ["x", "no_entry", "-1"];

function token(): string | null {
  return process.env.SLACK_BOT_TOKEN ?? null;
}

async function slack(method: string, body: unknown, botToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${SLACK}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  // Slack returns HTTP 200 with ok:false, so status alone proves nothing.
  if (!json.ok) throw new Error(`Slack ${method} failed: ${String(json.error ?? "unknown")}`);
  return json;
}

export type Approval = "approved" | "denied" | "timeout";

export async function postProposal(
  input: z.infer<typeof PostProposalInput>
): Promise<ToolResult<{ messageTs: string; permalink: string | null }>> {
  const bot = token();
  const text = [
    `*Payment proposal* · case \`${input.caseId}\``,
    `Vendor: *${input.vendor}*`,
    `Amount: *${usd(input.amountCents)}*`,
    `Due: ${input.dueDate}`,
    "",
    `React :white_check_mark: to approve or :x: to deny. No reaction before the deadline stops the case.`,
  ].join("\n");

  if (!bot) {
    return {
      output: { messageTs: `sim.${Date.now()}`, permalink: null },
      provenance: "simulated",
      refs: { channel: input.channel, preview: text },
    };
  }

  const res = await slack("chat.postMessage", { channel: input.channel, text }, bot);
  return {
    output: { messageTs: String(res.ts), permalink: null },
    provenance: "live",
    refs: { channel: input.channel, ts: String(res.ts) },
  };
}

export async function awaitApproval(
  input: z.infer<typeof AwaitApprovalInput>
): Promise<ToolResult<{ approval: Approval; by: string | null }>> {
  const bot = token();

  if (!bot) {
    // Demo mode reads the intended outcome from the message ts the runner
    // minted, so a judge can exercise approve AND deny without a Slack
    // workspace. It never defaults to approved: an unrecognised marker times
    // out, matching what the live path does on silence.
    const approval: Approval = input.messageTs.includes("-deny")
      ? "denied"
      : input.messageTs.includes("-approve")
        ? "approved"
        : "timeout";
    return {
      output: { approval, by: approval === "timeout" ? null : "demo.reviewer" },
      provenance: "simulated",
      refs: { channel: input.channel },
    };
  }

  // Poll until the deadline. Slack has no "wait for reaction" call, so the
  // deadline is ours to enforce — and enforcing it is the whole point.
  const deadlineMs = input.deadlineSecs * 1000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < deadlineMs) {
    const res = await slack(
      "reactions.get",
      { channel: input.channel, timestamp: input.messageTs },
      bot
    );
    const reactions =
      ((res.message as { reactions?: { name: string; users: string[] }[] } | undefined)?.reactions) ?? [];

    const denied = reactions.find((r) => DENY.includes(r.name));
    if (denied) {
      return {
        output: { approval: "denied", by: denied.users[0] ?? null },
        provenance: "live",
        refs: { channel: input.channel, reaction: denied.name },
      };
    }
    const approved = reactions.find((r) => APPROVE.includes(r.name));
    if (approved) {
      return {
        output: { approval: "approved", by: approved.users[0] ?? null },
        provenance: "live",
        refs: { channel: input.channel, reaction: approved.name },
      };
    }

    await new Promise((r) => setTimeout(r, 2_000));
  }

  // Deadline passed with no reaction. This is a timeout, not an approval.
  return {
    output: { approval: "timeout", by: null },
    provenance: "live",
    refs: { channel: input.channel },
  };
}

export async function postProof(
  input: z.infer<typeof PostProofInput>
): Promise<ToolResult<{ messageTs: string }>> {
  const bot = token();
  const text = [
    `*Case sealed* · \`${input.caseId}\``,
    `Proof: \`${input.proofHash.slice(0, 24)}…\``,
    `Every hop is hashed against the one before it. Altering any step breaks the chain from that point on.`,
  ].join("\n");

  if (!bot) {
    return {
      output: { messageTs: `sim.${Date.now()}` },
      provenance: "simulated",
      refs: { channel: input.channel, preview: text },
    };
  }

  const res = await slack("chat.postMessage", { channel: input.channel, text }, bot);
  return {
    output: { messageTs: String(res.ts) },
    provenance: "live",
    refs: { channel: input.channel, ts: String(res.ts) },
  };
}
