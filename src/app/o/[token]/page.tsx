import OverviewPortal from "@/components/OverviewPortal";
import { Suspense } from "react";

export default async function OverviewReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">იტვირთება...</div>
      }
    >
      <OverviewPortal token={token} />
    </Suspense>
  );
}
