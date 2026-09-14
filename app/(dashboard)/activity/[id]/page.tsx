import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCase } from "@/lib/cases/store";
import { caseProofHash, verifyChain } from "@/lib/proof/attest";
import { RunReport } from "@/components/arena/RunReport";
import { formatTimestamp } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const kase = await loadCase(id);
  if (!kase) return { title: "Case not found — VeriFlow" };
  return {
    title: `${kase.title} — VeriFlow`,
    description: `A sealed record of case ${kase.id}: what was verified, what was refused, and what each app confirmed.`,
  };
}

export default async function CaseDetailPage({ params }: Props) {
  const { id } = await params;
  const kase = await loadCase(id);

  // A case id that does not resolve is a 404, not an empty report. Rendering an
  // empty shell for a missing id would let a mistyped link look like a run that
  // did nothing, which is the opposite of what happened.
  if (!kase) notFound();

  const chain = verifyChain(kase);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb">
        <Link
          href="/activity"
          className="inline-flex min-h-[44px] items-center text-[12.5px] text-muted transition-colors hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
        >
          <span aria-hidden className="mr-1.5">
            ←
          </span>
          All activity
        </Link>
      </nav>

      <ChainBanner
        intact={chain.intact}
        brokenAt={chain.brokenAt}
        reason={chain.reason}
        hash={caseProofHash(kase)}
        sealedAt={kase.createdAt}
      />

      <RunReport kase={kase} />
    </div>
  );
}

/**
 * The chain check, stated before the report it qualifies.
 *
 * This is the one claim on the page that is not about an external app: it says
 * whether the record you are about to read has been altered since it was
 * written. It goes above the report because a tampered record read first and
 * doubted second has already done its damage.
 */
function ChainBanner({
  intact,
  brokenAt,
  reason,
  hash,
  sealedAt,
}: {
  intact: boolean;
  brokenAt: number | null;
  reason: string | null;
  hash: string;
  sealedAt: string;
}) {
  if (!intact) {
    return (
      <div
        role="alert"
        className="rounded-card border border-alert/40 bg-alert/[0.06] px-4 py-3.5"
      >
        <p className="font-display text-[15px] text-alert">
          This record does not verify{brokenAt !== null && ` — hop ${brokenAt + 1} was altered`}.
        </p>
        <p className="mt-1.5 max-w-prose text-[12.5px] leading-relaxed text-muted">
          {reason ??
            "A hop's stored hash does not match the hash of its contents plus the hop before it."}{" "}
          Treat everything below as a claim rather than a record. Nothing here can be trusted to
          describe what the agents actually did.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-hairline bg-surface/30 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <p className="text-[12.5px] text-muted">
          <span className="text-verdigris">Chain verifies.</span> Every hop hashes to the one before
          it, back to the first.
        </p>
        <p className="crypto text-[11px] text-faint">sealed {formatTimestamp(sealedAt)}</p>
      </div>
      <p className="crypto mt-1.5 break-all text-[11px] text-faint">{hash}</p>
    </div>
  );
}
