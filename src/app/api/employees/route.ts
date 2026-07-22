import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { addEmployeeAttendance, removeEmployeeAttendance, uid } from "@/lib/utils";
import { branchByToken, readStore, updateStore } from "@/lib/server-store";
import type { Branch, WorkShift } from "@/lib/types";

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
      action: "addEmployee" | "updateEmployee" | "deleteEmployee" | "checkin" | "deleteAttendance";
      pin?: string;
      token?: string;
      name?: string;
      branch?: Branch;
      dailyWage?: number;
      employeeId?: string;
      attendanceId?: string;
      date?: string;
      shift?: WorkShift;
    };

    const adminAction = body.action !== "checkin" || !body.token;
    if (adminAction) {
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

    if (body.action === "updateEmployee") {
      if (!body.employeeId) {
        return NextResponse.json({ error: "employeeId საჭიროა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        const emp = (s.employees ?? []).find((e) => e.id === body.employeeId);
        if (!emp) throw new Error("თანამშრომელი ვერ მოიძებნა");
        if (body.name?.trim()) emp.name = body.name.trim();
        if (body.branch) emp.branch = body.branch;
        if (typeof body.dailyWage === "number" && body.dailyWage >= 0) {
          emp.dailyWage = body.dailyWage;
        }
      });
      return NextResponse.json({ ok: true, employees: store.employees });
    }

    if (body.action === "deleteEmployee") {
      if (!body.employeeId) {
        return NextResponse.json({ error: "employeeId საჭიროა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        s.employees = (s.employees ?? []).filter((e) => e.id !== body.employeeId);
      });
      return NextResponse.json({
        ok: true,
        employees: store.employees,
        attendance: store.attendance,
      });
    }

    if (body.action === "checkin") {
      if (!body.employeeId) {
        return NextResponse.json({ error: "employeeId საჭიროა" }, { status: 400 });
      }

      let branch: Branch | null = null;
      if (body.token) {
        const preview = await readStore();
        branch = branchByToken(preview, body.token) ?? null;
        if (!branch) return NextResponse.json({ error: "არასწორი ლინკი" }, { status: 404 });
      }

      const today = body.date || new Date().toISOString().slice(0, 10);
      const store = await updateStore((s) => {
        const emp = (s.employees ?? []).find((e) => e.id === body.employeeId);
        if (!emp) throw new Error("თანამშრომელი ვერ მოიძებნა");
        if (branch && emp.branch !== branch) {
          throw new Error("თანამშრომელი ამ ფილიალს არ ეკუთვნის");
        }
        if (!body.token && (s.attendance ?? []).some(
          (item) =>
            item.employeeId === emp.id &&
            item.date === today &&
            (item.shift ?? "დღის") === (body.shift ?? "დღის")
        )) {
          throw new Error(`${emp.name} ამ თარიღზე ამ ცვლაში უკვე აღრიცხულია`);
        }
        addEmployeeAttendance(s, emp, today, body.shift ?? "დღის", branch ?? emp.branch);
      });
      return NextResponse.json({
        ok: true,
        attendance: store.attendance,
        employees: store.employees,
        obligations: store.obligations,
      });
    }

    if (body.action === "deleteAttendance") {
      if (!body.attendanceId) {
        return NextResponse.json({ error: "attendanceId საჭიროა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        removeEmployeeAttendance(s, body.attendanceId!);
      });
      return NextResponse.json({
        ok: true,
        attendance: store.attendance,
        obligations: store.obligations,
      });
    }

    return NextResponse.json({ error: "არასწორი action" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
