import { Providers } from "@/components/Providers";
import { AmbientBackground } from "@/components/AmbientBackground";
import { WorkbenchChrome } from "@/components/WorkbenchChrome";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="grain relative min-h-screen">
        <AmbientBackground />
        <WorkbenchChrome>{children}</WorkbenchChrome>
      </div>
    </Providers>
  );
}
