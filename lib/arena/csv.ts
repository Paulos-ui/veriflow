import type { Finding } from "./events";

// =============================================================================
// The dataset engine: parse a CSV, profile its columns, and report what is wrong
// with it.
//
// Written against RFC 4180 by hand rather than pulling a parser in. Two reasons,
// and the second is the real one: the file is 200 lines and has no dependencies
// to audit, and every anomaly rule below has to be inspectable, because a finding
// is evidence. A rule you cannot read is a rule you cannot defend when someone
// asks why a row was flagged.
//
// Anomalies are found by arithmetic, never by a model. Groq is asked to summarise
// the findings afterwards; it is never asked which rows are suspicious. The order
// matters: a statistical outlier is a fact about the data, and a model's opinion
// about it is a fact about the model.
//
// Pure module. No credentials, no I/O, no node built-ins.
// =============================================================================

/** Guardrails, so a pasted 40MB export cannot wedge the request. */
export const MAX_BYTES = 2_000_000;
export const MAX_ROWS = 5_000;

export interface ParsedCsv {
  header: string[];
  rows: string[][];
  /** True when input was cut at MAX_BYTES or MAX_ROWS. Always reported. */
  truncated: boolean;
}

/**
 * RFC 4180 with the concessions real files require: CRLF or LF, a trailing
 * newline or not, quoted fields containing commas, newlines and `""` escapes.
 *
 * A bare `"` inside an unquoted field is kept verbatim rather than treated as an
 * error — that is what spreadsheets emit for inches and it is not the parser's
 * job to have an opinion about it.
 */
export function parseCsv(input: string): ParsedCsv {
  const truncatedByBytes = input.length > MAX_BYTES;
  const text = truncatedByBytes ? input.slice(0, MAX_BYTES) : input;

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  let sawAnyChar = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    sawAnyChar = true;

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n") {
      endRow();
      if (rows.length > MAX_ROWS) break;
    } else if (ch === "\r") {
      // Swallowed; the \n that follows ends the row. A lone \r ends it too.
      if (text[i + 1] !== "\n") {
        endRow();
        if (rows.length > MAX_ROWS) break;
      }
    } else {
      field += ch;
    }
  }

  // A final field with no trailing newline still counts as a row.
  if (field !== "" || row.length) endRow();

  const blank = (r: string[]) => r.every((c) => c.trim() === "");
  const kept = rows.filter((r) => !blank(r));

  const header = kept.length ? kept[0].map((h) => h.trim()) : [];
  const body = kept.slice(1);
  const truncated = truncatedByBytes || body.length > MAX_ROWS;

  return {
    header,
    rows: truncated ? body.slice(0, MAX_ROWS) : body,
    truncated: truncated && sawAnyChar,
  };
}

// --- profiling ----------------------------------------------------------------

export type ColumnType = "number" | "date" | "text" | "empty";

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  /** Median absolute deviation. Robust to the outliers we are looking for. */
  mad: number;
}

export interface ColumnProfile {
  name: string;
  index: number;
  type: ColumnType;
  /** Non-blank cells. */
  filled: number;
  blank: number;
  distinct: number;
  numeric: NumericStats | null;
}

const NUMERIC_NAME = /(amount|total|price|cost|qty|quantity|count|value|balance|fee|rate)/i;
const DATE_NAME = /(date|at$|_at|time|due|created|updated)/i;

/** Accepts `1234`, `1,234.56`, `$1,234.56`, `(1,234.56)` and `-12`. */
export function toNumber(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const negative = /^\(.*\)$/.test(v);
  const cleaned = v.replace(/[()]/g, "").replace(/[$£€\s]/g, "").replace(/,/g, "");
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** ISO-ish dates only. Guessing between 03/04 and 04/03 is how data gets ruined. */
export function toDate(raw: string): Date | null {
  const v = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(v)) return null;
  const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function stats(values: number[]): NumericStats {
  const sorted = [...values].sort((a, b) => a - b);
  const median = middle(sorted);
  const deviations = values.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    median,
    mad: middle(deviations),
  };
}

function middle(sorted: number[]): number {
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function profile(header: string[], rows: string[][]): ColumnProfile[] {
  return header.map((name, index) => {
    const cells = rows.map((r) => (r[index] ?? "").trim());
    const present = cells.filter((c) => c !== "");
    const numbers = present.map(toNumber).filter((n): n is number => n !== null);
    const dates = present.filter((c) => toDate(c) !== null);

    // A column is numeric or date only if effectively ALL of its present values
    // parse. A column of mostly-numbers is text with a data-quality problem, and
    // the finding below is more useful than a bad type guess.
    const ratio = (n: number) => (present.length ? n / present.length : 0);
    let type: ColumnType = "text";
    if (!present.length) type = "empty";
    else if (ratio(numbers.length) >= 0.95) type = "number";
    else if (ratio(dates.length) >= 0.95) type = "date";

    return {
      name,
      index,
      type,
      filled: present.length,
      blank: cells.length - present.length,
      distinct: new Set(present).size,
      numeric: type === "number" && numbers.length >= 2 ? stats(numbers) : null,
    };
  });
}

// --- anomalies ----------------------------------------------------------------

/**
 * Modified z-score threshold. 3.5 is the conventional cutoff for the
 * median/MAD form, which is used here instead of mean/standard-deviation
 * because a single enormous value inflates the standard deviation enough to
 * hide itself. The robust form does not have that failure mode.
 */
export const OUTLIER_THRESHOLD = 3.5;

export interface DatasetReport {
  rowCount: number;
  columnCount: number;
  columns: ColumnProfile[];
  findings: Finding[];
  /** One line for the verification record. */
  outcome: string;
  truncated: boolean;
}

export function analyseDataset(text: string): DatasetReport {
  const { header, rows, truncated } = parseCsv(text);
  const findings: Finding[] = [];

  if (!header.length) {
    return {
      rowCount: 0,
      columnCount: 0,
      columns: [],
      findings: [
        {
          code: "empty_file",
          severity: "critical",
          message: "The file contains no rows at all.",
        },
      ],
      outcome: "No data to verify.",
      truncated,
    };
  }

  if (truncated) {
    findings.push({
      code: "input_truncated",
      severity: "warning",
      message: `Only the first ${MAX_ROWS.toLocaleString()} rows were analysed; the rest were not read.`,
    });
  }

  // --- structure -------------------------------------------------------------
  const unnamed = header.filter((h) => h === "").length;
  if (unnamed) {
    findings.push({
      code: "unnamed_column",
      severity: "warning",
      message: `${unnamed} column${unnamed > 1 ? "s have" : " has"} no name in the header row.`,
    });
  }

  const seenNames = new Map<string, number>();
  for (const name of header) {
    const key = name.toLowerCase();
    seenNames.set(key, (seenNames.get(key) ?? 0) + 1);
  }
  for (const [name, count] of seenNames) {
    if (count > 1 && name !== "") {
      findings.push({
        code: "duplicate_column",
        severity: "critical",
        message: `The column "${name}" appears ${count} times, so its values are ambiguous.`,
      });
    }
  }

  if (!rows.length) {
    findings.push({
      code: "header_only",
      severity: "critical",
      message: "The file has a header but no data rows.",
    });
  }

  const ragged = rows
    .map((r, i) => ({ i, len: r.length }))
    .filter((r) => r.len !== header.length);
  if (ragged.length) {
    const first = ragged[0];
    findings.push({
      code: "ragged_row",
      severity: "critical",
      message: `${ragged.length} row${ragged.length > 1 ? "s do" : " does"} not have ${header.length} fields; the first has ${first.len}.`,
      where: `row ${first.i + 2}`,
    });
  }

  // --- duplicates ------------------------------------------------------------
  const rowKeys = new Map<string, number>();
  let duplicateRows = 0;
  let firstDuplicate = -1;
  rows.forEach((r, i) => {
    const key = r.join(" ");
    if (rowKeys.has(key)) {
      duplicateRows++;
      if (firstDuplicate < 0) firstDuplicate = i;
    } else {
      rowKeys.set(key, i);
    }
  });
  if (duplicateRows) {
    findings.push({
      code: "duplicate_row",
      severity: "warning",
      message: `${duplicateRows} row${duplicateRows > 1 ? "s are" : " is"} an exact copy of an earlier row.`,
      where: `row ${firstDuplicate + 2}`,
    });
  }

  // --- per column ------------------------------------------------------------
  const columns = profile(header, rows);

  for (const col of columns) {
    if (col.type === "empty" && rows.length) {
      findings.push({
        code: "empty_column",
        severity: "warning",
        message: `Every value in "${col.name}" is blank.`,
        where: `column ${col.name}`,
      });
      continue;
    }

    if (col.blank && rows.length) {
      const share = col.blank / rows.length;
      findings.push({
        code: "missing_values",
        severity: share > 0.2 ? "warning" : "info",
        message: `"${col.name}" is blank in ${col.blank} of ${rows.length} rows.`,
        where: `column ${col.name}`,
      });
    }

    // A column that looks like it should be numeric but is not.
    if (col.type === "text" && NUMERIC_NAME.test(col.name) && col.filled) {
      const bad = rows
        .map((r, i) => ({ i, v: (r[col.index] ?? "").trim() }))
        .filter((c) => c.v !== "" && toNumber(c.v) === null);
      if (bad.length) {
        findings.push({
          code: "non_numeric_value",
          severity: "warning",
          message: `"${col.name}" reads as a number column but ${bad.length} value${bad.length > 1 ? "s are" : " is"} not numeric — first is "${bad[0].v}".`,
          where: `row ${bad[0].i + 2}, column ${col.name}`,
        });
      }
    }

    if (col.type === "text" && DATE_NAME.test(col.name) && col.filled) {
      const bad = rows
        .map((r, i) => ({ i, v: (r[col.index] ?? "").trim() }))
        .filter((c) => c.v !== "" && toDate(c.v) === null);
      if (bad.length) {
        findings.push({
          code: "unparseable_date",
          severity: "warning",
          message: `"${col.name}" reads as a date column but ${bad.length} value${bad.length > 1 ? "s are" : " is"} not an ISO date — first is "${bad[0].v}".`,
          where: `row ${bad[0].i + 2}, column ${col.name}`,
        });
      }
    }

    if (col.type === "number") {
      const values = rows.map((r, i) => ({ i, n: toNumber((r[col.index] ?? "").trim()) }));

      if (NUMERIC_NAME.test(col.name)) {
        const negatives = values.filter((v) => v.n !== null && v.n < 0);
        if (negatives.length) {
          findings.push({
            code: "negative_amount",
            severity: "warning",
            message: `"${col.name}" holds ${negatives.length} negative value${negatives.length > 1 ? "s" : ""}, first ${negatives[0].n}.`,
            where: `row ${negatives[0].i + 2}, column ${col.name}`,
          });
        }
      }

      // Outliers. Skipped when MAD is zero — a column where at least half the
      // values are identical produces an infinite score for every other value,
      // which would flag the entire column and mean nothing.
      if (col.numeric && col.numeric.mad > 0) {
        const { median, mad } = col.numeric;
        const outliers = values
          .filter((v) => v.n !== null)
          .map((v) => ({ ...v, z: (0.6745 * Math.abs((v.n as number) - median)) / mad }))
          .filter((v) => v.z > OUTLIER_THRESHOLD)
          .sort((a, b) => b.z - a.z);

        if (outliers.length) {
          const worst = outliers[0];
          findings.push({
            code: "amount_outlier",
            severity: "warning",
            message: `${outliers.length} value${outliers.length > 1 ? "s in" : " in"} "${col.name}" sit far outside the rest; the largest is ${worst.n} against a median of ${median}.`,
            where: `row ${worst.i + 2}, column ${col.name}`,
          });
        }
      }
    }

    if (col.type === "date") {
      const now = Date.now();
      const future = rows
        .map((r, i) => ({ i, d: toDate((r[col.index] ?? "").trim()) }))
        .filter((v) => v.d && v.d.getTime() > now);
      if (future.length) {
        findings.push({
          code: "future_date",
          severity: "info",
          message: `"${col.name}" holds ${future.length} date${future.length > 1 ? "s" : ""} in the future.`,
          where: `row ${future[0].i + 2}, column ${col.name}`,
        });
      }
    }
  }

  const critical = findings.filter((f) => f.severity === "critical").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const outcome =
    `${rows.length.toLocaleString()} rows × ${header.length} columns. ` +
    (critical || warnings
      ? `${critical} critical, ${warnings} warning${warnings === 1 ? "" : "s"}.`
      : "No anomalies found.");

  return {
    rowCount: rows.length,
    columnCount: header.length,
    columns,
    findings,
    outcome,
    truncated,
  };
}
