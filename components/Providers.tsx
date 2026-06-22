"use client";
import { useEffect } from "react";
import { useAgentStore } from "@/store/useAgentStore";

export function Providers({ children }: { children: React.ReactNode }) {
  const seed = useAgentStore((s) => s.seed);
  useEffect(() => { seed(); }, [seed]);
  return <>{children}</>;
}
