"use client";

import type { Case } from "@/lib/cases/model";
import { narrowingOf, ringStateOf } from "@/lib/cases/model";
import { MANDATE_RULES, boundRuleCount, ruleIsBound } from "@/lib/cases/view";
import { AuthorityRing } from "@/components/seal/AuthorityRing";
import { cn } from "@/lib/utils";

// =============================================================================
// The case seal: AuthorityRing bound to a live case (MASTER.md §4.3).
//
// Same primitive /about drives from scroll progress — identical physics, two
// drivers. Here `narrowing` comes from verified hops and each bezel tick is one
// mandate rule that has actually bound.
//
// The legend beside it exists because the ring alone cannot name WHICH rule
// tightened. Geometry carries the state; the legend carries the specifics.
// That ordering is MASTER.md §1: state readable before language, never instead
// of it.
// =============================================================================

export function CaseSeal({ kase }: { kase: Case }) {
  const state = ringStateOf(kase);
  const bound = boundRuleCount(kase);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <AuthorityRing
        narrowing={narrowingOf(kase)}
        state={state}
        size={132}
        boundRules={bound}
        totalRules={MANDATE_RULES.length}
      >
        <span className="text-center">
          <span className="block font-display text-[22px] leading-none text-bone">
            {bound}
            <span className="text-faint">/{MANDATE_RULES.length}</span>
          </span>
          <span className="mt-1 block font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">
            bound
          </span>
        </span>
      </AuthorityRing>

      <ul className="w-full min-w-0 space-y-1.5">
        {MANDATE_RULES.map((rule) => {
          const isBound = ruleIsBound(kase, rule.id);
          return (
            <li key={rule.id} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={cn(
                  "font-mono text-[11px] leading-none",
                  isBound ? "text-verdigris" : "text-faint"
                )}
              >
                {isBound ? "▸" : "▹"}
              </span>
              <span
                className={cn(
                  "text-[12.5px] leading-snug",
                  isBound ? "text-bone" : "text-faint"
                )}
              >
                {rule.label}
              </span>
              <span className="sr-only">{isBound ? "bound" : "not bound"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
