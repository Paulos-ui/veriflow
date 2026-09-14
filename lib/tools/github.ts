import "server-only";
import { z } from "zod";
import type { ToolResult } from "./types";
import { AdapterUnavailable } from "./types";
import type { OpenIssueInput } from "./registry";

// =============================================================================
// GitHub adapter — the repo scribe's single tool.
//
// GITHUB_TOKEN is read here and nowhere else in the codebase.
//
// Two things this module refuses to do. It does not fall back to a simulated
// issue when the token is missing: an issue either exists at a URL someone can
// open or it does not, and a fake one would be the exact failure the product
// exists to prevent. And it does not report success from an HTTP status — the
// issue number and URL are read out of the response body, so "succeeded" means
// GitHub named the thing it created.
// =============================================================================

const API = "https://api.github.com";

/**
 * GitHub has no idempotency header, so de-duplication is done by search: the
 * key is written into the issue body as a marker line and looked for before
 * writing. Cheap, and it survives a retry from a different process — which a
 * local in-memory guard would not.
 */
const MARKER = "veriflow-key:";

function token(): string {
  const t = process.env.GITHUB_TOKEN?.trim();
  if (!t) {
    throw new AdapterUnavailable(
      "github_not_connected",
      "GitHub is not connected, so no issue was opened.",
      "Set GITHUB_TOKEN to a token with `issues: write` on the target repository."
    );
  }
  return t;
}

async function github(
  path: string,
  init: RequestInit,
  auth: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      "User-Agent": "veriflow",
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  const json = (text ? JSON.parse(text) : {}) as Record<string, unknown>;

  if (!res.ok) {
    // 401/403/404 on a repo write usually means the token is scoped wrong
    // rather than that the repo is missing, so the remedy says both.
    const detail = String(json.message ?? res.statusText);
    throw new AdapterUnavailable(
      `github_${res.status}`,
      `GitHub refused the request: ${detail}`,
      res.status === 404
        ? "Check GITHUB_OWNER and GITHUB_REPO, and that the token can see a private repository."
        : "Check that GITHUB_TOKEN has `issues: write` on this repository and has not expired.",
      "GitHub"
    );
  }
  return json;
}

/** Already opened for this key? Returns the existing issue, or null. */
async function existing(
  repo: string,
  key: string,
  auth: string
): Promise<{ number: number; url: string } | null> {
  const q = encodeURIComponent(`repo:${repo} in:body "${MARKER}${key}"`);
  const res = await github(`/search/issues?q=${q}&per_page=1`, { method: "GET" }, auth);
  const items = (res.items as { number?: number; html_url?: string }[] | undefined) ?? [];
  const hit = items[0];
  return hit?.number && hit.html_url ? { number: hit.number, url: hit.html_url } : null;
}

export async function openIssue(
  input: z.infer<typeof OpenIssueInput>
): Promise<ToolResult<{ number: number; url: string; deduplicated: boolean }>> {
  const auth = token();

  const prior = await existing(input.repo, input.idempotencyKey, auth);
  if (prior) {
    // A second click is not an error and not a second issue. The run reports
    // the issue that already exists and says it did not write again.
    return {
      output: { ...prior, deduplicated: true },
      provenance: "live",
      refs: { repo: input.repo, issue: String(prior.number), url: prior.url },
    };
  }

  const body = `${input.body}\n\n<sub>${MARKER}${input.idempotencyKey}</sub>`;
  const created = await github(
    `/repos/${input.repo}/issues`,
    { method: "POST", body: JSON.stringify({ title: input.title, body }) },
    auth
  );

  const number = Number(created.number);
  const url = String(created.html_url ?? "");
  if (!Number.isFinite(number) || !url) {
    throw new AdapterUnavailable(
      "github_unconfirmed",
      "GitHub accepted the request but did not return an issue.",
      "Retry the action. Nothing is recorded as opened without an issue number.",
      "GitHub"
    );
  }

  return {
    output: { number, url, deduplicated: false },
    provenance: "live",
    refs: { repo: input.repo, issue: String(number), url },
  };
}
