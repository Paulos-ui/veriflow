import "server-only";
import { z } from "zod";
import type { ToolResult } from "./types";
import { AdapterUnavailable } from "./types";
import type { FindInvoiceInput, FetchAttachmentInput } from "./registry";
import { googleAuth, googleAppConfigured } from "./google-auth";
import { FIXTURE_INVOICES, asGmailMessage, fromBase64Url, fixtureFor } from "./fixtures";

// =============================================================================
// Gmail adapter — the mail reader's two tools.
//
// Read-only by construction: the scopes requested are gmail.readonly, and
// nothing here has a code path that sends, deletes, or labels. If this module
// were compromised the worst it could do is read the mailbox it was already
// allowed to read.
//
// Live vs fixture is decided by whether Google credentials are present, and the
// answer is reported honestly in `provenance` — never assumed, never faked. The
// SAME parser runs in both modes.
// =============================================================================

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface InvoiceMessage {
  messageId: string;
  from: string;
  subject: string;
  body: string;
  attachmentId: string | null;
  attachmentName: string | null;
}

const GmailHeader = z.object({ name: z.string(), value: z.string() });
const GmailPart = z.object({
  partId: z.string().optional(),
  mimeType: z.string().optional(),
  filename: z.string().optional(),
  body: z.object({ attachmentId: z.string().optional(), size: z.number().optional(), data: z.string().optional() }).optional(),
});
const GmailMessage = z.object({
  id: z.string(),
  payload: z.object({
    headers: z.array(GmailHeader),
    body: z.object({ data: z.string().optional() }).optional(),
    parts: z.array(GmailPart).optional(),
  }),
});

function header(headers: { name: string; value: string }[], want: string): string {
  return headers.find((h) => h.name.toLowerCase() === want.toLowerCase())?.value ?? "";
}

/** Pull the text body out of a Gmail payload, top level or first text part. */
function bodyOf(msg: z.infer<typeof GmailMessage>): string {
  const direct = msg.payload.body?.data;
  if (direct) return fromBase64Url(direct);
  const textPart = msg.payload.parts?.find((p) => p.mimeType?.startsWith("text/") && p.body?.data);
  return textPart?.body?.data ? fromBase64Url(textPart.body.data) : "";
}

function parseMessage(raw: unknown): InvoiceMessage {
  const msg = GmailMessage.parse(raw);
  const pdf = msg.payload.parts?.find((p) => p.body?.attachmentId);
  return {
    messageId: msg.id,
    from: header(msg.payload.headers, "From"),
    subject: header(msg.payload.headers, "Subject"),
    body: bodyOf(msg),
    attachmentId: pdf?.body?.attachmentId ?? null,
    attachmentName: pdf?.filename ?? null,
  };
}

/** Which fixture a sender corresponds to, for the demo path. */
function fixtureBySender(sender: string) {
  const bare = sender.match(/<([^>]+)>/)?.[1] ?? sender;
  return (
    FIXTURE_INVOICES.find((f) => f.sender.toLowerCase().includes(bare.toLowerCase())) ??
    fixtureFor("aurora")
  );
}

export async function findInvoice(
  input: z.infer<typeof FindInvoiceInput>
): Promise<ToolResult<InvoiceMessage>> {
  const auth = await googleAuth();

  if (!auth) {
    // Two very different situations wear the same "no token" shape, and
    // collapsing them would be dishonest in opposite directions:
    //
    //   No OAuth app configured  → nobody asked for live mail. Fixtures are the
    //                              documented zero-credential demo. Badge says
    //                              so, and no money moves on a recorded read.
    //   OAuth app configured     → the operator DID ask for live mail and the
    //                              link is missing or expired. Serving a
    //                              recorded invoice here would let a real
    //                              payment ride on fake evidence. Fail closed.
    if (googleAppConfigured()) {
      throw new AdapterUnavailable(
        "gmail_not_connected",
        "Gmail is configured but not connected, so no invoice was read.",
        "Click Connect Gmail on the workspace, or set GOOGLE_REFRESH_TOKEN."
      );
    }
    const f = fixtureBySender(input.sender);
    return {
      output: parseMessage(asGmailMessage(f)),
      provenance: "fixture",
      refs: { source: "recorded fixture", sender: f.sender },
    };
  }

  // The mandate already ruled this sender and label in scope; the query simply
  // asks Gmail for the same thing, so a scope bug cannot widen the search.
  const q = `from:(${input.sender}) label:(${input.label}) ${input.query}`.trim();
  const list = await fetch(`${GMAIL}/messages?maxResults=1&q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  if (!list.ok) throw new Error(`Gmail search failed (${list.status}).`);

  const found = (await list.json()) as { messages?: { id: string }[] };
  const id = found.messages?.[0]?.id;
  if (!id) {
    // An empty mailbox is not a bug and must not surface as one. The operator
    // asked for live mail and there is none matching — the case stops with a
    // reason and something to do about it, and no money moves.
    throw new AdapterUnavailable(
      "no_invoice_found",
      `No invoice from ${input.sender} was found in ${input.label}.`,
      `Send an invoice email from ${input.sender} to the connected mailbox and label it ${input.label}.`,
      "Mailbox"
    );
  }

  const detail = await fetch(`${GMAIL}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${auth.accessToken}` },
  });
  if (!detail.ok) throw new Error(`Gmail fetch failed (${detail.status}).`);

  return {
    output: parseMessage(await detail.json()),
    provenance: "live",
    refs: { messageId: id, query: q },
  };
}

export async function fetchAttachment(
  input: z.infer<typeof FetchAttachmentInput>
): Promise<ToolResult<{ attachmentId: string; sizeBytes: number }>> {
  const auth = await googleAuth();

  if (!auth) {
    return {
      output: { attachmentId: input.attachmentId, sizeBytes: 48_213 },
      provenance: "fixture",
      refs: { attachmentId: input.attachmentId },
    };
  }

  const res = await fetch(
    `${GMAIL}/messages/${input.messageId}/attachments/${input.attachmentId}`,
    { headers: { Authorization: `Bearer ${auth.accessToken}` } }
  );
  if (!res.ok) throw new Error(`Gmail attachment fetch failed (${res.status}).`);

  const json = (await res.json()) as { size?: number };
  return {
    output: { attachmentId: input.attachmentId, sizeBytes: json.size ?? 0 },
    provenance: "live",
    refs: { messageId: input.messageId },
  };
}
