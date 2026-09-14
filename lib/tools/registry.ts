import { z } from "zod";
import { ROSTER } from "@/lib/agents/roster";
import type { ToolDescriptor } from "./types";
import { describeTool } from "./types";

// =============================================================================
// The registry. Ten tools across seven external apps, each bound to exactly one
// agent key.
//
// This module holds DESCRIPTORS ONLY — schemas and demand-derivation, no
// network code and no credentials. That is why the gate, the planner, the
// tests, and eventually the roster UI can all import it freely. The executors
// that hold tokens live in sibling modules and are reached through the loader
// in runner.ts, after a ruling, one at a time.
//
// Terminal 3 is deliberately absent from this list. It is the trust layer that
// attests these calls, not one of the apps being acted upon.
// =============================================================================

// --- Gmail — the mail reader's two tools ------------------------------------

export const FindInvoiceInput = z.object({
  sender: z.string().min(3),
  label: z.string().min(1),
  /** Narrowing terms; the sender/label allowlists do the real constraining. */
  query: z.string().default("has:attachment invoice"),
});

const gmailFindInvoice = describeTool({
  name: "gmail.find_invoice",
  agentPubkey: ROSTER["mail.reader"].agentPubkey,
  sideEffect: "read",
  summary: "Search one label for an invoice from an allowlisted sender",
  inputSchema: FindInvoiceInput,
  demand: (i) => ({ gmailSender: i.sender, gmailLabel: i.label }),
  requiresApproval: false,
});

export const FetchAttachmentInput = z.object({
  messageId: z.string().min(1),
  sender: z.string().min(3),
  attachmentId: z.string().min(1),
});

const gmailFetchAttachment = describeTool({
  name: "gmail.fetch_attachment",
  agentPubkey: ROSTER["mail.reader"].agentPubkey,
  sideEffect: "read",
  summary: "Pull the invoice PDF off a message already inside scope",
  inputSchema: FetchAttachmentInput,
  // Re-declares the sender so the gate re-checks scope on the second call too.
  // Passing a message id alone would let hop 2 escape the hop 1 allowlist.
  demand: (i) => ({ gmailSender: i.sender }),
  requiresApproval: false,
});

// --- Slack — the comms poster's three tools ---------------------------------

export const PostProposalInput = z.object({
  channel: z.string().min(1),
  caseId: z.string().min(1),
  vendor: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  dueDate: z.string(),
});

const slackPostProposal = describeTool({
  name: "slack.post_proposal",
  agentPubkey: ROSTER["comms.poster"].agentPubkey,
  sideEffect: "write",
  summary: "Post the pay proposal to the approval channel",
  inputSchema: PostProposalInput,
  // No amountCents in the demand: posting a number is not spending it. The cap
  // is the pay clerk's constraint, and putting it here too would refuse to even
  // ASK a human about an over-cap invoice — which is the opposite of useful.
  demand: (i) => ({ slackChannel: i.channel }),
  requiresApproval: false,
});

export const AwaitApprovalInput = z.object({
  channel: z.string().min(1),
  messageTs: z.string().min(1),
  /** Wall-clock deadline. Silence past this is a timeout, never consent. */
  deadlineSecs: z.number().int().positive(),
});

const slackAwaitApproval = describeTool({
  name: "slack.await_approval",
  agentPubkey: ROSTER["comms.poster"].agentPubkey,
  sideEffect: "read",
  summary: "Watch the proposal for an approve or deny reaction",
  inputSchema: AwaitApprovalInput,
  demand: (i) => ({ slackChannel: i.channel }),
  requiresApproval: false,
});

export const PostProofInput = z.object({
  channel: z.string().min(1),
  caseId: z.string().min(1),
  proofHash: z.string().min(8),
});

const slackPostProof = describeTool({
  name: "slack.post_proof",
  agentPubkey: ROSTER["comms.poster"].agentPubkey,
  sideEffect: "write",
  summary: "Post the sealed proof chain back to the channel",
  inputSchema: PostProofInput,
  demand: (i) => ({ slackChannel: i.channel }),
  requiresApproval: false,
});

// --- Payment — the pay clerk's single tool ----------------------------------

export const ChargeInput = z.object({
  vendor: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  reference: z.string().min(1),
  idempotencyKey: z.string().min(8),
});

const payCharge = describeTool({
  name: "pay.charge",
  agentPubkey: ROSTER["pay.clerk"].agentPubkey,
  sideEffect: "write",
  summary: "Pay an allowlisted vendor under the mandate cap",
  inputSchema: ChargeInput,
  demand: (i) => ({ vendor: i.vendor, amountCents: i.amountCents }),
  // The only tool in the system that cannot run without a human having said yes.
  requiresApproval: true,
});

// --- the Arena's four — one tool each, one destination each ------------------
//
// Every one of these carries an `idempotencyKey` in its schema rather than
// leaving de-duplication to the adapter's discretion. A double-clicked button
// and a retried request are indistinguishable at the network layer, so the key
// is derived upstream from the event id and passed down; each adapter then uses
// whichever de-duplication its app actually offers, and says so.
//
// None of the four requires human approval. That is a deliberate asymmetry with
// pay.charge: opening an issue is reversible and a payment is not, and putting a
// gate in front of a reversible write would cheapen the one gate that matters.

export const OpenIssueInput = z.object({
  /** `owner/repo`. Re-declared per call so the gate re-checks it every time. */
  repo: z.string().regex(/^[^/\s]+\/[^/\s]+$/, "expected owner/repo"),
  title: z.string().min(1).max(256),
  body: z.string().min(1),
  idempotencyKey: z.string().min(8),
});

const githubOpenIssue = describeTool({
  name: "github.open_issue",
  agentPubkey: ROSTER["repo.scribe"].agentPubkey,
  sideEffect: "write",
  summary: "Open an issue on the one allowlisted repository",
  inputSchema: OpenIssueInput,
  demand: (i) => ({ repo: i.repo }),
  requiresApproval: false,
});

export const SendMessageInput = z.object({
  /** Chat id, not a username. Usernames can be transferred; ids cannot. */
  chat: z.string().min(1),
  text: z.string().min(1).max(4096),
  idempotencyKey: z.string().min(8),
});

const telegramSendMessage = describeTool({
  name: "telegram.send_message",
  agentPubkey: ROSTER["signal.courier"].agentPubkey,
  sideEffect: "write",
  summary: "Send one alert to the one allowlisted chat",
  inputSchema: SendMessageInput,
  demand: (i) => ({ chat: i.chat }),
  requiresApproval: false,
});

export const CreateEntryInput = z.object({
  database: z.string().min(1),
  title: z.string().min(1),
  outcome: z.string().min(1),
  findingCount: z.number().int().nonnegative(),
  severity: z.string().min(1),
  subjectHash: z.string().min(8),
  idempotencyKey: z.string().min(8),
});

const notionCreateEntry = describeTool({
  name: "notion.create_entry",
  agentPubkey: ROSTER["ledger.archivist"].agentPubkey,
  sideEffect: "write",
  summary: "File one run record in the one allowlisted database",
  inputSchema: CreateEntryInput,
  demand: (i) => ({ database: i.database }),
  requiresApproval: false,
});

export const AnchorMemoInput = z.object({
  /** Cluster name, checked against the mandate. `mainnet-beta` is never listed. */
  cluster: z.string().min(1),
  /** What goes on chain: a hash and a label, never the underlying data. */
  memo: z.string().min(1).max(566),
  idempotencyKey: z.string().min(8),
});

const solanaAnchorMemo = describeTool({
  name: "solana.anchor_memo",
  agentPubkey: ROSTER["chain.notary"].agentPubkey,
  sideEffect: "write",
  summary: "Anchor the proof hash as a memo on Solana devnet",
  inputSchema: AnchorMemoInput,
  demand: (i) => ({ cluster: i.cluster }),
  requiresApproval: false,
});

// --- the registry -----------------------------------------------------------

const ALL: ToolDescriptor<never>[] = [
  gmailFindInvoice,
  gmailFetchAttachment,
  slackPostProposal,
  slackAwaitApproval,
  slackPostProof,
  payCharge,
  githubOpenIssue,
  telegramSendMessage,
  notionCreateEntry,
  solanaAnchorMemo,
] as unknown as ToolDescriptor<never>[];

export const TOOLS: ReadonlyMap<string, ToolDescriptor<never>> = new Map(
  ALL.map((t) => [t.name, t])
);

/** Undefined for unknown names — the gate turns that into an `unknown_tool`. */
export function descriptorFor(name: string): ToolDescriptor<never> | undefined {
  return TOOLS.get(name);
}

export function toolsForAgent(agentPubkey: string): ToolDescriptor<never>[] {
  return ALL.filter((t) => t.agentPubkey === agentPubkey);
}

export const TOOL_NAMES: string[] = ALL.map((t) => t.name);
