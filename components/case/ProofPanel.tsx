"use client";

import { useState } from "react";
import type { Hop } from "@/lib/cases/model";
import { HOP_LABEL } from "@/lib/cases/model";
import { ROSTER } from "@/lib/agents/roster";
import { CryptoValue } from "@/components/CryptoValue";
import { formatTimestamp } from "@/lib/utils";

// =============================================================================
// Proof panel — the evidence surface for one hop (MASTER.md §5.5).
//
// Every row is label-in-eyebrow, value-in-mono, with a copy affordance. Hashes
// are truncated head-and-tail with the full value one click away, never
// silently shortened (MASTER.md §7).
//
// The honesty note at the bottom is not decoration: it states what the hash
// does and does not prove, so a judge reading a single hop gets the same caveat
// the reliability brief gives.
// =============================================================================

export function ProofPanel({ hop }: { hop: Hop }) {
  const [showCalls, setShowCalls] = useState(false);
  const agent = ROSTER[hop.role];

  return (
    <section className="rounded-card border border-hairline bg-surface/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[19px] leading-none text-bone">
          {HOP_LABEL[hop.kind]}
        </h3>
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-verdigris">
          Sealed
        </span>
      </div>

      <p className="mt-2 text-[13px] leading-relaxed text-muted">{hop.note}</p>

      <dl className="mt-4 divide-y divide-hairline border-t border-hairline">
        <Row label="Agent">
          <span className="text-signal">{agent.name}</span>
          <span className="ml-2 text-faint">{hop.role}</span>
        </Row>

        <Row label="Delegatee key">
          <CryptoValue value={agent.agentPubkey} />
        </Row>

        {hop.tool && (
          <Row label="Tool">
            <span className="crypto text-[12.5px] text-bone">{hop.tool}</span>
          </Row>
        )}

        {hop.mandateVersion !== null && (
          <Row label="Mandate version">
            <span className="crypto text-[12.5px] text-bone">v{hop.mandateVersion}</span>
          </Row>
        )}

        {hop.argsHash && (
          <Row label="Args hash">
            <CryptoValue value={hop.argsHash} />
          </Row>
        )}

        {hop.resultHash && (
          <Row label="Result hash">
            <CryptoValue value={hop.resultHash} />
          </Row>
        )}

        <Row label="Previous hop">
          {hop.prevHopHash ? (
            <CryptoValue value={hop.prevHopHash} />
          ) : (
            <span className="text-[12.5px] text-faint">— first hop in the chain</span>
          )}
        </Row>

        {hop.hopHash && (
          <Row label="This hop">
            <CryptoValue value={hop.hopHash} />
          </Row>
        )}

        <Row label="Ran">
          <span className="crypto text-[12.5px] text-muted">{formatTimestamp(hop.startedAt)}</span>
        </Row>
      </dl>

      {/* The gate hop makes two calls; both are under the seal, and both are
          shown. Collapsing them would hide the second argument hash. */}
      {hop.calls.length > 1 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowCalls((v) => !v)}
            aria-expanded={showCalls}
            className="inline-flex min-h-[44px] items-center gap-2 text-[12.5px] text-muted transition-colors hover:text-bone"
          >
            <span aria-hidden className="text-faint">
              {showCalls ? "−" : "+"}
            </span>
            {hop.calls.length} attested calls under this seal
          </button>

          {showCalls && (
            <ol className="mt-2 space-y-2">
              {hop.calls.map((call, i) => (
                <li
                  key={`${call.tool}-${i}`}
                  className="rounded-seal border border-hairline bg-ink/50 p-3"
                >
                  <p className="crypto text-[12px] text-bone">{call.tool}</p>
                  <div className="mt-1.5 space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                        args
                      </span>
                      <CryptoValue value={call.argsHash} />
                    </p>
                    {call.resultHash && (
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-faint">
                          result
                        </span>
                        <CryptoValue value={call.resultHash} />
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <p className="mt-4 border-t border-hairline pt-3 text-[12px] leading-relaxed text-faint">
        This hash proves the call ran with these arguments, in this order, under mandate v
        {hop.mandateVersion ?? "—"}, and has not been altered since. It does not prove the upstream
        source told the truth.
      </p>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted">{label}</dt>
      <dd className="min-w-0 text-[12.5px] text-bone">{children}</dd>
    </div>
  );
}
