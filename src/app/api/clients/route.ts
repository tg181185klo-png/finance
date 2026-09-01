import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import {
  buildCustomersWorkbook,
  mergeCustomerImport,
  parseCustomersExcel,
} from "@/lib/customers";
import { updateStore, readStore } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const store = await readStore();
  return NextResponse.json({ customers: store.customers ?? [] });
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Excel ფაილი საჭიროა" }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const incoming = parseCustomersExcel(buffer);
    let added = 0;
    const result = await updateStore((store) => {
      const merged = mergeCustomerImport(store.customers ?? [], incoming);
      store.customers = merged.merged;
      added = merged.added;
    });
    return NextResponse.json({
      ok: true,
      imported: incoming.length,
      added,
      total: result.customers?.length ?? 0,
    });
  }

  const body = (await req.json()) as {
    action?: string;
    customerId?: string;
    driverEmployeeId?: string;
    driverEmployeeName?: string;
  };

  if (body.action === "updateDriver") {
    if (!body.customerId) {
      return NextResponse.json({ error: "customerId საჭიროა" }, { status: 400 });
    }
    await updateStore((store) => {
      const list = store.customers ?? [];
      const idx = list.findIndex((c) => c.id === body.customerId);
      if (idx < 0) throw new Error("კლიენტი ვერ მოიძებნა");
      list[idx] = {
        ...list[idx],
        driverEmployeeId: body.driverEmployeeId,
        driverEmployeeName: body.driverEmployeeName,
      };
      store.customers = list;
      return store;
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "უცნობი მოქმედება" }, { status: 400 });
}
