import type { InvoiceFacts } from "@/lib/cases/model";

// =============================================================================
// Recorded fixtures for the AP Clerk case.
//
// These are shaped like real Gmail API payloads — base64url body, headers as a
// name/value list — so the fixture path runs the SAME parsing code as the live
// path. A fixture that returned a pre-parsed object would let a parser bug ship
// undetected, which defeats the point of having a demo mode at all.
//
// Three invoices, each of which fails a different rule under the default
// mandates. None of them is special-cased anywhere: the outcomes below are
// consequences of the allowlists in lib/agents/roster.ts.
//
//   Aurora Systems    $4,820.00  → pays cleanly
//   Meridian Supply  $18,000.00  → over the $5,000 cap
//   Halcyon Logistics $2,400.00  → vendor not on the allowlist (and under cap,
//                                  so the refusal is unambiguously about scope)
// =============================================================================

export interface FixtureInvoice {
  key: "aurora" | "meridian" | "halcyon";
  sender: string;
  subject: string;
  /** Plain text body; encoded to base64url on the way out, as Gmail returns it. */
  body: string;
  facts: InvoiceFacts;
  /** What the default mandate does with it, for the demo picker copy. */
  expectation: string;
}

export const FIXTURE_INVOICES: FixtureInvoice[] = [
  {
    key: "aurora",
    sender: "Aurora Billing <billing@aurora-systems.com>",
    subject: "Invoice AUR-4417 — September retainer",
    body: [
      "Hi Accounts Payable,",
      "",
      "Please find invoice AUR-4417 attached.",
      "",
      "Vendor: Aurora Systems",
      "Amount due: $4,820.00",
      "Due date: 2026-10-01",
      "Reference: AUR-4417",
      "",
      "Thanks,",
      "Aurora Billing",
    ].join("\n"),
    facts: {
      vendor: "Aurora Systems",
      amountCents: 482_000,
      dueDate: "2026-10-01",
      reference: "AUR-4417",
      sourceMessageId: "18f2a1c9e40b1001",
    },
    expectation: "Inside every rule — this one pays.",
  },
  {
    key: "meridian",
    sender: "Meridian AP <ap@meridian-supply.com>",
    subject: "Invoice MER-9902 — Q3 hardware",
    body: [
      "Accounts Payable,",
      "",
      "Invoice MER-9902 is now due.",
      "",
      "Vendor: Meridian Supply",
      "Amount due: $18,000.00",
      "Due date: 2026-09-28",
      "Reference: MER-9902",
      "",
      "Meridian Supply",
    ].join("\n"),
    facts: {
      vendor: "Meridian Supply",
      amountCents: 1_800_000,
      dueDate: "2026-09-28",
      reference: "MER-9902",
      sourceMessageId: "18f2a1c9e40b1002",
    },
    expectation: "Known vendor, but $18,000 against a $5,000 cap.",
  },
  {
    key: "halcyon",
    sender: "Halcyon Invoicing <invoices@halcyon-logistics.com>",
    subject: "Invoice HAL-0231 — freight",
    body: [
      "Hello,",
      "",
      "Invoice HAL-0231 for freight services.",
      "",
      "Vendor: Halcyon Logistics",
      "Amount due: $2,400.00",
      "Due date: 2026-10-05",
      "Reference: HAL-0231",
      "",
      "Halcyon Logistics",
    ].join("\n"),
    facts: {
      vendor: "Halcyon Logistics",
      amountCents: 240_000,
      dueDate: "2026-10-05",
      reference: "HAL-0231",
      sourceMessageId: "18f2a1c9e40b1003",
    },
    expectation: "Well under cap, but the vendor was never allowlisted.",
  },
];

export function fixtureFor(key: string): FixtureInvoice {
  return FIXTURE_INVOICES.find((f) => f.key === key) ?? FIXTURE_INVOICES[0];
}

/** Gmail hands back base64url. Fixtures encode the same way. */
export function toBase64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** A fixture rendered in the exact shape of a Gmail messages.get response. */
export function asGmailMessage(f: FixtureInvoice) {
  return {
    id: f.facts.sourceMessageId,
    threadId: f.facts.sourceMessageId,
    labelIds: ["INBOX", "Label_Invoices"],
    payload: {
      headers: [
        { name: "From", value: f.sender },
        { name: "Subject", value: f.subject },
        { name: "Date", value: "Fri, 11 Sep 2026 09:14:02 +0000" },
      ],
      body: { size: f.body.length, data: toBase64Url(f.body) },
      parts: [
        {
          partId: "1",
          mimeType: "application/pdf",
          filename: `${f.facts.reference}.pdf`,
          body: { attachmentId: `att_${f.facts.reference}`, size: 48213 },
        },
      ],
    },
  };
}
