import "server-only";
import { z } from "zod";
import type { ToolResult } from "./types";
import { AdapterUnavailable } from "./types";
import type { SendMessageInput } from "./registry";

// =============================================================================
// Telegram adapter — the signal courier's single tool.
//
// TELEGRAM_BOT_TOKEN is read here and nowhere else in the codebase. It is never
// interpolated into a log line or a ref, because the token is the whole of the
// bot's identity and it travels in the URL path rather than a header — which
// makes it unusually easy to leak by accident.
//
// Telegram offers no idempotency key, so de-duplication is done in-process by
// remembering which keys have already been sent. That is weaker than GitHub's
// search-based check and the comment on the map says so plainly rather than
// implying a guarantee this cannot make.
// =============================================================================

const API = "https://api.telegram.org";

/**
 * Keys sent in this process, mapped to the message id they produced.
 *
 * Bounded and best-effort: it catches the double-click, which is the case that
 * actually happens, and it does not survive a redeploy. It is not presented as
 * a distributed guarantee anywhere in the UI.
 */
const sent = new Map<string, number>();
const SENT_LIMIT = 500;

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!t) {
    throw new AdapterUnavailable(
      "telegram_not_connected",
      "Telegram is not connected, so no message was sent.",
      "Set TELEGRAM_BOT_TOKEN from @BotFather and TELEGRAM_CHAT_ID to the chat the bot is in."
    );
  }
  return t;
}

function remember(key: string, messageId: number): void {
  if (sent.size >= SENT_LIMIT) {
    const oldest = sent.keys().next().value;
    if (oldest !== undefined) sent.delete(oldest);
  }
  sent.set(key, messageId);
}

export async function sendMessage(
  input: z.infer<typeof SendMessageInput>
): Promise<ToolResult<{ messageId: number; deduplicated: boolean }>> {
  const bot = token();

  const already = sent.get(input.idempotencyKey);
  if (already !== undefined) {
    return {
      output: { messageId: already, deduplicated: true },
      provenance: "live",
      refs: { chat: input.chat, message: String(already) },
    };
  }

  const res = await fetch(`${API}/bot${bot}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: input.chat,
      text: input.text,
      // Plain text on purpose. Findings carry vendor names and column headers
      // that would need escaping under Markdown, and a parse error there would
      // turn a real alert into a 400.
      disable_web_page_preview: true,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    result?: { message_id?: number };
  };

  // Telegram answers 200 with ok:false for a wrong chat id, so the body is the
  // only thing worth reading.
  if (!res.ok || !json.ok) {
    const detail = json.description ?? res.statusText;
    throw new AdapterUnavailable(
      `telegram_${res.status}`,
      `Telegram refused the message: ${detail}`,
      /chat not found/i.test(detail)
        ? "Send the bot a message first, then set TELEGRAM_CHAT_ID to that chat's id."
        : "Check TELEGRAM_BOT_TOKEN is current and the bot has not been removed from the chat.",
      "Telegram"
    );
  }

  const messageId = Number(json.result?.message_id);
  if (!Number.isFinite(messageId)) {
    throw new AdapterUnavailable(
      "telegram_unconfirmed",
      "Telegram accepted the request but did not return a message id.",
      "Retry the action. Nothing is recorded as sent without a message id.",
      "Telegram"
    );
  }

  remember(input.idempotencyKey, messageId);
  return {
    output: { messageId, deduplicated: false },
    provenance: "live",
    refs: { chat: input.chat, message: String(messageId) },
  };
}
