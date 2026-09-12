"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// =============================================================================
// Case launcher.
//
// Three invoices, three outcomes, all of them real consequences of the default
// mandates in lib/agents/roster.ts rather than special-cased demo branches:
//
//   Aurora    $4,820   allowlisted, under cap   → pays
//   Meridian  $18,000  allowlisted, OVER cap    → refused: cap_exceeded
//   Halcyon   $2,400   UNDER cap, not a vendor  → refused: scope_mismatch
//
// Halcyon is deliberately cheap: if it were also over the cap, the refusal
// would be ambiguous and would not demonstrate scope enforcement on its own.
//
// The approval control is separate because the human gate is an independent
// axis — Aurora under "Deny" is a legal payment stopped purely by a person,
// which is the clearest possible demonstration of what the gate is for.
// =============================================================================

export type InvoiceKey = "aurora" | "meridian" | "halcyon";
export type ApprovalKey = "approve" | "deny" | "silence";

const INVOICES: { key: InvoiceKey; vendor: string; amount: string; outcome: string }[] = [
  { key: "aurora", vendor: "Aurora Systems", amount: "$4,820.00", outcome: "within every bound" },
  { key: "meridian", vendor: "Meridian Supply", amount: "$18,000.00", outcome: "over the $5,000 cap" },
  { key: "halcyon", vendor: "Halcyon Logistics", amount: "$2,400.00", outcome: "vendor not allowlisted" },
];

const APPROVALS: { key: ApprovalKey; label: string; hint: string }[] = [
  { key: "approve", label: "Approve", hint: "a reviewer reacts ✅" },
  { key: "deny", label: "Deny", hint: "a reviewer reacts ❌" },
  { key: "silence", label: "No answer", hint: "the window closes unanswered" },
];

export function CaseLauncher({
  onRun,
  busy,
}: {
  onRun: (invoice: InvoiceKey, approval: ApprovalKey) => void;
  busy: boolean;
}) {
  const [invoice, setInvoice] = useState<InvoiceKey>("aurora");
  const [approval, setApproval] = useState<ApprovalKey>("approve");

  return (
    <section
      aria-labelledby="launcher-heading"
      className="rounded-xl2 border border-hairline bg-surface/30 p-5 sm:p-6"
    >
      <h2 id="launcher-heading" className="font-display text-[20px] leading-tight text-bone">
        Run an accounts-payable case
      </h2>
      <p className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-muted">
        One invoice crosses Gmail, Slack, and a payment rail. Four agents, four keys, one mandate
        each. Every hop is checked before it runs and sealed after.
      </p>

      <fieldset className="mt-5 min-w-0">
        <legend className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
          Invoice
        </legend>
        <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
          {INVOICES.map((inv) => (
            <button
              key={inv.key}
              type="button"
              onClick={() => setInvoice(inv.key)}
              aria-pressed={invoice === inv.key}
              disabled={busy}
              className={cn(
                "min-h-[44px] rounded-card border p-3 text-left transition-colors duration-200 disabled:opacity-50",
                invoice === inv.key
                  ? "border-bone/25 bg-raised/70"
                  : "border-hairline bg-ink/30 hover:border-bone/15"
              )}
            >
              <span className="block text-[13.5px] leading-tight text-bone">{inv.vendor}</span>
              <span className="crypto mt-1 block text-[12.5px] text-bone">{inv.amount}</span>
              <span className="mt-1 block text-[11.5px] leading-snug text-muted">{inv.outcome}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5 min-w-0">
        <legend className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">
          At the human gate
        </legend>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {APPROVALS.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setApproval(a.key)}
              aria-pressed={approval === a.key}
              disabled={busy}
              className={cn(
                "min-h-[44px] rounded-card border px-3.5 py-2 text-left transition-colors duration-200 disabled:opacity-50",
                approval === a.key
                  ? "border-bone/25 bg-raised/70"
                  : "border-hairline bg-ink/30 hover:border-bone/15"
              )}
            >
              <span className="block text-[13px] leading-tight text-bone">{a.label}</span>
              <span className="mt-0.5 block text-[11.5px] text-muted">{a.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={() => onRun(invoice, approval)}
        disabled={busy}
        className={cn(
          "mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-card border border-gold/40 bg-gold/10 px-5 py-2.5",
          "text-[14px] text-bone transition-colors duration-200",
          busy ? "cursor-wait opacity-60" : "hover:bg-gold/15"
        )}
      >
        {busy ? "Running…" : "Run the case"}
      </button>
    </section>
  );
}
