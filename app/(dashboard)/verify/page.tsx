import type { Metadata } from "next";
import Link from "next/link";
import { VerifyConsole } from "@/components/arena/VerifyConsole";

export const metadata: Metadata = {
  title: "Verify — VeriFlow",
  description:
    "Upload a CSV. Every column is profiled, every anomaly is reported with the numbers behind it, and the result travels to four apps under four separate mandates.",
};

export const dynamic = "force-dynamic";

export default function VerifyPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-gold">Verify</p>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-bone sm:text-[36px]">
          Findings you can <span className="gradient-text">argue with.</span>
        </h1>
        <p className="mt-2.5 max-w-prose text-[14px] leading-relaxed text-muted">
          Hand it a spreadsheet and it reports what is wrong, where, and against what. Every number
          in the report came from code you can read — no model decides whether a row is an outlier,
          and the column statistics the judgement was made against are printed beside it.
        </p>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-faint">
          Nothing to upload?{" "}
          <Link
            href="/arena"
            className="text-muted underline decoration-hairline underline-offset-4 hover:text-bone hover:decoration-bone"
          >
            Play a game instead — same pipeline.
          </Link>
        </p>
      </header>

      <VerifyConsole />
    </div>
  );
}
