"use client";

import { cn } from "@/lib/utils";
import type { DatasetColumn } from "@/lib/arena/events";

// =============================================================================
// The column profile — what the checker measured, per column.
//
// This is under "Findings" rather than beside it because that is what it is:
// the numbers the findings were derived from. An operator who wants to argue
// with "row 42 is an outlier" needs the median and the deviation it was judged
// against, and a report that states the conclusion without them is asking to be
// believed rather than checked.
//
// MAD rather than standard deviation, and the header says so. Standard deviation
// is moved by the very outlier it is being used to detect; the median absolute
// deviation is not, which is why the checker uses it.
// =============================================================================

const TYPE_CLS: Record<DatasetColumn["type"], string> = {
  number: "text-verdigris",
  date: "text-signal",
  text: "text-muted",
  empty: "text-faint",
};

/** Enough precision to check the work, not so much that the row stops scanning. */
function num(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 0.01 || abs >= 1e9)) return n.toExponential(2);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function ColumnTable({ columns }: { columns: DatasetColumn[] }) {
  return (
    <div className="rounded-card border border-hairline bg-surface/30">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-4 py-3">
        <h3 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          Columns read
        </h3>
        <p className="text-[11.5px] text-faint">
          Spread is the median absolute deviation, not the standard deviation — an outlier moves
          the second and not the first.
        </p>
      </div>

      {/* Horizontal scroll rather than hidden columns: the numbers are the
          evidence, so none of them gets dropped at a narrow width. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-hairline">
              <Th>Column</Th>
              <Th>Type</Th>
              <Th align="right">Filled</Th>
              <Th align="right">Blank</Th>
              <Th align="right">Distinct</Th>
              <Th align="right">Median</Th>
              <Th align="right">Spread</Th>
              <Th align="right">Range</Th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => (
              <tr key={`${c.index}-${c.name}`} className="border-b border-hairline/60 last:border-0">
                <Td>
                  <span className="text-bone">{c.name || <em className="text-faint">unnamed</em>}</span>
                </Td>
                <Td>
                  <span className={cn("font-mono text-[11px] uppercase tracking-[0.1em]", TYPE_CLS[c.type])}>
                    {c.type}
                  </span>
                </Td>
                <Td align="right">{c.filled.toLocaleString("en-US")}</Td>
                <Td align="right">
                  <span className={c.blank > 0 ? "text-amber" : undefined}>
                    {c.blank.toLocaleString("en-US")}
                  </span>
                </Td>
                <Td align="right">{c.distinct.toLocaleString("en-US")}</Td>
                <Td align="right">{c.numeric ? num(c.numeric.median) : "—"}</Td>
                <Td align="right">{c.numeric ? num(c.numeric.mad) : "—"}</Td>
                <Td align="right">
                  {c.numeric ? `${num(c.numeric.min)} – ${num(c.numeric.max)}` : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 font-mono text-[10px] font-normal uppercase tracking-[0.14em] text-faint",
        align === "right" && "text-right"
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-4 py-2.5 text-[12.5px] text-muted",
        align === "right" && "crypto text-right"
      )}
    >
      {children}
    </td>
  );
}
