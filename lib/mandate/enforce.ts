import type { Demand, Mandate } from "./model";
import { nowSecs } from "./model";
import type { Ruling } from "./refusal";
import { ALLOW, deny, usd } from "./refusal";

// =============================================================================
// The gate. Every tool call in VeriFlow passes through this function, and a
// call that has not been ruled on here never leaves the server.
//
// Three properties this file exists to guarantee:
//
//   1. It returns, never throws. A throw can be swallowed by a try/catch in a
//      caller that meant to catch a network error; a returned Denied has to be
//      destructured to get at anything useful.
//
//   2. Absence is refusal. Every scope check below refuses when the mandate is
//      SILENT on that dimension, not just when it lists a conflicting value. A
//      mandate that forgot to mention vendors authorises payment to nobody.
//
//   3. Order is fixed and cheap-first, so the refusal an operator sees is the
//      most fundamental one. An expired mandate asking for an unlisted vendor
//      reports "expired" — fix that first, then discover the vendor problem.
// =============================================================================

export interface CallRequest {
  /** Delegatee pubkey of the agent attempting the call. */
  agentPubkey: string;
  /** Tool name as registered. Unrecognised names are refused, not ignored. */
  tool: string;
  /** What the call needs authority for, derived by the tool's own `demand`. */
  demand: Demand;
  /** The agent's mandate, or null if it holds none. */
  mandate: Mandate | null;
  /** Human gate state, for tools that require approval. */
  approval?: "approved" | "denied" | "timeout" | "pending";
  /** Seconds since epoch. Injected by tests. */
  at?: number;
}

/** Shape of the tool facts the gate needs. Structural, to avoid a cycle. */
export interface GateToolFacts {
  name: string;
  /** Delegatee pubkey this tool is bound to. */
  agentPubkey: string;
  sideEffect: "read" | "write";
  /** True when a human gate must have passed before this can run. */
  requiresApproval: boolean;
}

export function enforce(req: CallRequest, tool: GateToolFacts | undefined): Ruling {
  const at = req.at ?? nowSecs();

  // --- 1. the tool must exist -------------------------------------------------
  // A typo'd or hallucinated tool name is refused rather than resolving to
  // nothing. This is the arm that catches a model inventing `stripe.refund`.
  if (!tool) {
    return deny("unknown_tool", `No tool named "${req.tool}" is registered.`, {
      remedy: "Tool names come from the registry; nothing else is callable.",
    });
  }

  // --- 2. the tool must belong to the calling agent ---------------------------
  // Structural separation: pay.charge is bound to the pay clerk's key. The mail
  // reader calling it is refused here even if its mandate somehow listed it.
  if (tool.agentPubkey !== req.agentPubkey) {
    return deny("wrong_agent", `${tool.name} is bound to another agent's key.`, {
      evidence: {
        label: "Bound delegatee",
        allowed: shortKey(tool.agentPubkey),
        attempted: shortKey(req.agentPubkey),
      },
      remedy: "Route this step to the agent that holds the tool.",
    });
  }

  // --- 3. a mandate must exist, be unrevoked, and be in its window ------------
  const m = req.mandate;
  if (!m) {
    return deny("mandate_missing", "This agent holds no mandate, so it holds no authority.", {
      remedy: "Issue a scoped mandate before running the case.",
    });
  }
  if (m.agentPubkey !== req.agentPubkey) {
    return deny("wrong_agent", "The presented mandate was issued to a different key.", {
      evidence: {
        label: "Mandate subject",
        allowed: shortKey(m.agentPubkey),
        attempted: shortKey(req.agentPubkey),
      },
    });
  }
  if (m.revoked) {
    return deny("mandate_revoked", "The operator revoked this mandate.", {
      remedy: "Re-issue the mandate to resume the case.",
    });
  }
  if (at < m.notBeforeSecs) {
    return deny("mandate_expired", "This mandate is not valid yet.", {
      evidence: { label: "Valid from", allowed: iso(m.notBeforeSecs), attempted: iso(at) },
    });
  }
  if (at >= m.notAfterSecs) {
    return deny("mandate_expired", "This mandate has expired.", {
      evidence: { label: "Expired", allowed: iso(m.notAfterSecs), attempted: iso(at) },
      remedy: "Re-issue with a later expiry.",
    });
  }

  // --- 4. the tool must be named in the mandate ------------------------------
  if (!m.functions.includes(tool.name)) {
    return deny("tool_not_in_mandate", `${tool.name} is not among this agent's permitted functions.`, {
      evidence: {
        label: "Permitted",
        allowed: m.functions.length ? m.functions.join(", ") : "(none)",
        attempted: tool.name,
      },
      remedy: "Add the function to the mandate, or let a different agent do this.",
    });
  }

  // --- 5. scopes -------------------------------------------------------------
  // Each block refuses on absence as well as on mismatch. `allowlist(...)`
  // treats undefined as an empty list for exactly that reason.
  const d = req.demand;
  const s = m.scopes;

  if (d.gmailSender !== undefined) {
    const allowed = allowlist(s.gmailSenders);
    if (!allowed.some((a) => sameAddress(a, d.gmailSender!))) {
      return deny("scope_mismatch", "That sender is outside the mandate's Gmail scope.", {
        evidence: { label: "Allowed senders", allowed: fmtList(allowed), attempted: d.gmailSender },
        remedy: "Add the sender to the mandate's Gmail scope.",
      });
    }
  }

  if (d.gmailLabel !== undefined) {
    const allowed = allowlist(s.gmailLabels);
    if (!allowed.includes(d.gmailLabel)) {
      return deny("scope_mismatch", "That label is outside the mandate's Gmail scope.", {
        evidence: { label: "Allowed labels", allowed: fmtList(allowed), attempted: d.gmailLabel },
      });
    }
  }

  if (d.slackChannel !== undefined) {
    const allowed = allowlist(s.slackChannels);
    if (!allowed.includes(d.slackChannel)) {
      return deny("scope_mismatch", "That channel is outside the mandate's Slack scope.", {
        evidence: { label: "Allowed channels", allowed: fmtList(allowed), attempted: d.slackChannel },
        remedy: "Mandates pin channel ids, not names — check the id.",
      });
    }
  }

  if (d.vendor !== undefined) {
    const allowed = allowlist(s.vendors);
    if (!allowed.some((v) => sameVendor(v, d.vendor!))) {
      return deny("scope_mismatch", `${d.vendor} is not on the vendor allowlist.`, {
        evidence: { label: "Allowed vendors", allowed: fmtList(allowed), attempted: d.vendor },
        remedy: "Add the vendor to the mandate, or pay it by hand outside VeriFlow.",
      });
    }
  }

  // The Arena's four destinations. Same fail-closed shape as the four above: a
  // mandate silent on repositories authorises writing to no repository, which is
  // what makes "opens issues on one allowlisted repo" a checked claim rather
  // than a sentence in a charter.
  if (d.repo !== undefined) {
    const allowed = allowlist(s.repos);
    if (!allowed.some((r) => sameRepo(r, d.repo!))) {
      return deny("scope_mismatch", `${d.repo} is outside the mandate's repository scope.`, {
        evidence: { label: "Allowed repos", allowed: fmtList(allowed), attempted: d.repo },
        remedy: "Set GITHUB_OWNER and GITHUB_REPO to the repository you mean.",
      });
    }
  }

  if (d.chat !== undefined) {
    const allowed = allowlist(s.chats);
    if (!allowed.includes(d.chat)) {
      return deny("scope_mismatch", "That chat is outside the mandate's Telegram scope.", {
        evidence: { label: "Allowed chats", allowed: fmtList(allowed), attempted: d.chat },
        remedy: "Mandates pin chat ids, not usernames — check TELEGRAM_CHAT_ID.",
      });
    }
  }

  if (d.database !== undefined) {
    const allowed = allowlist(s.databases);
    if (!allowed.includes(d.database)) {
      return deny("scope_mismatch", "That database is outside the mandate's Notion scope.", {
        evidence: { label: "Allowed databases", allowed: fmtList(allowed), attempted: d.database },
        remedy: "Check NOTION_DATABASE_ID against the database you shared with the integration.",
      });
    }
  }

  if (d.cluster !== undefined) {
    const allowed = allowlist(s.clusters);
    if (!allowed.includes(d.cluster)) {
      // The arm that stops a mainnet broadcast. `mainnet-beta` is not in any
      // mandate this codebase issues, so reaching for it is refused here rather
      // than being prevented by whoever remembers to check the RPC URL.
      return deny("scope_mismatch", `${d.cluster} is not a cluster this agent may broadcast to.`, {
        evidence: { label: "Allowed clusters", allowed: fmtList(allowed), attempted: d.cluster },
        remedy: "VeriFlow anchors on devnet. Point SOLANA_RPC_URL at a devnet endpoint.",
      });
    }
  }

  // --- 6. cap ----------------------------------------------------------------
  // Strictly greater than. A call for exactly the cap is inside authority; one
  // cent over is not. The deny-path suite pins both sides of that boundary.
  if (d.amountCents !== undefined) {
    if (!Number.isFinite(d.amountCents) || d.amountCents < 0) {
      return deny("cap_exceeded", "The amount is not a usable number of cents.", {
        evidence: { label: "Cap", allowed: usd(m.batchCapCents), attempted: String(d.amountCents) },
      });
    }
    if (d.amountCents > m.batchCapCents) {
      return deny("cap_exceeded", "This payment is over the mandate's cap.", {
        evidence: {
          label: "Cap",
          allowed: usd(m.batchCapCents),
          attempted: usd(d.amountCents),
        },
        remedy: "Raise the cap deliberately, or split the payment.",
      });
    }
  }

  // --- 7. the human gate -----------------------------------------------------
  // Only reached once the call is otherwise inside the mandate: a human is
  // never asked to approve something the mandate would refuse anyway.
  if (tool.requiresApproval) {
    switch (req.approval) {
      case "approved":
        break;
      case "denied":
        return deny("approval_denied", "A human reviewer denied this step.", {
          remedy: "The chain stops here. Start a new case if this was wrong.",
        });
      case "timeout":
        return deny("approval_timeout", "The approval window closed with no answer.", {
          remedy: "Silence is not consent. Re-run the case to ask again.",
        });
      case "pending":
      case undefined:
      default:
        return deny("approval_timeout", "This step requires a human approval that has not been given.", {
          remedy: "Post the proposal to the approval channel first.",
        });
    }
  }

  return ALLOW;
}

// --- helpers -----------------------------------------------------------------

/** undefined scope == empty allowlist. This is the fail-closed hinge. */
function allowlist(v: string[] | undefined): string[] {
  return v ?? [];
}

function fmtList(v: string[]): string {
  return v.length ? v.join(", ") : "(none)";
}

/** `Billing <ap@acme.com>` and `ap@acme.com` are the same sender. */
function sameAddress(a: string, b: string): boolean {
  return bareAddress(a) === bareAddress(b);
}

function bareAddress(v: string): string {
  const angled = v.match(/<([^>]+)>/);
  return (angled ? angled[1] : v).trim().toLowerCase();
}

/** Vendor names arrive from a model, so compare without case or padding. */
function sameVendor(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** GitHub owners and repository names are case-insensitive. Slashes are not. */
function sameRepo(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function shortKey(k: string): string {
  return k.length > 14 ? `${k.slice(0, 10)}…${k.slice(-4)}` : k;
}

function iso(secs: number): string {
  return new Date(secs * 1000).toISOString().replace(".000", "");
}
