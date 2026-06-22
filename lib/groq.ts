import "server-only";
import { z } from "zod";
import type { AgentDecision, Invoice, Permission } from "@/types";

// =============================================================================
// Agent reasoning (SERVER-ONLY).
// Groq analyzes an invoice against the agent's scoped delegation and returns a
// STRUCTURED decision. JSON-forced + Zod-validated so the agent's "thinking" is
// trustworthy and renderable as visible proof. A deterministic guardrail sits
// on top of the model. When GROQ_API_KEY is absent we fall back to a heuristic
// so the workflow is always demoable.
// =============================================================================

const MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";

const DecisionSchema = z.object({
  verdict: z.enum(["approve", "reject", "needs_review"]),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(240),
  reasons: z.array(z.string()).max(6),
  flags: z.array(z.string()).max(6),
});

const SYSTEM_PROMPT = `You are VeriFlow's Finance Agent. You analyze a vendor invoice against a scoped spending mandate and decide whether to approve payment.

Rules:
- If the amount exceeds the mandate's maxApprovalAmount, you MUST NOT approve. Use "needs_review".
- If allowedVendors is non-empty and the vendor is not listed, you MUST NOT approve. Use "needs_review".
- Flag anything unusual: duplicate-looking references, math that doesn't add up, unknown vendors, round-number padding.
- Be decisive and concise. confidence reflects how clear-cut the case is.

Respond with ONLY a JSON object, no prose, no markdown fences:
{"verdict":"approve|reject|needs_review","confidence":0.0-1.0,"summary":"one sentence","reasons":["..."],"flags":["..."]}`;

function buildUserPrompt(invoice: Invoice, permission: Permission | null): string {
  const lineItems = invoice.lineItems
    .map((li) => `  - ${li.description}: ${li.quantity} x $${li.unitPrice}`)
    .join("\n");
  const scope = permission
    ? `maxApprovalAmount: $${permission.maxApprovalAmount}\nallowedVendors: ${
        permission.allowedVendors.length ? permission.allowedVendors.join(", ") : "(any)"
      }`
    : "NO ACTIVE MANDATE — agent may not approve anything.";
  return `INVOICE\nvendor: ${invoice.vendor}\namount: $${invoice.amount}\nreference: ${invoice.reference}\ndueDate: ${invoice.dueDate}\nlineItems:\n${lineItems}\n\nAGENT MANDATE\n${scope}`;
}

function applyGuardrail(
  parsed: z.infer<typeof DecisionSchema>,
  invoice: Invoice,
  permission: Permission | null
): AgentDecision {
  const overAmount = !permission || invoice.amount > permission.maxApprovalAmount;
  const vendorBlocked =
    !!permission &&
    permission.allowedVendors.length > 0 &&
    !permission.allowedVendors.includes(invoice.vendor);
  const withinPermissions = !overAmount && !vendorBlocked;
  return {
    ...parsed,
    withinPermissions,
    verdict:
      parsed.verdict === "approve" && !withinPermissions ? "needs_review" : parsed.verdict,
  };
}

/** Deterministic fallback when no GROQ_API_KEY is configured. */
function heuristicDecision(invoice: Invoice, permission: Permission | null): AgentDecision {
  const reasons: string[] = [];
  const flags: string[] = [];
  const lineTotal = invoice.lineItems.reduce((s, li) => s + li.quantity * li.unitPrice, 0);

  if (permission) {
    if (invoice.amount <= permission.maxApprovalAmount) {
      reasons.push(`Amount $${invoice.amount} is within the $${permission.maxApprovalAmount} mandate ceiling.`);
    } else {
      flags.push(`Amount $${invoice.amount} exceeds the $${permission.maxApprovalAmount} mandate ceiling.`);
    }
    if (permission.allowedVendors.length === 0 || permission.allowedVendors.includes(invoice.vendor)) {
      reasons.push(`Vendor "${invoice.vendor}" is permitted by the mandate.`);
    } else {
      flags.push(`Vendor "${invoice.vendor}" is not on the mandate's allow-list.`);
    }
  } else {
    flags.push("No active mandate — the agent has no authority to approve.");
  }
  if (Math.abs(lineTotal - invoice.amount) > 0.01) {
    flags.push(`Line items total $${lineTotal.toFixed(2)} but invoice is $${invoice.amount}.`);
  }
  if (invoice.amount % 1000 === 0 && invoice.amount >= 5000) {
    flags.push("Round-number total — worth a glance for padding.");
  }

  const verdict = flags.length === 0 ? "approve" : "needs_review";
  return applyGuardrail(
    {
      verdict,
      confidence: flags.length === 0 ? 0.88 : 0.6,
      summary:
        verdict === "approve"
          ? `Invoice from ${invoice.vendor} is within mandate and internally consistent.`
          : `Invoice from ${invoice.vendor} needs review — ${flags.length} concern(s) flagged.`,
      reasons,
      flags,
    },
    invoice,
    permission
  );
}

/** Run the agent's reasoning and return a validated, mandate-checked decision. */
export async function analyzeInvoice(
  invoice: Invoice,
  permission: Permission | null
): Promise<AgentDecision> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return heuristicDecision(invoice, permission);

  try {
    const { default: Groq } = await import("groq-sdk");
    const client = new Groq({ apiKey });
    const completion = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(invoice, permission) },
      ],
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = DecisionSchema.parse(JSON.parse(raw));
    return applyGuardrail(parsed, invoice, permission);
  } catch {
    // Never let the demo die on a model/network hiccup.
    return heuristicDecision(invoice, permission);
  }
}
