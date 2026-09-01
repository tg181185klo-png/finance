import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { buildCustomersWorkbook } from "@/lib/customers";
import { readStore } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const store = await readStore();
  const buffer = buildCustomersWorkbook(store.customers ?? []);
  const filename = `klientebi-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
