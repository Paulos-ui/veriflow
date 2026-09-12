"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Cpu, ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { StatusBadge } from "./StatusBadge";
import { ProofViewer } from "./ProofViewer";
import { useAgentStore } from "@/store/useAgentStore";
import type { Agent, Permission, Invoice, AgentDecision, Attestation, WorkflowRun, AuditEntry } from "@/types";
import { formatUsd, truncateId } from "@/lib/utils";

type Stage = "select" | "running" | "decided" | "executing" | "attested";
type LogKind = "sys" | "think" | "reason" | "flag" | "verdict";
interface Line { id: number; kind: LogKind; text: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PREFIX: Record<LogKind, string> = { sys: "↳", think: "·", reason: "✓", flag: "⚠", verdict: "◆" };
const COLOR: Record<LogKind, string> = {
  sys: "text-faint",
  think: "text-muted",
  reason: "text-verdigris",
  flag: "text-amber",
  verdict: "text-bone",
};

export function WorkflowRunner({
  agent,
  permission,
  operatorDid,
}: {
  agent: Agent;
  permission?: Permission;
  operatorDid: string;
}) {
  const invoices = useAgentStore((s) => s.invoices);
  const upsertRun = useAgentStore((s) => s.upsertRun);
  const addAudit = useAgentStore((s) => s.addAuditEntries);

  const [stage, setStage] = useState<Stage>("select");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [decision, setDecision] = useState<AgentDecision | null>(null);
  const [attestation, setAttestation] = useState<Attestation | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [runId, setRunId] = useState("");
  const lineId = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  const push = (kind: LogKind, text: string) =>
    setLines((prev) => [...prev, { id: lineId.current++, kind, text }]);

  const reset = () => {
    setStage("select");
    setInvoice(null);
    setDecision(null);
    setAttestation(null);
    setLines([]);
  };

  const run = async (inv: Invoice) => {
    setInvoice(inv);
    setStage("running");
    setLines([]);
    const id = `run_${Date.now()}`;
    setRunId(id);

    push("sys", `agent ${agent.name} · session open`);
    await sleep(420);
    push("sys", permission ? `mandate ${truncateId(permission.credentialId)} · ceiling ${formatUsd(permission.maxApprovalAmount)}` : "no mandate · zero authority");
    await sleep(420);
    push("think", `reading invoice ${inv.reference} — ${inv.vendor}, ${formatUsd(inv.amount)}`);
    await sleep(520);
    push("think", "evaluating amount against mandate ceiling…");
    await sleep(560);
    push("think", "checking vendor against allow-list…");
    await sleep(520);
    push("think", `cross-checking ${inv.lineItems.length} line items…`);

    const res = await fetch("/api/groq/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice: inv, permission: permission ?? null }),
    });
    const d: AgentDecision = await res.json();
    await sleep(500);

    for (const r of d.reasons) { push("reason", r); await sleep(360); }
    for (const f of d.flags) { push("flag", f); await sleep(360); }
    await sleep(300);
    push("verdict", `decision: ${d.verdict.replace("_", " ")} · confidence ${(d.confidence * 100).toFixed(0)}%`);

    setDecision(d);
    setStage("decided");

    const wr: WorkflowRun = {
      id, agentId: agent.id, invoice: inv, decision: d, attestation: null,
      state: d.verdict === "approve" ? "decided" : "rejected", startedAt: new Date().toISOString(),
    };
    upsertRun(wr);
    addAudit([{
      id: `aud_${id}`, agentId: agent.id, action: "invoice.analyzed",
      detail: `Analyzed ${inv.vendor} (${formatUsd(inv.amount)}) → ${d.verdict.replace("_", " ")}.`,
      attestationId: null, timestamp: wr.startedAt,
    }]);
  };

  const execute = async () => {
    if (!invoice || !decision || !permission) return;
    setStage("executing");
    push("sys", "signing delegated invocation with agent key…");
    await sleep(620);
    push("sys", "submitting to Terminal 3 TEE…");
    const res = await fetch("/api/t3n/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operatorDid, agentPubkey: agent.agentPubkey, credentialId: permission.credentialId,
        payload: { invoiceId: invoice.id, vendor: invoice.vendor, amount: invoice.amount },
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      push("flag", err.error ?? "Execution failed.");
      setStage("decided");
      return;
    }
    const att: Attestation = await res.json();
    await sleep(700);
    push("sys", "awaiting hardware attestation…");
    await sleep(700);
    setAttestation(att);
    setStage("attested");
    upsertRun({ id: runId, agentId: agent.id, invoice, decision, attestation: att, state: "attested", startedAt: new Date().toISOString() });
    addAudit([{
      id: `aud_exec_${runId}`, agentId: agent.id, action: "action.executed",
      detail: `Paid ${invoice.vendor} ${formatUsd(invoice.amount)} — attested in TEE.`,
      attestationId: att.id, timestamp: att.verifiedAt ?? new Date().toISOString(),
    }]);
  };

  const canExecute = decision?.verdict === "approve" && decision.withinPermissions && !!permission;
  const thinking = stage === "running";

  return (
    <div className="space-y-4">
      {stage === "select" && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            {invoices.map((inv, i) => (
              <motion.button
                key={inv.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                onClick={() => run(inv)}
                disabled={!permission}
                className="glass glass-hover group rounded-card p-4 text-left disabled:opacity-40 disabled:pointer-events-none"
              >
                <FileText size={16} className="text-faint transition-colors group-hover:text-signal" />
                <p className="mt-3 text-sm text-bone">{inv.vendor}</p>
                <p className="font-display text-lg text-bone">{formatUsd(inv.amount)}</p>
                <p className="crypto mt-1 text-[11px] text-faint">{inv.reference}</p>
              </motion.button>
            ))}
          </div>
          {!permission && <p className="text-sm text-amber">Issue a mandate first — the agent has no authority to act.</p>}
        </>
      )}

      {/* Live agent console */}
      {stage !== "select" && (
        <div className="console overflow-hidden rounded-card">
          <div className="flex items-center gap-2 border-b border-bone/8 px-4 py-2.5">
            <Cpu size={14} className={thinking ? "text-signal animate-pulse" : "text-verdigris"} />
            <span className="crypto text-[11px] uppercase tracking-eyebrow text-muted">
              {agent.name} · reasoning console
            </span>
            {thinking && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-signal animate-pending-pulse" />}
          </div>
          <div ref={scrollRef} className="max-h-72 overflow-y-auto px-4 py-3.5">
            <div className="space-y-1.5">
              {lines.map((l) => (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex gap-2.5 font-mono text-[12.5px] leading-relaxed"
                >
                  <span className={COLOR[l.kind]}>{PREFIX[l.kind]}</span>
                  <span className={l.kind === "verdict" ? "text-bone" : l.kind === "reason" ? "text-bone/90" : l.kind === "flag" ? "text-amber" : "text-muted"}>
                    {l.text}
                  </span>
                </motion.div>
              ))}
              {(thinking || stage === "executing") && (
                <div className="flex gap-2.5 font-mono text-[12.5px]">
                  <span className="text-signal">▌</span>
                  <span className="text-faint animate-blink">thinking…</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Verdict + action */}
      <AnimatePresence>
        {(stage === "decided" || stage === "executing") && decision && invoice && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="glass rounded-card p-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-display text-lg text-bone">{invoice.vendor}</span>
                <span className="text-sm text-muted">{formatUsd(invoice.amount)}</span>
              </div>
              <StatusBadge status={decision.verdict} />
            </div>
            <p className="mt-3 text-sm text-bone">{decision.summary}</p>
            <div className="mt-5 flex items-center justify-between border-t border-hairline/50 pt-4">
              <span className="text-[12.5px] text-faint">
                {decision.withinPermissions ? "within mandate" : "outside mandate — escalated"}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={reset}>Discard</Button>
                {canExecute ? (
                  <Button variant="seal" onClick={execute} disabled={stage === "executing"}>
                    {stage === "executing" ? "Executing in TEE…" : (<>Approve &amp; pay <ArrowRight size={15} /></>)}
                  </Button>
                ) : (
                  <Button variant="outline" disabled>Escalated to human</Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {stage === "attested" && attestation && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <ProofViewer attestation={attestation} />
          <Button variant="ghost" onClick={reset}>Run another</Button>
        </motion.div>
      )}
    </div>
  );
}
