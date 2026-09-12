"use client";

import type { Mandate } from "@/lib/mandate/model";
import type { AgentRole } from "@/lib/agents/roster";
import { ROSTER } from "@/lib/agents/roster";
import { MandateChip } from "./MandateChip";
import { usd } from "@/lib/mandate/refusal";
import { cn } from "@/lib/utils";
import { truncateId } from "@/lib/utils";

// =============================================================================
// Agent roster — four principals, four keys, four different amounts of
// authority, each shown as the bounds it actually operates under.
//
// The orchestrator is the one worth reading closely: its function list is
// EMPTY, and that renders as "no external reach" rather than being omitted. An
// agent with no authority is a claim the interface should make loudly — it is
// the reason a compromised planner cannot spend anything.
// =============================================================================

const ORDER: AgentRole[] = ["orchestrator", "mail.reader", "comms.poster", "pay.clerk"];

export function AgentRoster({
  mandates,
  /** Roles that touched the currently-open case, highlighted in the roster. */
  active = [],
}: {
  mandates: Record<AgentRole, Mandate>;
  active?: AgentRole[];
}) {
  return (
    <section aria-labelledby="roster-heading">
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="roster-heading"
          className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-muted"
        >
          Agents
        </h2>
        <p className="text-[12px] text-faint">Each holds its own key and its own bounds.</p>
      </div>

      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {ORDER.map((role) => (
          <AgentCard
            key={role}
            role={role}
            mandate={mandates[role]}
            participating={active.includes(role)}
          />
        ))}
      </ul>
    </section>
  );
}

function AgentCard({
  role,
  mandate,
  participating,
}: {
  role: AgentRole;
  mandate: Mandate;
  participating: boolean;
}) {
  const agent = ROSTER[role];
  const grounded = mandate.functions.length === 0;

  return (
    <li
      className={cn(
        "rounded-card border p-3.5 transition-colors duration-200",
        participating ? "border-signal/30 bg-signal/[0.04]" : "border-hairline bg-surface/40"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[16px] leading-none text-bone">{agent.name}</h3>
        <span className="crypto text-[10.5px] text-signal">{role}</span>
      </div>

      <p className="mt-2 text-[12.5px] leading-snug text-muted">{agent.charter}</p>

      {/* Bounds. Wrapping before shrinking, per chip-collection-reflow. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <MandateChip
          label="key"
          value={truncateId(agent.agentPubkey, 8, 4)}
          detail={agent.agentPubkey}
          tone="identity"
        />

        {grounded ? (
          <MandateChip label="reach" value="no external tools" tone="open" />
        ) : (
          <MandateChip
            label="fn"
            value={
              mandate.functions.length === 1
                ? mandate.functions[0]
                : `${mandate.functions.length} tools`
            }
            detail={mandate.functions.join("\n")}
          />
        )}

        {mandate.batchCapCents > 0 && (
          <MandateChip label="cap" value={`≤ ${usd(mandate.batchCapCents)}`} />
        )}

        {mandate.scopes.gmailSenders?.length ? (
          <MandateChip
            label="from"
            value={`${mandate.scopes.gmailSenders.length} senders`}
            detail={mandate.scopes.gmailSenders.join("\n")}
          />
        ) : null}

        {mandate.scopes.slackChannels?.length ? (
          <MandateChip
            label="channel"
            value={mandate.scopes.slackChannels[0]}
            detail={mandate.scopes.slackChannels.join("\n")}
          />
        ) : null}

        {mandate.scopes.vendors?.length ? (
          <MandateChip
            label="vendors"
            value={`${mandate.scopes.vendors.length} allowed`}
            detail={mandate.scopes.vendors.join("\n")}
          />
        ) : null}

        <MandateChip label="expires" value={expiryLabel(mandate)} tone="open" />
      </div>
    </li>
  );
}

/** Relative expiry, because "in 23h" is what an operator actually reasons about. */
function expiryLabel(m: Mandate): string {
  const secs = m.notAfterSecs - Math.floor(Date.now() / 1000);
  if (secs <= 0) return "expired";
  const hours = Math.floor(secs / 3600);
  if (hours >= 1) return `in ${hours}h`;
  return `in ${Math.max(1, Math.floor(secs / 60))}m`;
}
