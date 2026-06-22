"use client";

import { useState } from "react";
import Link from "next/link";
import { ScrollText, BookOpen } from "lucide-react";
import { Ledger } from "./Ledger";

export function WorkbenchChrome({ children }: { children: React.ReactNode }) {
  const [ledgerOpen, setLedgerOpen] = useState(false);

  return (
    <div className="relative z-10 min-h-screen">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-hairline/50 bg-ink/40 px-5 py-3.5 backdrop-blur-xl sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="relative grid h-7 w-7 place-items-center rounded-lg border border-gold/40 bg-gold/10">
            <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse-glow" />
          </span>
          <span className="font-display text-lg tracking-tight text-bone">VeriFlow</span>
        </Link>

        <nav className="flex items-center gap-2">
          <button
            onClick={() => setLedgerOpen(true)}
            className="inline-flex items-center gap-2 rounded-card border border-hairline px-3 py-1.5 text-[13px] text-muted transition-colors hover:border-gold/30 hover:text-gold"
          >
            <ScrollText size={14} /> Ledger
          </button>
          <Link
            href="/about"
            className="inline-flex items-center gap-2 rounded-card px-3 py-1.5 text-[13px] text-muted transition-colors hover:text-bone"
          >
            <BookOpen size={14} /> About
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>

      <Ledger open={ledgerOpen} onClose={() => setLedgerOpen(false)} />
    </div>
  );
}
