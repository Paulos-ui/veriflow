"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import type { Agent, Permission } from "@/types";
import { StatusBadge } from "./StatusBadge";
import { SealMark } from "./SealMark";
import { truncateId, formatUsd } from "@/lib/utils";

export function AgentCard({
  agent,
  permission,
  index = 0,
}: {
  agent: Agent;
  permission?: Permission;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link href={`/agents/${agent.id}`} className="group block">
        <div className="relative overflow-hidden rounded-card border border-bone/[0.08] bg-gradient-to-b from-raised/70 to-surface/60 p-5 shadow-lift transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-gold/30 group-hover:shadow-glow-gold">
          {/* seal binding line */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/55 to-transparent" />
          {/* hover sheen */}
          <div className="pointer-events-none absolute -inset-x-12 -top-12 h-28 -skew-x-12 bg-gradient-to-r from-transparent via-bone/[0.07] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          {/* warm glow behind the seal */}
          <div className="pointer-events-none absolute -right-7 -top-7 h-32 w-32 rounded-full bg-gold/10 blur-2xl" />

          {/* header */}
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
              <StatusBadge status={agent.status} />
              <h3 className="mt-3 font-display text-2xl leading-tight text-bone">{agent.name}</h3>
              <p className="mt-0.5 text-[13px] text-muted">{agent.role}</p>
            </div>
            <div className="shrink-0">
              <SealMark size={58} active={agent.status === "active"} />
            </div>
          </div>

          {/* engraved divider */}
          <div className="my-4 flex items-center gap-2">
            <span className="h-1 w-1 rotate-45 bg-gold/70" />
            <span className="h-px flex-1 bg-gradient-to-r from-gold/30 via-hairline to-transparent" />
          </div>

          {/* sealed record */}
          <dl className="relative space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <dt className="eyebrow">Identity</dt>
              <dd className="flex min-w-0 items-center gap-1.5">
                <span className="h-1 w-1 shrink-0 rounded-full bg-gold" />
                <span className="crypto truncate text-[12px] text-bone/85">{truncateId(agent.did)}</span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="eyebrow">Mandate</dt>
              <dd>
                {permission ? (
                  <span className="crypto text-[13px] text-gold">
                    {formatUsd(permission.maxApprovalAmount)} <span className="text-faint">ceiling</span>
                  </span>
                ) : (
                  <span className="text-[12.5px] text-faint">Unsealed</span>
                )}
              </dd>
            </div>
          </dl>

          {/* footer mark */}
          <div className="relative mt-4 flex items-center justify-between border-t border-hairline/40 pt-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">Terminal 3 · attested</span>
            <ArrowUpRight size={15} className="text-faint transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-gold" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
