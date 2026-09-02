import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import {
  buildCustomersWorkbook,
  dedupeCustomersList,
  mergeCustomerImport,
  parseCustomersExcel,
  syncCustomersFromBranchReports,
} from "@/lib/customers";
import { updateStore, readStore } from "@/lib/server-store";
import type { Customer } from "@/lib/types";

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
    personType?: Customer["personType"];
    firstName?: string;
    lastName?: string;
    personalId?: string;
    phone?: string;
    companyName?: string;
    companyId?: string;
    contactPhone?: string;
    branch?: Customer["branch"];
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

  if (body.action === "update") {
    if (!body.customerId) {
      return NextResponse.json({ error: "customerId საჭიროა" }, { status: 400 });
    }
    const store = await updateStore((s) => {
      const list = s.customers ?? [];
      const idx = list.findIndex((c) => c.id === body.customerId);
      if (idx < 0) throw new Error("კლიენტი ვერ მოიძებნა");
      const cur = list[idx];
      list[idx] = {
        ...cur,
        personType: body.personType ?? cur.personType,
        firstName: body.firstName?.trim() ?? cur.firstName,
        lastName: body.lastName?.trim() ?? cur.lastName,
        personalId: body.personalId?.trim() ?? cur.personalId,
        phone: body.phone?.trim() ?? cur.phone,
        companyName: body.companyName?.trim() ?? cur.companyName,
        companyId: body.companyId?.trim() ?? cur.companyId,
        contactPhone: body.contactPhone?.trim() ?? cur.contactPhone,
        branch: body.branch ?? cur.branch,
        driverEmployeeId: body.driverEmployeeId ?? cur.driverEmployeeId,
        driverEmployeeName: body.driverEmployeeName ?? cur.driverEmployeeName,
      };
      s.customers = list;
    });
    return NextResponse.json({ ok: true, customers: store.customers });
  }

  if (body.action === "delete") {
    if (!body.customerId) {
      return NextResponse.json({ error: "customerId საჭიროა" }, { status: 400 });
    }
    const store = await updateStore((s) => {
      s.customers = (s.customers ?? []).filter((c) => c.id !== body.customerId);
    });
    return NextResponse.json({ ok: true, customers: store.customers });
  }

  if (body.action === "dedupe") {
    let removed = 0;
    const store = await updateStore((s) => {
      const result = dedupeCustomersList(s.customers ?? []);
      s.customers = result.customers;
      removed = result.removed;
    });
    return NextResponse.json({
      ok: true,
      removed,
      total: store.customers?.length ?? 0,
      customers: store.customers,
    });
  }

  if (body.action === "syncFromReports") {
    let added = 0;
    const store = await updateStore((s) => {
      added = syncCustomersFromBranchReports(s);
    });
    return NextResponse.json({
      ok: true,
      added,
      total: store.customers?.length ?? 0,
      customers: store.customers,
    });
  }

  return NextResponse.json({ error: "უცნობი მოქმედება" }, { status: 400 });
}
