import type { Invoice } from "@/types";

// The enterprise/operator identity (derived from the operator key server-side).
// Server routes re-authenticate and use the authoritative value; this is for display.
export const OPERATOR_DID = "did:t3n:65556727a58a0f9fec54c7672ac433d6a73774f1";

// Demo invoices for the workflow runner. Deterministic so demos are repeatable.
export const DEMO_INVOICES: Invoice[] = [
  {
    id: "inv_aurora",
    vendor: "Aurora Cloud Services",
    amount: 4820,
    currency: "USD",
    dueDate: "2026-07-15",
    reference: "AUR-2026-0412",
    lineItems: [
      { description: "Compute (managed K8s)", quantity: 1, unitPrice: 3200 },
      { description: "Egress & storage", quantity: 1, unitPrice: 1120 },
      { description: "Support — standard", quantity: 1, unitPrice: 500 },
    ],
  },
  {
    id: "inv_meridian",
    vendor: "Meridian Logistics",
    amount: 18000,
    currency: "USD",
    dueDate: "2026-07-02",
    reference: "MER-99812",
    lineItems: [
      { description: "Freight — Q2 reconciliation", quantity: 1, unitPrice: 18000 },
    ],
  },
  {
    id: "inv_unknown",
    vendor: "Halcyon Trade Partners",
    amount: 7400,
    currency: "USD",
    dueDate: "2026-06-28",
    reference: "HTP-0001",
    lineItems: [
      { description: "Consulting retainer", quantity: 1, unitPrice: 7400 },
    ],
  },
];
