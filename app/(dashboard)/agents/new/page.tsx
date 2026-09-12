import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AgentCreateFlow } from "@/components/AgentCreateFlow";

export default function NewAgentPage() {
  return (
    <div className="space-y-10">
      <Link href="/agents" className="inline-flex items-center gap-2 text-sm text-muted hover:text-bone">
        <ArrowLeft size={15} /> Registry
      </Link>
      <header>
        <p className="eyebrow mb-2">Provision</p>
        <h1 className="font-display text-4xl text-bone">New agent</h1>
        <p className="mt-2 max-w-lg text-muted">
          Give the agent an identity on Terminal 3. It starts with zero authority —
          you grant a scoped mandate next.
        </p>
      </header>
      <AgentCreateFlow />
    </div>
  );
}
