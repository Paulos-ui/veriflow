"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, ShieldOff, ArrowRight } from "lucide-react";
import type { Agent } from "@/types";
import { useAgentStore } from "@/store/useAgentStore";
import { ChainSpine, type Stage } from "./ChainSpine";
import { SealMark } from "@/components/SealMark";
import { StatusBadge } from "@/components/StatusBadge";
import { CryptoValue } from "@/components/CryptoValue";
import { Button } from "@/components/ui/button";
import { PermissionModal } from "@/components/PermissionModal";
import { WorkflowRunner } from "@/components/WorkflowRunner";
import { ProofViewer } from "@/components/ProofViewer";
import { OPERATOR_DID } from "@/lib/demo";
import { formatUsd, formatTimestamp } from "@/lib/utils";

const WHY: Record<Stage, string> = {
  identity: "Issued by Terminal 3 — the agent cannot mint its own identity.",
  mandate: "A signed, capped, revocable credential. Authority is explicit.",
  action: "The agent reasons, then acts only within its mandate.",
  proof: "Every action is hardware-attested in a TEE — host-stamped and unforgeable.",
};

export function Dossier({
  agent,
  stage,
  onStage,
}: {
  agent: Agent;
  stage: Stage;
  onStage: (s: Stage) => void;
}) {
  const permissions = useAgentStore((s) => s.permissions);
  const allRuns = useAgentStore((s) => s.runs);
  const revoke = useAgentStore((s) => s.revokePermission);
  const [modalOpen, setModalOpen] = useState(false);

  // Derive in render from STABLE store arrays. Selectors must never return a
  // freshly-built array (.filter/.map) or Zustand re-renders forever.
  const permission = permissions.find((p) => p.agentId === agent.id && p.active);
  const runs = allRuns.filter((r) => r.agentId === agent.id);
  const attestedRun = runs.find((r) => r.attestation);
  const done: Record<Stage, boolean> = {
    identity: true,
    mandate: !!permission,
    action: runs.length > 0,
    proof: !!attestedRun,
  };

  return (
    <div className="relative overflow-hidden rounded-xl2 border border-bone/[0.08] bg-gradient-to-b from-raised/55 to-surface/40">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/45 to-transparent" />

      {/* header */}
      <div className="flex items-start justify-between gap-4 p-6 sm:p-7">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl text-bone">{agent.name}</h1>
            <StatusBadge status={agent.status} />
          </div>
          <p className="mt-1 text-sm text-muted">{agent.role}</p>
          <div className="mt-3 flex items-center gap-1.5">
            <span className="h-1 w-1 rounded-full bg-gold" />
            <span className="crypto text-[12px] text-gold/90">{agent.did}</span>
          </div>
        </div>
        <div className="shrink-0">
          <SealMark size={62} active={agent.status === "active"} />
        </div>
      </div>

      {/* spine */}
      <div className="border-y border-hairline/50 bg-ink/30 px-5 py-4 sm:px-7">
        <ChainSpine stage={stage} onStage={onStage} done={done} />
      </div>

      {/* stage */}
      <div className="p-6 sm:p-7">
        <p className="mb-5 text-[12.5px] leading-relaxed text-muted">{WHY[stage]}</p>

        <AnimatePresence mode="wait">
          <motion.div
            key={stage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {stage === "identity" && (
              <div className="space-y-2.5 rounded-card border border-bone/[0.07] bg-ink/30 p-5">
                <Field label="Verifiable identity"><CryptoValue value={agent.did} truncate={false} /></Field>
                <Hr />
                <Field label="Delegatee key"><CryptoValue value={agent.agentPubkey} /></Field>
                <Hr />
                <Field label="Provisioned"><span className="text-[12.5px] text-muted">{formatTimestamp(agent.createdAt)}</span></Field>
                <Hr />
                <Field label="Attestation">
                  <span className="flex items-center gap-1.5 font-mono text-[12px] text-gold"><ShieldCheck size={13} /> Sealed in TEE</span>
                </Field>
              </div>
            )}

            {stage === "mandate" && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="eyebrow">Scoped delegation</h2>
                  {permission ? (
                    <Button variant="ghost" onClick={() => revoke(permission.id)}><ShieldOff size={15} /> Revoke</Button>
                  ) : (
                    <Button variant="seal" onClick={() => setModalOpen(true)}><ShieldCheck size={15} /> Seal a mandate</Button>
                  )}
                </div>
                {permission ? (
                  <div className="rounded-card border border-gold/25 bg-gold/[0.04] p-6 shadow-glow-gold">
                    <div className="grid gap-5 sm:grid-cols-3">
                      <div>
                        <p className="eyebrow mb-1.5">Ceiling</p>
                        <p className="font-display text-2xl text-bone">{formatUsd(permission.maxApprovalAmount)}</p>
                      </div>
                      <div>
                        <p className="eyebrow mb-1.5">Vendors</p>
                        <p className="text-sm text-muted">{permission.allowedVendors.length ? permission.allowedVendors.join(", ") : "Any"}</p>
                      </div>
                      <div>
                        <p className="eyebrow mb-1.5">Expires</p>
                        <p className="text-sm text-muted">{permission.expiresAt ? formatTimestamp(permission.expiresAt) : "Never"}</p>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-hairline/50 pt-4">
                      <span className="eyebrow">Credential</span>
                      <CryptoValue value={permission.credentialId} />
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setModalOpen(true)}
                    className="block w-full rounded-card border border-dashed border-hairline bg-ink/20 p-8 text-center text-muted transition-colors hover:border-gold/30"
                  >
                    No mandate sealed. The agent has zero authority until you seal one.
                  </button>
                )}
                {done.mandate && (
                  <Button className="mt-4" variant="outline" onClick={() => onStage("action")}>
                    Run an action <ArrowRight size={15} />
                  </Button>
                )}
              </div>
            )}

            {stage === "action" && (
              <WorkflowRunner agent={agent} permission={permission} operatorDid={OPERATOR_DID} />
            )}

            {stage === "proof" && (
              attestedRun?.attestation ? (
                <ProofViewer attestation={attestedRun.attestation} />
              ) : (
                <button
                  onClick={() => onStage("action")}
                  className="block w-full rounded-card border border-dashed border-hairline bg-ink/20 p-8 text-center text-muted transition-colors hover:border-gold/30"
                >
                  No proof yet. Run an action to generate a hardware attestation.
                </button>
              )
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <PermissionModal agent={agent} operatorDid={OPERATOR_DID} open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="eyebrow pt-0.5">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
function Hr() {
  return <div className="border-t border-hairline/40" />;
}
