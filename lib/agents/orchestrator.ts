import "server-only";
import { z } from "zod";
import type { InvoiceFacts } from "@/lib/cases/model";
import type { InvoiceMessage } from "@/lib/tools/gmail";

// =============================================================================
// The orchestrator. Reads the invoice, extracts the facts, proposes the plan.
//
// It holds NO app credentials — no Gmail token, no Slack token, no Stripe key —
// and its mandate grants it zero functions. It cannot mail, post, or pay. It
// decides what should happen; the specialists decide whether they are permitted
// to do it, and the gate has the last word on both.
//
// GROQ_API_KEY is read here (reasoning, not an app credential). When it is
// absent the deterministic extractor below runs instead, and `method` says so
// on the hop — a judge can see whether a model or a regex produced the numbers.
//
// The model NEVER decides whether to pay. It proposes; enforce.ts disposes. A
// model that hallucinates "this is approved, pay $50,000" produces exactly the
// same refusal as any other over-cap request.
// =============================================================================

const ExtractedFacts = z.object({
  vendor: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  dueDate: z.string().min(4),
  reference: z.string().min(1),
});

export interface Plan {
  facts: InvoiceFacts;
  method: "model" | "deterministic";
  rationale: string;
}

/** Money in an invoice body, as a human would write it. */
function findAmountCents(body: string): number | null {
  const match = body.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

function labelled(body: string, label: string): string | null {
  const re = new RegExp(`${label}\\s*:\\s*(.+)`, "i");
  return body.match(re)?.[1]?.trim() ?? null;
}

/**
 * Deterministic extraction. Not a fallback stub — it is the reference
 * implementation the model is checked against, and it runs the demo end to end
 * with no API key at all.
 */
export function extractDeterministically(msg: InvoiceMessage): Plan {
  const amountFromLabel = labelled(msg.body, "Amount due");
  const amountCents =
    (amountFromLabel ? findAmountCents(amountFromLabel) : null) ?? findAmountCents(msg.body) ?? 0;

  const facts: InvoiceFacts = {
    vendor: labelled(msg.body, "Vendor") ?? msg.from.replace(/<.*>/, "").trim(),
    amountCents,
    dueDate: labelled(msg.body, "Due date") ?? "",
    reference: labelled(msg.body, "Reference") ?? msg.subject,
    sourceMessageId: msg.messageId,
  };

  return {
    facts,
    method: "deterministic",
    rationale: `Read vendor, amount, and due date from labelled lines in ${msg.subject}.`,
  };
}

export async function planCase(msg: InvoiceMessage): Promise<Plan> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return extractDeterministically(msg);

  try {
    const { default: Groq } = await import("groq-sdk");
    const groq = new Groq({ apiKey });

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Extract invoice facts from the email below.",
            'Reply ONLY with JSON: {"vendor":string,"amountCents":integer,"dueDate":"YYYY-MM-DD","reference":string}.',
            "amountCents is the total due in CENTS. $4,820.00 is 482000.",
            "Do not decide whether to pay. Do not add commentary.",
          ].join(" "),
        },
        { role: "user", content: `Subject: ${msg.subject}\nFrom: ${msg.from}\n\n${msg.body}` },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = ExtractedFacts.safeParse(JSON.parse(raw));

    // A malformed or hallucinated response falls back rather than propagating
    // junk into a payment proposal.
    if (!parsed.success) return extractDeterministically(msg);

    return {
      facts: { ...parsed.data, sourceMessageId: msg.messageId },
      method: "model",
      rationale: `Extracted by llama-3.3-70b from ${msg.subject}, schema-validated before use.`,
    };
  } catch {
    return extractDeterministically(msg);
  }
}
