import "server-only";
import { enforce } from "@/lib/mandate/enforce";
import type { Mandate } from "@/lib/mandate/model";
import type { Ruling } from "@/lib/mandate/refusal";
import { deny } from "@/lib/mandate/refusal";
import { descriptorFor } from "./registry";
import type { Provenance, ToolResult } from "./types";
import { AdapterUnavailable } from "./types";

// =============================================================================
// The runner: the ONLY path from a tool name to a side effect.
//
// Order here is the security property:
//
//   look up → validate input → derive demand → ENFORCE → only then load the
//   adapter module and execute.
//
// The adapter import is dynamic and happens AFTER the ruling. A refused call
// therefore never even loads the module that holds the credential — the token
// is not merely unused, it is never read into the process. That is what makes
// "the call never leaves the server" literally true rather than aspirational.
//
// Note there is no `force`, no `skipChecks`, no second entry point. If you want
// a side effect in VeriFlow, you come through this function.
// =============================================================================

export interface RunRequest {
  agentPubkey: string;
  tool: string;
  input: unknown;
  mandate: Mandate | null;
  approval?: "approved" | "denied" | "timeout" | "pending";
  at?: number;
}

export type RunOutcome =
  | { ok: true; result: ToolResult<unknown> }
  | { ok: false; ruling: Extract<Ruling, { ok: false }> };

/** Dynamic, one at a time, and only ever reached past the gate. */
async function load(tool: string): Promise<((input: never) => Promise<ToolResult<unknown>>) | null> {
  switch (tool) {
    case "gmail.find_invoice":
      return (await import("./gmail")).findInvoice as never;
    case "gmail.fetch_attachment":
      return (await import("./gmail")).fetchAttachment as never;
    case "slack.post_proposal":
      return (await import("./slack")).postProposal as never;
    case "slack.await_approval":
      return (await import("./slack")).awaitApproval as never;
    case "slack.post_proof":
      return (await import("./slack")).postProof as never;
    case "pay.charge":
      return (await import("./pay")).charge as never;
    case "github.open_issue":
      return (await import("./github")).openIssue as never;
    case "telegram.send_message":
      return (await import("./telegram")).sendMessage as never;
    case "notion.create_entry":
      return (await import("./notion")).createEntry as never;
    case "solana.anchor_memo":
      return (await import("./solana")).anchorMemo as never;
    default:
      return null;
  }
}

export async function runTool(req: RunRequest): Promise<RunOutcome> {
  const descriptor = descriptorFor(req.tool);

  // Unknown tools are ruled on by the gate so the refusal is uniform with
  // every other refusal — same shape, same taxonomy, same UI panel.
  if (!descriptor) {
    const ruling = enforce(
      { agentPubkey: req.agentPubkey, tool: req.tool, demand: {}, mandate: req.mandate, at: req.at },
      undefined
    );
    return { ok: false, ruling: ruling as Extract<Ruling, { ok: false }> };
  }

  // Validate before deriving demand: a malformed call must not reach the
  // scope extractor, or a missing field could silently read as "no scope
  // needed" and sail through the gate.
  const parsed = descriptor.inputSchema.safeParse(req.input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      ruling: deny("invalid_input", `The arguments for ${req.tool} did not match its schema.`, {
        evidence: { label: "Schema", allowed: "see tool contract", attempted: detail },
      }),
    };
  }

  const ruling = enforce(
    {
      agentPubkey: req.agentPubkey,
      tool: req.tool,
      demand: descriptor.demand(parsed.data as never),
      mandate: req.mandate,
      approval: req.approval,
      at: req.at,
    },
    descriptor
  );
  if (!ruling.ok) return { ok: false, ruling };

  const execute = await load(req.tool);
  if (!execute) {
    return {
      ok: false,
      ruling: deny("adapter_unavailable", `${req.tool} is registered but has no adapter wired.`),
    };
  }

  const result = await execute(parsed.data as never).catch((err: unknown) => {
    // An adapter that cannot honestly run says so, and the runner turns that
    // into a refusal value here — the one conversion point, so nothing above
    // this line ever sees a refusal expressed as an exception.
    if (err instanceof AdapterUnavailable) {
      return {
        __refused: deny("adapter_unavailable", err.message, {
          evidence: { label: err.label, allowed: "a live link", attempted: err.reason },
          remedy: err.remedy,
        }),
      } as const;
    }
    throw err; // A genuine bug. Never dressed up as a policy outcome.
  });

  if (result && typeof result === "object" && "__refused" in result) {
    return { ok: false, ruling: result.__refused };
  }

  return { ok: true, result: result as ToolResult<unknown> };
}

export type { Provenance };
