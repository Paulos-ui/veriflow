"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Seal } from "./Seal";
import { CryptoValue } from "./CryptoValue";
import { ShieldCheck, Copy, Check } from "lucide-react";
import { formatTimestamp } from "@/lib/utils";
import { useAgentStore } from "@/store/useAgentStore";
import type { Agent, AuditEntry } from "@/types";

type Phase = "form" | "provisioning" | "done";
const HEX = "0123456789abcdef";

/** Scramble characters that settle into the final value, lock-style. */
function ScrambleText({ value, active }: { value: string; active: boolean }) {
  const [display, setDisplay] = useState(value);
  const frame = useRef(0);

  useEffect(() => {
    if (!active) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    const tick = () => {
      frame.current += 1;
      const settled = Math.floor(frame.current / 2);
      const out = value
        .split("")
        .map((ch, i) =>
          ch === ":" || i < settled ? ch : HEX[Math.floor(Math.random() * 16)]
        )
        .join("");
      setDisplay(out);
      if (settled < value.length) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, value]);

  return <span className="crypto text-[12.5px] text-gold">{display}</span>;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {}
      }}
      aria-label="Copy"
      className="text-faint transition-colors hover:text-gold"
    >
      {copied ? <Check size={13} className="text-gold" /> : <Copy size={13} />}
    </button>
  );
}

export function AgentCreateFlow() {
  const router = useRouter();
  const addAgent = useAgentStore((s) => s.addAgent);
  const addAudit = useAgentStore((s) => s.addAuditEntries);

  const [phase, setPhase] = useState<Phase>("form");
  const [name, setName] = useState("");
  const [role, setRole] = useState("Finance Agent");
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const provision = async () => {
    if (!name.trim()) return;
    setError(null);
    setPhase("provisioning");
    try {
      const res = await fetch("/api/t3n/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Provisioning failed");

      const created: Agent = {
        id: data.id,
        name: data.name,
        role: data.role,
        did: data.did,
        agentPubkey: data.agentPubkey,
        status: data.status,
        createdAt: data.createdAt,
      };
      // hold the provisioning beat so the materialization reads
      await new Promise((r) => setTimeout(r, 1100));
      addAgent(created);
      const entry: AuditEntry = {
        id: `aud_${created.id}`,
        agentId: created.id,
        action: "agent.registered",
        detail: `${created.name} provisioned with delegatee key and Terminal 3 identity.`,
        attestationId: null,
        timestamp: created.createdAt,
      };
      addAudit([entry]);
      setAgent(created);
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPhase("form");
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl">
      <AnimatePresence mode="wait">
        {phase === "form" && (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-6"
          >
            <div>
              <Label htmlFor="name">Agent name</Label>
              <Input
                id="name"
                value={name}
                placeholder="e.g. Atlas"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && provision()}
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} />
            </div>
            {error && <p className="text-sm text-alert">{error}</p>}
            <Button onClick={provision} disabled={!name.trim()}>
              Provision identity
            </Button>
            <p className="text-[12.5px] leading-relaxed text-faint">
              Provisioning generates the agent&rsquo;s delegatee key and registers its
              verifiable identity on Terminal 3. The agent can do nothing until you
              issue it a scoped mandate.
            </p>
          </motion.div>
        )}

        {phase === "provisioning" && (
          <motion.div
            key="provisioning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-6 py-10"
          >
            <Seal state="verifying" />
            <div className="text-center">
              <p className="font-mono text-[12px] uppercase tracking-eyebrow text-amber">
                Authenticating operator · minting identity
              </p>
              <p className="mt-2 text-sm text-muted">Terminal 3 is issuing the agent&rsquo;s DID…</p>
            </div>
          </motion.div>
        )}

        {phase === "done" && agent && (
          <motion.div
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center pt-10"
          >
            <div className="relative w-full">
              {/* seal pressed into the top edge of the credential */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 190, damping: 15, delay: 0.12 }}
                className="absolute left-1/2 -top-9 z-20 -translate-x-1/2"
              >
                <div className="rounded-full border border-gold/30 bg-ink p-1.5 shadow-glow-gold">
                  <Seal state="verified" size={72} />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-xl2 border border-gold/25 bg-gradient-to-b from-raised/75 to-surface/60 px-7 pb-7 pt-16 shadow-lift"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-[0.06]"
                  style={{
                    background:
                      "repeating-radial-gradient(circle at 50% 6%, transparent 0 7px, rgb(var(--gold-rgb)) 7px 7.6px)",
                    maskImage: "radial-gradient(120% 80% at 50% 0%, #000 25%, transparent 72%)",
                    WebkitMaskImage: "radial-gradient(120% 80% at 50% 0%, #000 25%, transparent 72%)",
                  }}
                />

                <div className="relative text-center">
                  <p className="eyebrow text-gold/80">Certificate of Attestation</p>
                  <h2 className="mt-3 font-display text-[2rem] leading-tight text-bone">{agent.name}</h2>
                  <p className="mt-1.5 text-[13px] text-muted">{agent.role} · attested on Terminal 3</p>
                </div>

                <div className="relative my-6 flex items-center justify-center gap-2">
                  <span className="h-px w-12 bg-gradient-to-r from-transparent to-gold/40" />
                  <span className="h-1 w-1 rotate-45 bg-gold/70" />
                  <span className="h-px w-12 bg-gradient-to-l from-transparent to-gold/40" />
                </div>

                <dl className="relative overflow-hidden rounded-card border border-bone/[0.08] bg-ink/30">
                  <div className="flex items-start justify-between gap-4 px-4 py-3.5">
                    <dt className="eyebrow pt-0.5">Verifiable identity</dt>
                    <dd className="flex min-w-0 items-start gap-2 text-right">
                      <ScrambleText value={agent.did} active />
                      <span className="shrink-0 pt-px"><CopyButton value={agent.did} /></span>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-hairline/50 px-4 py-3.5">
                    <dt className="eyebrow">Delegatee key</dt>
                    <dd><CryptoValue value={agent.agentPubkey} /></dd>
                  </div>
                  <div className="flex items-center justify-between gap-4 border-t border-hairline/50 px-4 py-3.5">
                    <dt className="eyebrow">Attestation</dt>
                    <dd className="flex items-center gap-1.5 font-mono text-[12px] text-gold">
                      <ShieldCheck size={13} /> Sealed in TEE
                    </dd>
                  </div>
                </dl>

                <div className="relative mt-5 flex items-center justify-center gap-2">
                  <span className="h-1 w-1 rounded-full bg-gold" />
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-gold/80">
                    Attested by Terminal 3 · TEE
                  </span>
                </div>
                <p className="relative mt-1 text-center font-mono text-[10px] text-faint">
                  Issued {formatTimestamp(agent.createdAt)}
                </p>
              </motion.div>
            </div>

            <div className="mt-8 flex gap-3">
              <Button onClick={() => router.push(`/?agent=${agent.id}&stage=mandate`)}>Issue a mandate</Button>
              <Button variant="outline" onClick={() => router.push("/")}>Back to overview</Button>
            </div>
            <p className="mt-3 text-center text-[12px] text-faint">
              The agent has zero authority until you issue a mandate.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
