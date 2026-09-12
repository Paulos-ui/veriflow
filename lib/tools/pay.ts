import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { ToolResult } from "./types";
import type { ChargeInput } from "./registry";

// =============================================================================
// Payment adapter — the pay clerk's single tool.
//
// STRIPE_SECRET_KEY is read here and nowhere else.
//
// The honesty rule this file exists to keep: a simulated payment is LABELLED a
// simulated payment. `provenance` is "simulated" whenever no key is present,
// and the UI renders that badge on the hop. Nothing in this module can return
// provenance "live" without Stripe having actually answered.
//
// Note what is NOT here: no cap check, no vendor check, no approval check. By
// the time execute() runs, lib/mandate/enforce.ts has already ruled. Repeating
// policy here would create a second place for the rules to drift; leaving it
// out means there is exactly one gate, and it is upstream of this line.
// =============================================================================

const STRIPE = "https://api.stripe.com/v1";

export interface Charge {
  chargeId: string;
  amountCents: number;
  vendor: string;
  status: "succeeded" | "simulated";
}

export async function charge(input: z.infer<typeof ChargeInput>): Promise<ToolResult<Charge>> {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    // Deterministic id derived from the idempotency key: re-running the same
    // case twice yields the same simulated charge, exactly as a real
    // idempotent API would, so the proof chain stays reproducible.
    const digest = createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 16);
    return {
      output: {
        chargeId: `sim_${digest}`,
        amountCents: input.amountCents,
        vendor: input.vendor,
        status: "simulated",
      },
      provenance: "simulated",
      refs: { reference: input.reference, note: "No Stripe key configured — no money moved." },
    };
  }

  // Stripe test mode. `pm_card_visa` is Stripe's own test instrument; with a
  // test key (sk_test_…) this is a real API round-trip that moves no real money.
  const res = await fetch(`${STRIPE}/payment_intents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      // Stripe's own idempotency: a retried hop cannot double-pay.
      "Idempotency-Key": input.idempotencyKey,
    },
    body: new URLSearchParams({
      amount: String(input.amountCents),
      currency: "usd",
      "payment_method_types[]": "card",
      payment_method: "pm_card_visa",
      confirm: "true",
      off_session: "true",
      description: `VeriFlow ${input.reference} — ${input.vendor}`,
      "metadata[vendor]": input.vendor,
      "metadata[reference]": input.reference,
    }),
  });

  const json = (await res.json()) as { id?: string; status?: string; error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(`Stripe charge failed: ${json.error?.message ?? res.status}`);
  }
  if (json.status !== "succeeded") {
    // Anything short of succeeded is reported as a failure, never smoothed over.
    throw new Error(`Stripe returned status "${json.status}" — treating as unpaid.`);
  }

  return {
    output: {
      chargeId: json.id ?? "unknown",
      amountCents: input.amountCents,
      vendor: input.vendor,
      status: "succeeded",
    },
    provenance: "live",
    refs: { chargeId: json.id ?? "", reference: input.reference },
  };
}
