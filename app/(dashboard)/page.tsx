import { CaseWorkspace } from "@/components/case/CaseWorkspace";
import { ConnectionRow } from "@/components/case/ConnectionRow";
import { Narrative } from "@/components/landing/Narrative";
import { defaultMandates } from "@/lib/agents/roster";
import { approvalChannel } from "@/lib/agents/channel";
import { nowSecs } from "@/lib/mandate/model";
import { appLinks } from "@/lib/tools/links";

// The workspace is the product surface: one case, four agents, six hops.
// Mandates are issued server-side and passed down as plain data — the client
// renders bounds, it never decides them.
//
// Dynamic because both things this page reports — which mandates are in force
// and which apps are connected — are read at request time. A cached answer here
// would be a stale claim about live credentials, which is the one claim on the
// page that must never be stale.
export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string }>;
}) {
  // Issued 60s in the past for the same reason ap-clerk.ts does it: a mandate
  // whose not_before is exactly now can lose a race against its own first call.
  // The channel is injected from the same resolver the case uses, so the roster
  // panel shows the allowlist the run will actually be judged against.
  const mandates = defaultMandates(nowSecs() - 60, { approvalChannel: approvalChannel() });
  const [links, params] = await Promise.all([appLinks(), searchParams]);

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

      <div className="pt-4">
        <Narrative />
      </div>

      {/* The original case, kept where it has always been. The narrative above
          argues the general claim; this is the specific one it was built for,
          and it still runs against the same mandate layer. */}
      <section aria-labelledby="ap-case-heading" className="space-y-6 pt-12">
        <div className="rule" />
        <header className="pt-2">
          <p className="eyebrow text-gold">The original case</p>
          <h2
            id="ap-case-heading"
            className="mt-2 font-display text-[24px] leading-tight text-bone sm:text-[28px]"
          >
            One invoice, four agents, six hops.
          </h2>
          <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">
            An accounts-payable clerk reads an invoice from Gmail, proposes a payment in Slack,
            waits for a person to answer, and only then touches Stripe. The mandates below are the
            ones this run will actually be judged against.
          </p>
        </header>

        <ConnectionRow links={links} notice={params.gmail} />

        <CaseWorkspace mandates={mandates} />
      </section>
    </div>
  );
}
