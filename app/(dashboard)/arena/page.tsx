import type { Metadata } from "next";
import Link from "next/link";
import { ArenaConsole } from "@/components/arena/ArenaConsole";

export const metadata: Metadata = {
  title: "Arena — VeriFlow",
  description:
    "Play a game, then watch a verified result travel across GitHub, Telegram, Notion and Solana devnet under four separate mandates.",
};

// The integration board reads which credentials are present at request time, and
// a cached answer there would be a stale claim about live connections.
export const dynamic = "force-dynamic";

export default function ArenaPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow text-gold">Arena</p>
        <h1 className="mt-2 font-display text-[30px] leading-tight text-bone sm:text-[36px]">
          Play it. <span className="gradient-text">Then prove it.</span>
        </h1>
        <p className="mt-2.5 max-w-prose text-[14px] leading-relaxed text-muted">
          A finished game is a claim: nine numbers that anybody could type. VeriFlow replays the log
          from an empty board, decides what the result warrants, and carries it to four apps that
          have never heard of each other — each write made by a different agent holding one key and
          one destination.
        </p>
        <p className="mt-2 max-w-prose text-[13px] leading-relaxed text-faint">
          Checking a spreadsheet instead?{" "}
          <Link
            href="/verify"
            className="text-muted underline decoration-hairline underline-offset-4 hover:text-bone hover:decoration-bone"
          >
            The same pipeline takes CSVs.
          </Link>
        </p>
      </header>

      <ArenaConsole />
    </div>
  );
}
