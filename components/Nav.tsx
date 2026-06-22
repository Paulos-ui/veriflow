"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { LayoutGrid, Plus, BookOpen, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/agents/new", label: "New agent", icon: Plus, exact: false },
  { href: "/about", label: "About", icon: BookOpen, exact: false },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-hairline/60 bg-ink/40 px-5 py-7 backdrop-blur-xl md:flex">
      <Link href="/" className="mb-10 flex items-center gap-2.5">
        <span className="relative grid h-8 w-8 place-items-center rounded-lg border border-verdigris/40 bg-verdigris/10">
          <span className="h-1.5 w-1.5 rounded-full bg-verdigris animate-pulse-glow" />
          <span className="absolute inset-0 rounded-lg bg-verdigris/20 blur-md" />
        </span>
        <span className="font-display text-xl tracking-tight text-bone">VeriFlow</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "group relative flex items-center gap-3 rounded-card px-3 py-2.5 text-sm transition-colors",
                active ? "text-bone" : "text-muted hover:text-bone"
              )}
            >
              {active && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-0 rounded-card border border-bone/10 bg-bone/[0.06]"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon size={16} strokeWidth={1.75} className="relative z-10" />
              <span className="relative z-10">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="rule" />
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <ShieldCheck size={15} strokeWidth={1.75} className="text-verdigris" />
          <span>Secured by</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-verdigris animate-pulse-glow" />
          <span className="crypto text-[11px] text-bone">Terminal 3 · TEE</span>
        </div>
      </div>
    </aside>
  );
}
