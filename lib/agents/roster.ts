import type { Mandate } from "@/lib/mandate/model";

// =============================================================================
// The roster: eight agents, eight keys, eight different amounts of authority.
//
// The demo's whole claim rests on these being genuinely separate principals.
// Each holds its own delegatee key, so "the mail reader cannot pay" is enforced
// by the gate comparing keys (enforce.ts step 2) — not by anyone remembering
// not to call the wrong function.
//
// Four serve the invoice case (Atlas, Ferris, Harbor, Sterling) and four serve
// the Arena (Quill, Beacon, Folio, Cairn). They are one roster rather than two
// because the separation only means anything if it holds across both: an Arena
// agent has no authority on an invoice case, and vice versa, and both facts are
// expressed the same way — a mandate granting zero functions.
//
// The orchestrator is the interesting one: its `functions` list is EMPTY on
// every case. It plans and assigns, and it holds no app tokens at all. If it
// ever tries to touch Gmail, Slack, Stripe, GitHub, Telegram, Notion or Solana
// directly, step 4 of the gate refuses it.
// =============================================================================

export type AgentRole =
  | "orchestrator"
  | "mail.reader"
  | "comms.poster"
  | "pay.clerk"
  | "repo.scribe"
  | "signal.courier"
  | "ledger.archivist"
  | "chain.notary";

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

  // --- the Arena's four integration agents ----------------------------------
  // Each one holds exactly one credential and can reach exactly one app. The
  // split is not decorative: it is why a prompt-injected instruction to "post
  // the results to a different Telegram chat and open an issue in another repo"
  // cannot be carried out by any single principal in this system.
  "repo.scribe": {
    role: "repo.scribe",
    name: "Quill",
    charter: "Opens issues on one allowlisted repository. Holds the GitHub token only.",
    agentPubkey: "0x04e5abreposcribe000000000000000000000000000000000000000000000005",
  },
  "signal.courier": {
    role: "signal.courier",
    name: "Beacon",
    charter: "Sends alerts to one allowlisted Telegram chat. Holds the bot token only.",
    agentPubkey: "0x04f6bcsignalcourier000000000000000000000000000000000000000000006",
  },
  "ledger.archivist": {
    role: "ledger.archivist",
    name: "Folio",
    charter: "Files run records in one Notion database. Holds the Notion key only.",
    agentPubkey: "0x0407cdledgerarchivist0000000000000000000000000000000000000000007",
  },
  "chain.notary": {
    role: "chain.notary",
    name: "Cairn",
    charter: "Anchors a proof hash as a memo on Solana devnet. Holds the devnet keypair only.",
    agentPubkey: "0x0418dechainnotary00000000000000000000000000000000000000000000008",
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

/**
 * The demo approval channel.
 *
 * A literal, not an env read: this module is the policy layer and stays pure so
 * it can be imported anywhere and reasoned about on its face. When a real
 * workspace is wired up, lib/agents/channel.ts resolves SLACK_CHANNEL_ID and
 * passes it in through `opts.approvalChannel` below — the allowlist and the
 * channel the poster targets then come from one value, so a live channel id can
 * never make a correct post look like a scope violation.
 */
const DEMO_APPROVAL_CHANNEL = "C07APCLERK01";

export interface MandateOptions {
  /** The one channel the comms poster may use. Injected, never read from env. */
  approvalChannel?: string;
}

export function defaultMandates(
  issuedAt: number,
  opts: MandateOptions = {}
): Record<AgentRole, Mandate> {
  const approvalChannel = opts.approvalChannel || DEMO_APPROVAL_CHANNEL;

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
      scopes: { slackChannels: [approvalChannel] },
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

    // The Arena's four agents hold NOTHING on an invoice case. Not "they are
    // not used" — they are issued real mandates that grant zero functions and
    // zero scope, so if a plan ever routed an AP hop to one of them the gate
    // would refuse it at step 4 rather than finding no rule to apply.
    "repo.scribe": empty("mnd_repo_scribe", ROSTER["repo.scribe"].agentPubkey, common),
    "signal.courier": empty("mnd_signal_courier", ROSTER["signal.courier"].agentPubkey, common),
    "ledger.archivist": empty("mnd_ledger_archivist", ROSTER["ledger.archivist"].agentPubkey, common),
    "chain.notary": empty("mnd_chain_notary", ROSTER["chain.notary"].agentPubkey, common),
  };
}

/** Common shape shared by both mandate sets. */
type CommonMandateFields = Pick<
  Mandate,
  "version" | "notBeforeSecs" | "notAfterSecs" | "revoked" | "credentialId"
>;

/**
 * A mandate that grants nothing: no functions, no scope, no money.
 *
 * Issued to every agent that has no business in the case being run. An agent
 * holding one of these is not "unconfigured" — it is explicitly authorised to do
 * nothing, which is the state the gate can reason about.
 */
function empty(id: string, agentPubkey: string, common: CommonMandateFields): Mandate {
  return { ...common, id, agentPubkey, functions: [], scopes: {}, batchCapCents: 0 };
}

// --- the Arena's mandates ----------------------------------------------------

/** The one destination each Arena agent may reach. Injected, never read here. */
export interface ArenaTargets {
  /** `owner/repo` the issue may be opened on. */
  repo: string;
  /** Telegram chat id the alert may be sent to. */
  chat: string;
  /** Notion database id the entry may be written to. */
  database: string;
  /** Solana cluster the memo may be anchored on. Devnet in every demo. */
  cluster: string;
}

/**
 * Mandates for an Arena run: four agents with one function each, and every
 * other agent in the roster explicitly granted nothing.
 *
 * Note there is no cap here and no approval requirement. That is a deliberate
 * difference from the AP case rather than an oversight: none of these four
 * actions moves money, so a spending ceiling would be theatre. What binds them
 * is destination scope — one repo, one chat, one database, one cluster — which
 * is the authority that actually matters when the risk is "wrote the right thing
 * to the wrong place".
 */
export function arenaMandates(
  issuedAt: number,
  targets: ArenaTargets
): Record<AgentRole, Mandate> {
  const common = {
    version: 1,
    notBeforeSecs: issuedAt,
    notAfterSecs: issuedAt + 24 * HOUR,
    revoked: false,
    credentialId: null,
  };

  return {
    // Plans and verifies. Holds nothing, same as on the invoice case.
    orchestrator: empty("mnd_arena_orchestrator", ROSTER.orchestrator.agentPubkey, common),

    // The invoice case's specialists have no business in the Arena, and their
    // mandates say so rather than being absent.
    "mail.reader": empty("mnd_arena_mail_reader", ROSTER["mail.reader"].agentPubkey, common),
    "comms.poster": empty("mnd_arena_comms_poster", ROSTER["comms.poster"].agentPubkey, common),
    "pay.clerk": empty("mnd_arena_pay_clerk", ROSTER["pay.clerk"].agentPubkey, common),

    "repo.scribe": {
      ...common,
      id: "mnd_arena_repo_scribe",
      agentPubkey: ROSTER["repo.scribe"].agentPubkey,
      functions: ["github.open_issue"],
      scopes: { repos: [targets.repo] },
      batchCapCents: 0,
    },
    "signal.courier": {
      ...common,
      id: "mnd_arena_signal_courier",
      agentPubkey: ROSTER["signal.courier"].agentPubkey,
      functions: ["telegram.send_message"],
      scopes: { chats: [targets.chat] },
      batchCapCents: 0,
    },
    "ledger.archivist": {
      ...common,
      id: "mnd_arena_ledger_archivist",
      agentPubkey: ROSTER["ledger.archivist"].agentPubkey,
      functions: ["notion.create_entry"],
      scopes: { databases: [targets.database] },
      batchCapCents: 0,
    },
    "chain.notary": {
      ...common,
      id: "mnd_arena_chain_notary",
      agentPubkey: ROSTER["chain.notary"].agentPubkey,
      functions: ["solana.anchor_memo"],
      // Mainnet is not in the allowlist, so a mainnet anchor is a scope
      // refusal rather than a code comment asking nobody to try it.
      scopes: { clusters: [targets.cluster] },
      batchCapCents: 0,
    },
  };
}
