"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type Stage = "identity" | "mandate" | "action" | "proof";

const NODES: { key: Stage; label: string }[] = [
  { key: "identity", label: "Identity" },
  { key: "mandate", label: "Mandate" },
  { key: "action", label: "Action" },
  { key: "proof", label: "Proof" },
];

export function ChainSpine({
  stage,
  onStage,
  done,
}: {
  stage: Stage;
  onStage: (s: Stage) => void;
  done: Record<Stage, boolean>;
}) {
  const lastDone = NODES.reduce((acc, n, i) => (done[n.key] ? i : acc), 0);
  const fill = (lastDone / (NODES.length - 1)) * 100;

  return (
    <div className="relative px-1 py-2">
      {/* track */}
      <div className="absolute left-[18px] right-[18px] top-[20px] h-px bg-hairline" />
      <div
        className="absolute left-[18px] top-[20px] h-px bg-gradient-to-r from-gold/60 to-gold transition-all duration-700"
        style={{ width: `calc((100% - 36px) * ${fill / 100})` }}
      />

      <div className="relative flex items-start justify-between">
        {NODES.map((n) => {
          const isDone = done[n.key];
          const isCurrent = stage === n.key;
          return (
            <button
              key={n.key}
              onClick={() => onStage(n.key)}
              className="group flex flex-col items-center gap-2"
              style={{ width: 64 }}
            >
              <span
                className={cn(
                  "relative grid h-9 w-9 place-items-center rounded-full border bg-ink transition-all duration-300",
                  isCurrent
                    ? "border-gold shadow-glow-gold"
                    : isDone
                    ? "border-gold/60"
                    : "border-hairline group-hover:border-faint"
                )}
              >
                {isCurrent && <span className="absolute inset-0 rounded-full bg-gold/15 animate-pulse-glow" />}
                {isDone ? (
                  <Check size={15} className="relative text-gold" />
                ) : (
                  <span className={cn("relative h-1.5 w-1.5 rounded-full", isCurrent ? "bg-gold" : "bg-faint")} />
                )}
              </span>
              <span
                className={cn(
                  "font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors",
                  isCurrent ? "text-gold" : isDone ? "text-bone/80" : "text-faint group-hover:text-muted"
                )}
              >
                {n.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
