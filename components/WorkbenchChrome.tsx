"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  ChevronDown,
  FileCheck,
  History,
  Menu,
  Play,
  ScrollText,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Ledger } from "./Ledger";

// =============================================================================
// The chrome: one header, seven destinations, nothing hidden from a keyboard.
//
// Four of them are primary — Arena, Verify, Activity, About — because those are
// the four things somebody arriving here is trying to do: run it, check their
// own data with it, read the record, and understand the claim.
//
// The other three are still routes that work, so they are not deleted to tidy
// the header; they live behind a labelled disclosure. A nav that drops a working
// page is a nav that lies about what the app can do.
// =============================================================================

interface Destination {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One line, shown in the disclosures where there is room for it. */
  hint: string;
}

const PRIMARY: Destination[] = [
  { href: "/arena", label: "Arena", icon: Play, hint: "Play a game, then make it prove the result" },
  { href: "/verify", label: "Verify", icon: FileCheck, hint: "Check a spreadsheet against real statistics" },
  { href: "/activity", label: "Activity", icon: History, hint: "Every sealed run, including the refused ones" },
  { href: "/about", label: "About", icon: BookOpen, hint: "What the system claims and how it is enforced" },
];

const SECONDARY: Destination[] = [
  { href: "/agents", label: "Agents", icon: Users, hint: "The roster and the mandate each one holds" },
  { href: "/reliability", label: "Reliability", icon: ShieldCheck, hint: "Failure modes, and what happens on each" },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function WorkbenchChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const moreRef = useRef<HTMLDivElement | null>(null);

  const closeAll = useCallback(() => {
    setMoreOpen(false);
    setMenuOpen(false);
  }, []);

  // Navigating closes whatever was open. Without this a tap on a link in the
  // mobile sheet leaves the sheet covering the page it just went to.
  useEffect(() => {
    closeAll();
  }, [pathname, closeAll]);

  // Escape closes, and a pointer landing outside the popover closes it. Both are
  // what a disclosure is expected to do; neither is optional for keyboard use.
  useEffect(() => {
    if (!moreOpen && !menuOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    const onPointer = (e: PointerEvent) => {
      if (!moreOpen) return;
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [moreOpen, menuOpen, closeAll]);

  const openLedger = useCallback(() => {
    closeAll();
    setLedgerOpen(true);
  }, [closeAll]);

  return (
    <div className="relative z-10 min-h-screen">
      <header className="sticky top-0 z-30 border-b border-hairline/50 bg-ink/40 backdrop-blur-xl">
        <div className="flex items-center justify-between px-5 py-3.5 sm:px-8">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2.5 rounded-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-signal"
          >
            <span className="relative grid h-7 w-7 place-items-center rounded-lg border border-gold/40 bg-gold/10">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
            </span>
            <span className="font-display text-lg tracking-tight text-bone">VeriFlow</span>
          </Link>

          {/* Wide viewports: everything primary inline, the rest one click away. */}
          <nav aria-label="Primary" className="hidden items-center gap-0.5 md:flex">
            {PRIMARY.map((d) => (
              <NavLink key={d.href} destination={d} active={isActive(pathname, d.href)} />
            ))}

            <div ref={moreRef} className="relative ml-1">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-controls="more-menu"
                className={cn(
                  "inline-flex min-h-[36px] items-center gap-1.5 rounded-card border border-hairline px-3 py-1.5 text-[13px] transition-colors duration-200",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
                  moreOpen ? "border-bone/25 text-bone" : "text-muted hover:border-bone/25 hover:text-bone"
                )}
              >
                More
                <ChevronDown
                  size={13}
                  aria-hidden
                  className={cn("transition-transform duration-200", moreOpen && "rotate-180")}
                />
              </button>

              {moreOpen && (
                <div
                  id="more-menu"
                  className="glass absolute right-0 top-[calc(100%+8px)] w-[276px] rounded-xl2 border border-hairline p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-150"
                >
                  {SECONDARY.map((d) => (
                    <MenuRow key={d.href} destination={d} active={isActive(pathname, d.href)} />
                  ))}
                  <div className="my-1.5 h-px bg-hairline" />
                  <LedgerRow onClick={openLedger} />
                </div>
              )}
            </div>
          </nav>

          {/* Narrow viewports: one button, then every destination at full width.
              Cramming five labels into a phone header is how a route quietly
              becomes unreachable. */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            className="inline-flex min-h-[40px] items-center gap-2 rounded-card border border-hairline px-3 text-[13px] text-muted transition-colors duration-200 hover:border-bone/25 hover:text-bone focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal md:hidden"
          >
            {menuOpen ? <X size={15} aria-hidden /> : <Menu size={15} aria-hidden />}
            {menuOpen ? "Close" : "Menu"}
          </button>
        </div>

        {menuOpen && (
          <nav
            id="mobile-menu"
            aria-label="All destinations"
            className="border-t border-hairline/50 px-3 pb-3 pt-2 animate-in fade-in-0 slide-in-from-top-1 duration-150 md:hidden"
          >
            {PRIMARY.map((d) => (
              <MenuRow key={d.href} destination={d} active={isActive(pathname, d.href)} />
            ))}
            <div className="my-1.5 h-px bg-hairline" />
            {SECONDARY.map((d) => (
              <MenuRow key={d.href} destination={d} active={isActive(pathname, d.href)} />
            ))}
            <LedgerRow onClick={openLedger} />
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>

      <Ledger open={ledgerOpen} onClose={() => setLedgerOpen(false)} />
    </div>
  );
}

/**
 * An inline header link. The active one is marked twice — colour and a gold rule
 * — because colour alone is not a marker for everybody looking at it.
 */
function NavLink({ destination, active }: { destination: Destination; active: boolean }) {
  const Icon = destination.icon;
  return (
    <Link
      href={destination.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex min-h-[36px] items-center gap-2 rounded-card px-3 py-1.5 text-[13px] transition-colors duration-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
        active ? "text-bone" : "text-muted hover:text-bone"
      )}
    >
      <Icon size={14} aria-hidden className={active ? "text-gold" : undefined} />
      {destination.label}
      {active && (
        <span aria-hidden className="absolute inset-x-3 -bottom-[3px] h-px bg-gold/70" />
      )}
    </Link>
  );
}

/** A full-width row used by both disclosures, so they cannot drift apart. */
function MenuRow({ destination, active }: { destination: Destination; active: boolean }) {
  const Icon = destination.icon;
  return (
    <Link
      href={destination.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[48px] items-center gap-3 rounded-card px-3 py-2 transition-colors duration-200",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal",
        active ? "bg-raised/60 text-bone" : "text-muted hover:bg-raised/40 hover:text-bone"
      )}
    >
      <Icon size={15} aria-hidden className={cn("shrink-0", active ? "text-gold" : "text-faint")} />
      <span className="min-w-0">
        <span className="block text-[13.5px] leading-tight">{destination.label}</span>
        <span className="block text-[11.5px] leading-snug text-faint">{destination.hint}</span>
      </span>
    </Link>
  );
}

function LedgerRow({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[48px] w-full items-center gap-3 rounded-card px-3 py-2 text-left text-muted transition-colors duration-200 hover:bg-raised/40 hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
    >
      <ScrollText size={15} aria-hidden className="shrink-0 text-faint" />
      <span className="min-w-0">
        <span className="block text-[13.5px] leading-tight">Ledger</span>
        <span className="block text-[11.5px] leading-snug text-faint">
          Permission decisions from this session
        </span>
      </span>
    </button>
  );
}
