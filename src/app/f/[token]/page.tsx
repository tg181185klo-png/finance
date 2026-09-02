import BranchPortal from "@/components/BranchPortal";
import { Suspense } from "react";

export default async function BranchPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { token } = await params;
  const { date } = await searchParams;
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">იტვირთება...</div>}>
      <BranchPortal token={token} fixedDate={date} />
    </Suspense>
  );
}
