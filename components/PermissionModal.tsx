"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { useAgentStore } from "@/store/useAgentStore";
import type { Agent, Permission, AuditEntry } from "@/types";
import { formatUsd } from "@/lib/utils";

export function PermissionModal({
  agent,
  operatorDid,
  open,
  onClose,
}: {
  agent: Agent;
  operatorDid: string;
  open: boolean;
  onClose: () => void;
}) {
  const addPermission = useAgentStore((s) => s.addPermission);
  const addAudit = useAgentStore((s) => s.addAuditEntries);

  const [amount, setAmount] = useState("10000");
  const [vendors, setVendors] = useState("");
  const [expires, setExpires] = useState("2026-12-31");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const allowedVendors = vendors
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    try {
      const res = await fetch("/api/t3n/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorDid,
          agentPubkey: agent.agentPubkey,
          maxApprovalAmount: Number(amount),
          allowedVendors,
          functions: ["invoice.analyze", "invoice.pay"],
          expiresAt: expires ? new Date(expires).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delegation failed");

      const permission: Permission = {
        id: `perm_${Date.now()}`,
        agentId: agent.id,
        credentialId: data.credentialId,
        maxApprovalAmount: Number(amount),
        allowedVendors,
        functions: ["invoice.analyze", "invoice.pay"],
        expiresAt: expires ? new Date(expires).toISOString() : null,
        issuedAt: data.issuedAt,
        active: true,
      };
      addPermission(permission);
      const entry: AuditEntry = {
        id: `aud_perm_${Date.now()}`,
        agentId: agent.id,
        action: "permission.issued",
        detail: `Delegation credential issued — ${formatUsd(Number(amount))} ceiling, ${
          allowedVendors.length ? `${allowedVendors.length} vendor(s)` : "any vendor"
        }.`,
        attestationId: null,
        timestamp: permission.issuedAt,
      };
      addAudit([entry]);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 10 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-md rounded-card border border-hairline bg-surface p-6"
          >
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-display text-xl text-bone">Issue a mandate</h2>
                <p className="mt-0.5 text-sm text-muted">
                  A signed, revocable delegation credential for {agent.name}.
                </p>
              </div>
              <button onClick={onClose} aria-label="Close" className="text-faint hover:text-bone">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="amount">Max approval (USD)</Label>
                <Input
                  id="amount"
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <p className="mt-1.5 text-[12px] text-faint">
                  Encoded as <span className="crypto">batch_cap_cents</span> on the credential.
                </p>
              </div>
              <div>
                <Label htmlFor="vendors">Allowed vendors</Label>
                <Input
                  id="vendors"
                  value={vendors}
                  placeholder="comma-separated · blank = any"
                  onChange={(e) => setVendors(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="expires">Expires</Label>
                <Input
                  id="expires"
                  type="date"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-alert">{error}</p>}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={busy}>
                {busy ? "Signing credential…" : "Sign & issue"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
