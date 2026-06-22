// =============================================================================
// VeriFlow domain model
// Shared across client (Zustand, components) and server (route handlers, libs).
// =============================================================================

export type AgentStatus = "provisioning" | "active" | "suspended";

/** An AI agent with a verifiable decentralized identity issued by Terminal 3. */
export interface Agent {
  id: string;
  name: string;
  role: string; // e.g. "Finance Agent"
  did: string; // verifiable identity (operator DID for self-acting; display id per agent)
  agentPubkey: string; // secp256k1 delegatee key — how T3 delegation identifies the agent
  status: AgentStatus;
  createdAt: string; // ISO
}

/** A scoped permission = a Terminal 3 DelegationCredential issued to an agent. */
export interface Permission {
  id: string;
  agentId: string;
  credentialId: string; // T3 vc_id (delegation credential id)
  maxApprovalAmount: number; // USD ceiling -> credential batch_cap_cents
  allowedVendors: string[]; // empty = any -> credential metadata/scope constraint
  functions: string[]; // contract functions the agent may invoke
  expiresAt: string | null; // ISO -> credential not_after_secs
  issuedAt: string; // ISO
  active: boolean; // revocable via T3 revokeDelegation
}

/** An invoice presented to an agent for analysis. */
export interface Invoice {
  id: string;
  vendor: string;
  amount: number; // USD
  currency: "USD";
  dueDate: string; // ISO
  lineItems: InvoiceLineItem[];
  reference: string; // PO / invoice number
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

export type Verdict = "approve" | "reject" | "needs_review";

/** Structured, validated output of the Groq reasoning step — the visible "thinking". */
export interface AgentDecision {
  verdict: Verdict;
  confidence: number; // 0..1
  summary: string; // one-line rationale
  reasons: string[]; // supporting points
  flags: string[]; // risks / policy concerns
  withinPermissions: boolean; // checked against the agent's scoped credential
}

export type AttestationStatus = "pending" | "verified" | "failed";

/** A cryptographic proof returned by Terminal 3 after a protected action. */
export interface Attestation {
  id: string;
  proofHash: string; // the hash that "seals" in the proof viewer
  txHash: string | null; // ledger ref from client.execute()
  status: AttestationStatus;
  teeQuoteVerified: boolean; // result of verifyTdxQuote()
  rtmr3: string | null; // TEE measurement register from the verified quote
  auditEventId: string | null; // host-stamped audit event (getAuditEvents)
  verifiedAt: string | null; // ISO
}

export type AuditAction =
  | "agent.registered"
  | "permission.issued"
  | "invoice.analyzed"
  | "action.executed"
  | "action.rejected";

/** An immutable audit entry. */
export interface AuditEntry {
  id: string;
  agentId: string;
  action: AuditAction;
  detail: string;
  attestationId: string | null;
  timestamp: string; // ISO
}

/** A full workflow run: invoice -> decision -> (execution) -> attestation. */
export interface WorkflowRun {
  id: string;
  agentId: string;
  invoice: Invoice;
  decision: AgentDecision | null;
  attestation: Attestation | null;
  state: "analyzing" | "decided" | "executing" | "attested" | "rejected";
  startedAt: string; // ISO
}
