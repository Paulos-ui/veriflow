"use client";

import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { MAX_BYTES } from "@/lib/arena/csv";
import { IntegrationBoard, useIntegrations } from "./IntegrationBoard";
import { RunState } from "./RunState";
import { useArenaRun } from "./useArenaRun";

// =============================================================================
// The Verify console: hand it a spreadsheet, get back findings you can argue
// with.
//
// The file never leaves the browser as a file. It is read to text here, posted
// as text, parsed server-side by lib/arena/csv.ts, and then discarded — what
// persists is the profile, the findings, and a hash of the canonical subject.
// That is stated on the page, because "upload your data" deserves an answer to
// "and then what happens to it".
//
// The size ceiling is checked twice on purpose: here, so somebody dragging a
// 40 MB export gets told immediately instead of after a long upload, and again
// at the route, because a check that only runs in a browser is not a limit.
// =============================================================================

const MAX_MB = Math.floor(MAX_BYTES / 1_000_000);

/**
 * A small file with three things wrong with it, for anyone who wants to see the
 * checker work before handing it real data.
 *
 * Labelled as a sample everywhere it appears. The findings it produces are not
 * canned — the same parser runs over it that runs over an upload, and the row
 * numbers in the report are the row numbers in this text.
 */
const SAMPLE = `invoice_id,vendor,amount,due_date,status
INV-1001,Northwind Supply,1240.00,2026-03-04,paid
INV-1002,Contoso Print,880.50,2026-03-11,paid
INV-1003,Northwind Supply,1310.25,2026-03-18,paid
INV-1004,Fabrikam Freight,,2026-03-21,pending
INV-1005,Contoso Print,912.00,2026-03-25,paid
INV-1006,Northwind Supply,1288.75,2026-04-01,paid
INV-1007,Fabrikam Freight,742.10,2026-04-08,paid
INV-1008,Contoso Print,96400.00,2026-04-15,pending
INV-1009,Northwind Supply,1275.00,not a date,paid
INV-1005,Contoso Print,912.00,2026-03-25,paid
`;

export function VerifyConsole() {
  const run = useArenaRun();
  const { report, failed } = useIntegrations();

  const [filename, setFilename] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const take = useCallback(async (file: File) => {
    setProblem(null);
    if (file.size > MAX_BYTES) {
      setFilename(null);
      setText(null);
      setProblem(
        `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB. The limit is ${MAX_MB} MB.`
      );
      return;
    }
    try {
      const content = await file.text();
      setFilename(file.name);
      setText(content);
    } catch {
      setProblem("That file could not be read. It may not be a text file.");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void take(file);
    },
    [take]
  );

  const useSample = useCallback(() => {
    setProblem(null);
    setFilename("sample-invoices.csv");
    setText(SAMPLE);
  }, []);

  const submit = useCallback(() => {
    if (!filename || text === null) return;
    void run.run({ kind: "dataset", filename, text });
  }, [filename, run, text]);

  const lines = text === null ? 0 : text.split(/\r?\n/).filter((l) => l.length > 0).length;

  return (
    <div className="space-y-8">
      <section
        aria-labelledby="upload-heading"
        className="rounded-xl2 border border-hairline bg-surface/30 p-5 sm:p-6"
      >
        <h2 id="upload-heading" className="font-display text-[20px] leading-tight text-bone">
          Check a spreadsheet
        </h2>
        <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-muted">
          A CSV up to {MAX_MB} MB. It is read in your browser, posted as text, profiled column by
          column, and then dropped. What is kept is the profile, the findings, and a hash of the
          canonical summary — never the rows themselves, and never the file.
        </p>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            "mt-5 rounded-card border border-dashed px-5 py-6 transition-colors duration-200",
            dragging ? "border-verdigris/50 bg-verdigris/[0.05]" : "border-hairline bg-surface/20"
          )}
        >
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="csv-input"
              className={cn(
                "inline-flex min-h-[44px] cursor-pointer items-center rounded-seal border border-bone/20 bg-raised/60 px-4 text-[13px] text-bone transition-colors duration-200",
                "hover:border-bone/35 hover:bg-raised",
                "focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-signal"
              )}
            >
              Choose a CSV
            </label>
            <input
              id="csv-input"
              type="file"
              accept=".csv,text/csv,text/plain"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void take(file);
                // Reset so choosing the same file twice still fires a change.
                e.target.value = "";
              }}
            />

            <span className="text-[12.5px] text-faint">or drop one here, or</span>

            <button
              type="button"
              onClick={useSample}
              className="min-h-[44px] rounded-seal border border-hairline px-3.5 text-[12.5px] text-muted transition-colors duration-200 hover:border-bone/25 hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
            >
              load a sample with known problems
            </button>
          </div>

          {problem && (
            <p role="alert" className="mt-3 text-[12.5px] text-alert">
              {problem}
            </p>
          )}

          {filename && text !== null && (
            <p className="mt-3 text-[12.5px] text-muted">
              <span className="text-bone">{filename}</span> · {lines.toLocaleString("en-US")}{" "}
              non-empty {lines === 1 ? "line" : "lines"} ·{" "}
              <span className="crypto">{(text.length / 1000).toFixed(1)} KB</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={text === null || run.busy}
          className={cn(
            "mt-4 min-h-[44px] rounded-seal border px-4 text-[13px] transition-colors duration-200",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
            text !== null && !run.busy
              ? "border-verdigris/40 bg-verdigris/[0.08] text-verdigris hover:bg-verdigris/[0.14]"
              : "cursor-not-allowed border-hairline text-faint"
          )}
        >
          {run.busy ? "Checking…" : "Check it"}
        </button>
      </section>

      <IntegrationBoard report={report} failed={failed} />

      <RunState run={run} steps="observe → verify → plan → four writes → seal" />
    </div>
  );
}
