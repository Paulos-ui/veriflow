import { Suspense } from "react";
import { Workbench } from "@/components/workbench/Workbench";

export default function Page() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-faint">Loading workspace…</div>}>
      <Workbench />
    </Suspense>
  );
}
