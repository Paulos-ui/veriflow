"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import type { Agent } from "@/types";
import { SealMark } from "@/components/SealMark";
import { cn } from "@/lib/utils";

export function Registry({
  agents,
  focusId,
  onSelect,
}: {
  agents: Agent[];
  focusId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 overflow-x-auto pb-1">
      {agents.map((a) => {
        const active = a.id === focusId;
        return (
          <motion.button
            key={a.id}
            onClick={() => onSelect(a.id)}
            whileHover={{ y: -2 }}
            className={cn(
              "group flex shrink-0 items-center gap-3 rounded-card border px-3.5 py-2.5 transition-colors",
              active
                ? "border-gold/40 bg-gold/[0.06] shadow-glow-gold"
                : "border-bone/[0.08] bg-surface/50 hover:border-gold/25"
            )}
          >
            <span className="grid h-8 w-8 place-items-center">
              <SealMark size={30} active={a.status === "active"} />
            </span>
            <span className="text-left">
              <span className={cn("block font-display text-[15px] leading-tight", active ? "text-bone" : "text-bone/80")}>
                {a.name}
              </span>
              <span className="block text-[11px] text-muted">{a.role}</span>
            </span>
          </motion.button>
        );
      })}

      <Link
        href="/agents/new"
        className="flex shrink-0 items-center gap-2 rounded-card border border-dashed border-hairline px-3.5 py-2.5 text-sm text-muted transition-colors hover:border-gold/30 hover:text-gold"
      >
        <Plus size={15} /> Provision
      </Link>
    </div>
  );
}
