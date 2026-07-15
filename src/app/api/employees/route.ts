import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { uid } from "@/lib/utils";
import { readStore, updateStore } from "@/lib/server-store";
import type { Employee, AttendanceRecord, Branch } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    employees: store.employees ?? [],
    attendance: store.attendance ?? [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action: "addEmployee" | "toggleEmployee" | "checkin" | "checkout";
      pin?: string;
      token?: string;
      name?: string;
      branch?: Branch;
      dailyWage?: number;
      employeeId?: string;
      date?: string;
    };

    if (body.action === "addEmployee" || body.action === "toggleEmployee") {
      if (body.pin !== ADMIN_PIN) {
        return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
      }
    }

    if (body.action === "addEmployee") {
      if (!body.name || !body.branch) {
        return NextResponse.json({ error: "სახელი და ფილიალი საჭიროა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        if (!s.employees) s.employees = [];
        s.employees.push({
          id: uid(),
          name: body.name!,
          branch: body.branch!,
          dailyWage: body.dailyWage ?? 0,
          active: true,
        });
      });
      return NextResponse.json({ ok: true, employees: store.employees });
    }

    if (body.action === "toggleEmployee") {
      if (!body.employeeId) {
        return NextResponse.json({ error: "employeeId საჭიროა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        const emp = (s.employees ?? []).find((e) => e.id === body.employeeId);
        if (emp) emp.active = !emp.active;
      });
      return NextResponse.json({ ok: true, employees: store.employees });
    }

    if (body.action === "checkin") {
      if (!body.employeeId) {
        return NextResponse.json({ error: "employeeId საჭიროა" }, { status: 400 });
      }

      let branch: Branch | null = null;
      if (body.token) {
        const preview = await readStore();
        const { branchByToken } = await import("@/lib/server-store");
        branch = branchByToken(preview, body.token) ?? null;
        if (!branch) return NextResponse.json({ error: "არასწორი ლინკი" }, { status: 404 });
      }

      const today = body.date || new Date().toISOString().slice(0, 10);
      const store = await updateStore((s) => {
        if (!s.attendance) s.attendance = [];
        const emp = (s.employees ?? []).find((e) => e.id === body.employeeId);
        if (!emp) throw new Error("თანამშრომელი ვერ მოიძებნა");

        const already = s.attendance.find(
          (a) => a.employeeId === body.employeeId && a.date === today
        );
        if (already) throw new Error(`${emp.name} უკვე მოპწიჩკულია დღეს`);

        s.attendance.push({
          id: uid(),
          employeeId: emp.id,
          employeeName: emp.name,
          branch: branch ?? emp.branch,
          date: today,
          checkedInAt: new Date().toISOString(),
        });
      });
      return NextResponse.json({
        ok: true,
        attendance: store.attendance,
        employees: store.employees,
      });
    }

    return NextResponse.json({ error: "არასწორი action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
