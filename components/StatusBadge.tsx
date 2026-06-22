import { cn } from "@/lib/utils";

const MAP: Record<string, { label: string; dot: string; cls: string }> = {
  active:       { label: "Sealed",       dot: "bg-gold",   cls: "text-gold border-gold/35 bg-gold/[0.08]" },
  verified:     { label: "Attested",     dot: "bg-gold",   cls: "text-gold border-gold/35 bg-gold/[0.08]" },
  provisioning: { label: "Provisioning", dot: "bg-amber",  cls: "text-amber border-amber/30 bg-amber/[0.07]" },
  pending:      { label: "Awaiting",     dot: "bg-amber",  cls: "text-amber border-amber/30 bg-amber/[0.07]" },
  suspended:    { label: "Suspended",    dot: "bg-alert",  cls: "text-alert border-alert/30 bg-alert/[0.07]" },
  failed:       { label: "Failed",       dot: "bg-alert",  cls: "text-alert border-alert/30 bg-alert/[0.07]" },
  approve:      { label: "Approve",      dot: "bg-gold",   cls: "text-gold border-gold/35 bg-gold/[0.08]" },
  reject:       { label: "Reject",       dot: "bg-alert",  cls: "text-alert border-alert/30 bg-alert/[0.07]" },
  needs_review: { label: "Needs review", dot: "bg-amber",  cls: "text-amber border-amber/30 bg-amber/[0.07]" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, dot: "bg-muted", cls: "text-muted border-hairline bg-bone/[0.04]" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em]", s.cls)}>
      <span className={cn("h-1 w-1 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
