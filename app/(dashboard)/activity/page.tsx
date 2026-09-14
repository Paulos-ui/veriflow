import type { Metadata } from "next";
import Link from "next/link";
import { listCases } from "@/lib/cases/store";
import { verifyChain } from "@/lib/proof/attest";
import type { Case, CaseStatus } from "@/lib/cases/model";
import { spineKinds } from "@/lib/cases/model";
import { VERDICT_LABEL } from "@/lib/arena/events";
import { formatTimestamp } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Activity — VeriFlow",
  description:
    "Every case this deployment has run, with its status, its hop count, and whether its hash chain still verifies.",
};

// Read at request time. A cached list would show a run that has since been added
// as missing, which on a page whose whole job is "here is the record" is the one
// failure mode that matters.
export const dynamic = "force-dynamic";

const STATUS: Record<CaseStatus, { word: string; cls: string }> = {
  running: { word: "Running", cls: "border-amber/35 bg-amber/[0.07] text-amber" },
  completed: { word: "Completed", cls: "border-verdigris/35 bg-verdigris/[0.07] text-verdigris" },
  partial: { word: "Partial", cls: "border-amber/35 bg-amber/[0.07] text-amber" },
  halted: { word: "Halted", cls: "border-alert/40 bg-alert/[0.07] text-alert" },
};

export default async function ActivityPage() {
  const cases = await listCases();

  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-gold">Activity</p>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-bone sm:text-[36px]">
          Every run, <span className="gradient-text">including the refused ones.</span>
        </h1>
        <p className="mt-2.5 max-w-prose text-[14px] leading-relaxed text-muted">
          Cases are append-only and each hop is hashed against the one before it. A run that was
          stopped by a mandate stays here with the reason attached — the deny path is the evidence,
          not an embarrassment to be cleared out.
        </p>
      </header>

      {cases.length === 0 ? (
        <Empty />
      ) : (
        <ul className="space-y-2">
          {cases.map((c) => (
            <CaseRow key={c.id} kase={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-xl2 border border-dashed border-hairline px-6 py-10 text-center">
      <p className="font-display text-[18px] text-bone">Nothing has run yet.</p>
      <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted">
        Play a game in the Arena or check a spreadsheet in Verify, and the sealed record will appear
        here.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          href="/arena"
          className="inline-flex min-h-[44px] items-center rounded-seal border border-bone/20 bg-raised/60 px-4 text-[13px] text-bone transition-colors hover:border-bone/35"
        >
          Open the Arena
        </Link>
        <Link
          href="/verify"
          className="inline-flex min-h-[44px] items-center rounded-seal border border-hairline px-4 text-[13px] text-muted transition-colors hover:border-bone/25 hover:text-bone"
        >
          Check a spreadsheet
        </Link>
      </div>
    </div>
  );
}

function CaseRow({ kase }: { kase: Case }) {
  const status = STATUS[kase.status];
  const chain = verifyChain(kase);
  const total = spineKinds(kase).length;
  const verified = kase.hops.filter((h) => h.status === "verified").length;
  const verdict = kase.arena?.verification.verdict ?? null;

  return (
    <li>
      <Link
        href={`/activity/${kase.id}`}
        className="block rounded-card border border-hairline bg-surface/30 px-4 py-3.5 transition-colors duration-200 hover:border-bone/25 hover:bg-raised/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
          <span className="min-w-0 font-display text-[15px] leading-snug text-bone">
            {kase.title}
          </span>
          <span
            className={`shrink-0 rounded-seal border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${status.cls}`}
          >
            {status.word}
          </span>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
          <span className="crypto text-faint">{kase.id}</span>
          <span aria-hidden className="text-faint">
            ·
          </span>
          <span>
            {verified}/{total} hops verified
          </span>
          {verdict && (
            <>
              <span aria-hidden className="text-faint">
                ·
              </span>
              <span>{VERDICT_LABEL[verdict]}</span>
            </>
          )}
          <span aria-hidden className="text-faint">
            ·
          </span>
          <span className="crypto text-faint">{formatTimestamp(kase.createdAt)}</span>
          <span aria-hidden className="text-faint">
            ·
          </span>
          <span className={chain.intact ? "text-verdigris" : "text-alert"}>
            {chain.intact ? "chain intact" : `chain broken at hop ${(chain.brokenAt ?? 0) + 1}`}
          </span>
        </div>

        {kase.haltedReason && (
          <p className="mt-1.5 text-[12.5px] leading-snug text-alert">{kase.haltedReason}</p>
        )}
      </Link>
    </li>
  );
}
