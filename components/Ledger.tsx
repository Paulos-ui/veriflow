"use client";

import { motion, AnimatePresence } from "framer-motion";
import { X, ScrollText } from "lucide-react";
import { useAgentStore } from "@/store/useAgentStore";
import { formatTimestamp } from "@/lib/utils";

const ACTION_LABEL: Record<string, string> = {
  "agent.registered": "Agent registered",
  "permission.issued": "Mandate sealed",
  "invoice.analyzed": "Invoice analyzed",
  "action.executed": "Payment attested",
};

export function Ledger({ open, onClose }: { open: boolean; onClose: () => void }) {
  const audit = useAgentStore((s) => s.audit);
  const agents = useAgentStore((s) => s.agents);
  const nameOf = (id: string) => agents.find((a) => a.id === id)?.name ?? "—";

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={onClose} />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-gold/20 bg-surface/95 backdrop-blur-xl"
          >
            <header className="flex items-center justify-between border-b border-hairline/60 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <ScrollText size={16} className="text-gold" />
                <div>
                  <p className="font-display text-[15px] text-bone">Attestation ledger</p>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">Host-stamped · immutable</p>
                </div>
              </div>
              <button onClick={onClose} aria-label="Close" className="text-faint hover:text-bone"><X size={18} /></button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ol className="relative ml-3 border-l border-hairline/70">
                {audit.map((e, i) => (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="relative py-3 pl-6 pr-1"
                  >
                    <span className="absolute -left-[5px] top-[18px] h-2.5 w-2.5 rounded-full border border-gold/50 bg-ink">
                      <span className="absolute inset-[3px] rounded-full bg-gold/80" />
                    </span>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-display text-[14px] text-bone">{ACTION_LABEL[e.action] ?? e.action}</p>
                      <span className="crypto shrink-0 text-[10.5px] text-faint">{formatTimestamp(e.timestamp)}</span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{e.detail}</p>
                    <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">actor · {nameOf(e.agentId)}</p>
                  </motion.li>
                ))}
                {audit.length === 0 && <li className="py-4 pl-6 text-sm text-faint">No entries yet.</li>}
              </ol>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
