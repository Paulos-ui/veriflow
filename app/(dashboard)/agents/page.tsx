import { Suspense } from "react";
import { Workbench } from "@/components/workbench/Workbench";

// The Terminal 3 provisioning surface: mint a delegatee identity, grant it a
// scoped mandate, run an action, read the proof. This is where agent keys are
// actually created — the case workspace at `/` consumes the result.
export default function Page() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow mb-2">Terminal 3</p>
        <h1 className="font-display text-[30px] leading-tight text-bone">Agent registry</h1>
        <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-muted">
          Provision a verifiable identity and walk it through identity, mandate, action, and proof.
          An agent starts with zero authority until a mandate is granted.
        </p>
      </header>

      <Suspense
        fallback={
          <div aria-busy="true" className="space-y-3">
            <div className="h-[68px] rounded-card border border-hairline bg-surface/30" />
            <div className="h-[320px] rounded-xl2 border border-hairline bg-surface/20" />
          </div>
        }
      >
        <Workbench />
      </Suspense>
    </div>
  );
}
