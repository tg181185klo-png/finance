import BranchPortal from "@/components/BranchPortal";

export default async function BranchPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <BranchPortal token={token} />;
}
