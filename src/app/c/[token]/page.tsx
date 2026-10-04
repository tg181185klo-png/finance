import CardSpendLink from "@/components/CardSpendLink";
import { Suspense } from "react";

export default async function CardSpendLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-zinc-950 text-zinc-400">იტვირთება...</div>
      }
    >
      <CardSpendLink token={token} />
    </Suspense>
  );
}
