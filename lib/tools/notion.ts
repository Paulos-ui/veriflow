import "server-only";
import { z } from "zod";
import type { ToolResult } from "./types";
import { AdapterUnavailable } from "./types";
import type { CreateEntryInput } from "./registry";

// =============================================================================
// Notion adapter — the ledger archivist's single tool.
//
// NOTION_API_KEY is read here and nowhere else in the codebase.
//
// The hard part of Notion is that every database has a different schema, and an
// integration that assumes column names works on the author's workspace and
// nowhere else. So this adapter READS the schema first and writes only into
// properties that actually exist, matching by name and checking the type before
// filling it. Anything with no matching column goes into the page body instead,
// where it is still on the record.
//
// The consequence worth stating: pointing NOTION_DATABASE_ID at a database with
// nothing but a title still works. It records less, and it does not pretend
// otherwise.
// =============================================================================

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

/** Notion property types this adapter knows how to fill. */
type Fillable = "title" | "rich_text" | "number" | "select" | "url" | "date" | "checkbox";

interface Schema {
  /** Name of the one title property. Every Notion database has exactly one. */
  titleProperty: string;
  /** Lowercased property name → its real name and type. */
  byName: Map<string, { name: string; type: string }>;
}

function key(): string {
  const k = process.env.NOTION_API_KEY?.trim();
  if (!k) {
    throw new AdapterUnavailable(
      "notion_not_connected",
      "Notion is not connected, so nothing was filed.",
      "Set NOTION_API_KEY to an internal integration secret and share the database with it."
    );
  }
  return k;
}

async function notion(
  path: string,
  init: RequestInit,
  auth: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth}`,
      "Notion-Version": VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as Record<string, unknown>;

  if (!res.ok) {
    const detail = String(json.message ?? res.statusText);
    throw new AdapterUnavailable(
      `notion_${res.status}`,
      `Notion refused the request: ${detail}`,
      res.status === 404
        ? "Open the database in Notion, then Connections → add your integration. A database the integration cannot see reads as missing."
        : "Check NOTION_API_KEY and NOTION_DATABASE_ID.",
      "Notion"
    );
  }
  return json;
}

async function readSchema(database: string, auth: string): Promise<Schema> {
  const db = await notion(`/databases/${database}`, { method: "GET" }, auth);
  const props = (db.properties ?? {}) as Record<string, { type?: string }>;

  const byName = new Map<string, { name: string; type: string }>();
  let titleProperty = "";

  for (const [name, def] of Object.entries(props)) {
    const type = String(def?.type ?? "");
    byName.set(name.toLowerCase(), { name, type });
    if (type === "title") titleProperty = name;
  }

  if (!titleProperty) {
    throw new AdapterUnavailable(
      "notion_no_title",
      "That Notion database has no title property, so an entry cannot be named.",
      "Point NOTION_DATABASE_ID at a database rather than a page or a view.",
      "Notion"
    );
  }
  return { titleProperty, byName };
}

/** Find a column by any of several plausible names, of an expected type. */
function column(
  schema: Schema,
  candidates: string[],
  accept: Fillable[]
): { name: string; type: Fillable } | null {
  for (const candidate of candidates) {
    const hit = schema.byName.get(candidate.toLowerCase());
    if (hit && (accept as string[]).includes(hit.type)) {
      return { name: hit.name, type: hit.type as Fillable };
    }
  }
  return null;
}

/** Build the value Notion expects for a given property type. */
function value(type: Fillable, raw: string | number | boolean): unknown {
  switch (type) {
    case "title":
      return { title: [{ text: { content: String(raw).slice(0, 2000) } }] };
    case "rich_text":
      return { rich_text: [{ text: { content: String(raw).slice(0, 2000) } }] };
    case "number":
      return { number: typeof raw === "number" ? raw : Number(raw) };
    case "select":
      return { select: { name: String(raw).slice(0, 100) } };
    case "url":
      return { url: String(raw) };
    case "date":
      return { date: { start: String(raw) } };
    case "checkbox":
      return { checkbox: Boolean(raw) };
  }
}

function paragraph(text: string): unknown {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: text.slice(0, 2000) } }] },
  };
}

/**
 * Has this run already been filed? Only answerable when the database has a
 * column the subject hash was written into — otherwise there is nothing to
 * match on, and the honest answer is "cannot tell", not "no".
 */
async function alreadyFiled(
  database: string,
  hashColumn: { name: string; type: Fillable } | null,
  subjectHash: string,
  auth: string
): Promise<string | null> {
  if (!hashColumn || hashColumn.type !== "rich_text") return null;

  const res = await notion(
    `/databases/${database}/query`,
    {
      method: "POST",
      body: JSON.stringify({
        page_size: 1,
        filter: { property: hashColumn.name, rich_text: { equals: subjectHash } },
      }),
    },
    auth
  );
  const results = (res.results as { id?: string; url?: string }[] | undefined) ?? [];
  return results[0]?.url ?? results[0]?.id ?? null;
}

export async function createEntry(
  input: z.infer<typeof CreateEntryInput>
): Promise<ToolResult<{ pageId: string; url: string; deduplicated: boolean }>> {
  const auth = key();
  const schema = await readSchema(input.database, auth);

  const hashColumn = column(schema, ["proof", "hash", "subject hash", "subjecthash", "proof hash"], [
    "rich_text",
  ]);

  const prior = await alreadyFiled(input.database, hashColumn, input.subjectHash, auth);
  if (prior) {
    return {
      output: { pageId: prior, url: prior, deduplicated: true },
      provenance: "live",
      refs: { database: input.database, page: prior },
    };
  }

  // Only properties that exist get written. `unmapped` collects the rest so the
  // page body can carry what the schema had nowhere to put.
  const properties: Record<string, unknown> = {
    [schema.titleProperty]: value("title", input.title),
  };
  const unmapped: string[] = [];

  const put = (
    label: string,
    candidates: string[],
    accept: Fillable[],
    raw: string | number | boolean
  ) => {
    const col = column(schema, candidates, accept);
    if (col) properties[col.name] = value(col.type, raw);
    else unmapped.push(`${label}: ${String(raw)}`);
  };

  put("Outcome", ["outcome", "result", "status", "summary"], ["rich_text", "select"], input.outcome);
  put("Findings", ["findings", "anomalies", "issues", "count"], ["number", "rich_text"], input.findingCount);
  put("Severity", ["severity", "level", "priority"], ["select", "rich_text"], input.severity);
  put("Proof", ["proof", "hash", "subject hash", "subjecthash", "proof hash"], ["rich_text", "url"], input.subjectHash);

  const created = await notion(
    "/pages",
    {
      method: "POST",
      body: JSON.stringify({
        parent: { database_id: input.database },
        properties,
        children: [
          paragraph(input.outcome),
          ...(unmapped.length ? [paragraph(unmapped.join("\n"))] : []),
          paragraph(`Filed by VeriFlow · run ${input.idempotencyKey}`),
        ],
      }),
    },
    auth
  );

  const pageId = String(created.id ?? "");
  const url = String(created.url ?? "");
  if (!pageId) {
    throw new AdapterUnavailable(
      "notion_unconfirmed",
      "Notion accepted the request but did not return a page.",
      "Retry the action. Nothing is recorded as filed without a page id.",
      "Notion"
    );
  }

  return {
    output: { pageId, url, deduplicated: false },
    provenance: "live",
    refs: {
      database: input.database,
      page: pageId,
      ...(url ? { url } : {}),
      ...(unmapped.length ? { unmapped: String(unmapped.length) } : {}),
    },
  };
}
