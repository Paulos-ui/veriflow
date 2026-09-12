import type { Mandate } from "@/lib/mandate/model";

// =============================================================================
// The roster: four agents, four keys, four different amounts of authority.
//
// The demo's whole claim rests on these being genuinely separate principals.
// Each holds its own delegatee key, so "the mail reader cannot pay" is enforced
// by the gate comparing keys (enforce.ts step 2) — not by anyone remembering
// not to call the wrong function.
//
// The orchestrator is the interesting one: its `functions` list is EMPTY. It
// plans and assigns, and it holds no app tokens at all. If it ever tries to
// touch Gmail, Slack, or Stripe directly, step 4 of the gate refuses it.
// =============================================================================

export type AgentRole = "orchestrator" | "mail.reader" | "comms.poster" | "pay.clerk";

export interface RosterAgent {
  role: AgentRole;
  /** Display name used in the roster and on hop nodes. */
  name: string;
  /** One line explaining what this agent is FOR, in domain language. */
  charter: string;
  /**
   * Stable demo key. In `live` mode these are replaced by real secp256k1
   * delegatee pubkeys from lib/keystore.ts at provisioning time; the shape is
   * kept identical so nothing downstream has to branch on mode.
   */
  agentPubkey: string;
}

export const ROSTER: Record<AgentRole, RosterAgent> = {
  orchestrator: {
    role: "orchestrator",
    name: "Atlas",
    charter: "Reads the case, proposes the plan, assigns each hop. Touches no external app.",
    agentPubkey: "0x04a1c7orchestrator0000000000000000000000000000000000000000000001",
  },
  "mail.reader": {
    role: "mail.reader",
    name: "Ferris",
    charter: "Reads invoice mail from allowlisted senders. Holds Google credentials only.",
    agentPubkey: "0x04b2d8mailreader00000000000000000000000000000000000000000000002",
  },
  "comms.poster": {
    role: "comms.poster",
    name: "Harbor",
    charter: "Posts proposals and proofs to one approval channel. Holds the Slack token only.",
    agentPubkey: "0x04c3e9commsposter0000000000000000000000000000000000000000000003",
  },
  "pay.clerk": {
    role: "pay.clerk",
    name: "Sterling",
    charter: "Moves money to allowlisted vendors under a cap, only after a human approves.",
    agentPubkey: "0x04d4fapayclerk000000000000000000000000000000000000000000000004",
  },
};

export function agentFor(role: AgentRole): RosterAgent {
  return ROSTER[role];
}

export function roleForKey(pubkey: string): AgentRole | undefined {
  return (Object.keys(ROSTER) as AgentRole[]).find((r) => ROSTER[r].agentPubkey === pubkey);
}

// --- default mandates --------------------------------------------------------
// The AP Clerk case, as issued on a fresh install. Deliberately tight: one
// sender, one label, one channel, two vendors, $5,000. The demo's deny paths
// are all real consequences of these numbers, not special-cased branches.

const HOUR = 3600;

export function defaultMandates(issuedAt: number): Record<AgentRole, Mandate> {
  const common = {
    version: 1,
    notBeforeSecs: issuedAt,
    notAfterSecs: issuedAt + 24 * HOUR,
    revoked: false,
    credentialId: null,
  };

  return {
    orchestrator: {
      ...common,
      id: "mnd_orchestrator",
      agentPubkey: ROSTER.orchestrator.agentPubkey,
      functions: [], // plans only — no external reach whatsoever
      scopes: {},
      batchCapCents: 0,
    },
    "mail.reader": {
      ...common,
      id: "mnd_mail_reader",
      agentPubkey: ROSTER["mail.reader"].agentPubkey,
      functions: ["gmail.find_invoice", "gmail.fetch_attachment"],
      scopes: {
        // All three demo senders are readable. Reading is the cheap, reversible
        // half; the constraints that matter sit on the pay clerk below.
        gmailSenders: [
          "billing@aurora-systems.com",
          "ap@meridian-supply.com",
          "invoices@halcyon-logistics.com",
        ],
        gmailLabels: ["INBOX/Invoices"],
      },
      batchCapCents: 0,
    },
    "comms.poster": {
      ...common,
      id: "mnd_comms_poster",
      agentPubkey: ROSTER["comms.poster"].agentPubkey,
      functions: ["slack.post_proposal", "slack.await_approval", "slack.post_proof"],
      scopes: { slackChannels: ["C07APCLERK01"] },
      batchCapCents: 0,
    },
    "pay.clerk": {
      ...common,
      id: "mnd_pay_clerk",
      agentPubkey: ROSTER["pay.clerk"].agentPubkey,
      functions: ["pay.charge"],
      // Aurora and Meridian are known vendors; Halcyon is deliberately absent.
      // Combined with the cap, this makes each demo invoice fail a DIFFERENT
      // rule: Aurora pays, Meridian breaks the cap, Halcyon breaks the
      // allowlist. Three distinct refusals, none of them special-cased.
      scopes: { vendors: ["Aurora Systems", "Meridian Supply"] },
      batchCapCents: 500_000, // $5,000.00
    },
  };
}
