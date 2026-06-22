"use client";

import { motion } from "framer-motion";
import { Seal } from "./Seal";
import { CryptoValue } from "./CryptoValue";
import type { Attestation } from "@/types";
import { formatTimestamp } from "@/lib/utils";

function Row({ label, children, i }: { label: string; children: React.ReactNode; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 + i * 0.08 }}
      className="flex items-center justify-between border-t border-hairline/50 py-2.5 first:border-t-0"
    >
      <span className="eyebrow">{label}</span>
      <span className="text-right">{children}</span>
    </motion.div>
  );
}

export function ProofViewer({ attestation }: { attestation: Attestation }) {
  let i = 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 240, damping: 22 }}
      className="console relative overflow-hidden rounded-card p-6 shadow-glow-verdigris"
    >
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-verdigris/20 blur-3xl" />
      <div className="relative flex items-center gap-5">
        <Seal state="verified" size={76} />
        <div>
          <p className="font-mono text-[11px] uppercase tracking-eyebrow text-verdigris text-glow-verdigris">
            Attested by Terminal 3
          </p>
          <h3 className="mt-1 font-display text-xl text-bone">Action verified in TEE</h3>
          <p className="mt-0.5 text-sm text-muted">Hardware-attested, host-stamped, unforgeable.</p>
        </div>
      </div>

      <div className="relative mt-5">
        <Row label="Proof hash" i={i++}><CryptoValue value={attestation.proofHash} /></Row>
        {attestation.txHash && <Row label="Ledger tx" i={i++}><CryptoValue value={attestation.txHash} /></Row>}
        <Row label="TEE quote" i={i++}>
          <span className="crypto text-[12.5px] text-verdigris">
            {attestation.teeQuoteVerified ? "verifyTdxQuote → valid" : "unverified"}
          </span>
        </Row>
        {attestation.rtmr3 && <Row label="RTMR3" i={i++}><CryptoValue value={attestation.rtmr3} /></Row>}
        {attestation.auditEventId && <Row label="Audit event" i={i++}><CryptoValue value={attestation.auditEventId} /></Row>}
        {attestation.verifiedAt && (
          <Row label="Verified at" i={i++}>
            <span className="text-[12.5px] text-muted">{formatTimestamp(attestation.verifiedAt)}</span>
          </Row>
        )}
      </div>
    </motion.div>
  );
}
