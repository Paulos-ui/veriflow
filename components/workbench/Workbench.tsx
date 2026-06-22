"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useAgentStore } from "@/store/useAgentStore";
import { Registry } from "./Registry";
import { Dossier } from "./Dossier";
import { type Stage } from "./ChainSpine";
import { SealMark } from "@/components/SealMark";

const STAGES: Stage[] = ["identity", "mandate", "action", "proof"];

export function Workbench() {
  const agents = useAgentStore((s) => s.agents);
  const params = useSearchParams();

  const [focusId, setFocusId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("identity");

  // initialise focus from the URL (deep-link) or the first agent
  useEffect(() => {
    const a = params.get("agent");
    const st = params.get("stage");
    if (a && agents.some((x) => x.id === a)) setFocusId(a);
    else if (!focusId && agents[0]) setFocusId(agents[0].id);
    if (st && STAGES.includes(st as Stage)) setStage(st as Stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  // keep the URL in sync for deep-linking / demo bookmarks (no navigation)
  useEffect(() => {
    if (!focusId) return;
    window.history.replaceState(null, "", `/?agent=${focusId}&stage=${stage}`);
  }, [focusId, stage]);

  const agent = agents.find((a) => a.id === focusId) ?? agents[0] ?? null;

  if (agents.length === 0) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center text-center">
        <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 16 }}>
          <SealMark size={88} active={false} />
        </motion.div>
        <h1 className="mt-8 max-w-md font-display text-4xl leading-tight text-bone">
          No agents <span className="gradient-text">sealed</span> yet.
        </h1>
        <p className="mt-3 max-w-sm text-muted">
          Provision a verifiable agent and walk it through identity, mandate, action, and proof.
        </p>
        <Link
          href="/agents/new"
          className="group mt-7 inline-flex items-center gap-2 rounded-card bg-gold px-5 py-2.5 text-sm font-medium text-ink transition-transform hover:scale-[1.02]"
        >
          Provision your first agent
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Registry
        agents={agents}
        focusId={agent?.id}
        onSelect={(id) => {
          setFocusId(id);
          setStage("identity");
        }}
      />
      {agent && <Dossier key={agent.id} agent={agent} stage={stage} onStage={setStage} />}
    </div>
  );
}
