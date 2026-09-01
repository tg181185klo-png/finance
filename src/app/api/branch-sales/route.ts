import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import {
  deleteClientSaleFromStore,
  listEmployeeSales,
  updateClientSaleInStore,
} from "@/lib/branch-sales-sync";
import { readStore, updateStore } from "@/lib/server-store";
import type { BranchClientSale } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const store = await readStore();
  return NextResponse.json({ sales: listEmployeeSales(store) });
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  try {
    const body = (await req.json()) as {
      action: "updateClientSale" | "deleteClientSale";
      reportId?: string;
      clientSaleId?: string;
      sale?: BranchClientSale;
    };

    if (!body.reportId || !body.clientSaleId) {
      return NextResponse.json({ error: "reportId და clientSaleId საჭიროა" }, { status: 400 });
    }

    if (body.action === "updateClientSale") {
      if (!body.sale) {
        return NextResponse.json({ error: "sale საჭიროა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        updateClientSaleInStore(s, body.reportId!, body.clientSaleId!, body.sale!);
      });
      return NextResponse.json({
        ok: true,
        sales: listEmployeeSales(store),
        branchReports: store.branchReports,
        transactions: store.transactions,
      });
    }

    if (body.action === "deleteClientSale") {
      const store = await updateStore((s) => {
        const result = deleteClientSaleFromStore(s, body.reportId!, body.clientSaleId!);
        if (result === null) {
          s.branchReports = s.branchReports.filter((r) => r.id !== body.reportId);
        }
      });
      return NextResponse.json({
        ok: true,
        sales: listEmployeeSales(store),
        branchReports: store.branchReports,
        transactions: store.transactions,
      });
    }

    return NextResponse.json({ error: "უცნობი მოქმედება" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
