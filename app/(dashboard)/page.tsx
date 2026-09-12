import { CaseWorkspace } from "@/components/case/CaseWorkspace";
import { defaultMandates } from "@/lib/agents/roster";
import { nowSecs } from "@/lib/mandate/model";

// The workspace is the product surface: one case, four agents, six hops.
// Mandates are issued server-side and passed down as plain data — the client
// renders bounds, it never decides them.
export const dynamic = "force-dynamic";

export default function Page() {
  // Issued 60s in the past for the same reason ap-clerk.ts does it: a mandate
  // whose not_before is exactly now can lose a race against its own first call.
  const mandates = defaultMandates(nowSecs() - 60);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-[30px] leading-tight text-bone sm:text-[36px]">
          Agents act. <span className="gradient-text">The mandate decides.</span>
        </h1>
        <p className="mt-2.5 max-w-prose text-[14px] leading-relaxed text-muted">
          VeriFlow is a control plane for specialist agents. Each one holds its own key and a
          mandate that names exactly which tools it may call, on whose behalf, up to what amount.
          Anything outside those bounds never leaves the server.
        </p>
      </header>

      <CaseWorkspace mandates={mandates} />
    </div>
  );
}
