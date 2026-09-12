"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function AgentRedirect() {
  const params = useParams();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/agents?agent=${String(params.id)}&stage=identity`);
  }, [params.id, router]);
  return <div className="py-20 text-center text-faint">Opening agent…</div>;
}
