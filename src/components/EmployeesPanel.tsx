"use client";

import { useRef, useState } from "react";
import type { AttendanceRecord, Branch, Employee } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import { formatMoney } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-teal-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls = "rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium hover:bg-teal-500 disabled:opacity-40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

type Props = {
  employees: Employee[];
  attendance: AttendanceRecord[];
  onRefresh: () => Promise<unknown>;
};

export default function EmployeesPanel({ employees, attendance, onRefresh }: Props) {
  const [empName, setEmpName] = useState("");
  const [empBranch, setEmpBranch] = useState<Branch>("ქუთაისი");
  const [empWage, setEmpWage] = useState("");
  const [empMonthFilter, setEmpMonthFilter] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [empWageEdits, setEmpWageEdits] = useState<Record<string, string>>({});
  const [empBranchEdits, setEmpBranchEdits] = useState<Record<string, Branch>>({});
  const [empWorkEmployee, setEmpWorkEmployee] = useState("");
  const [empWorkDate, setEmpWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!empName.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addEmployee",
          name: empName.trim(),
          branch: empBranch,
          dailyWage: parseFloat(empWage) || 0,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "შეცდომა");
      await onRefresh();
      setEmpName("");
      setEmpWage("");
      setMsg("თანამშრომელი დამატებულია ✓");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  async function saveEmployee(employee: Employee) {
    const dailyWage = parseFloat(empWageEdits[employee.id] ?? String(employee.dailyWage));
    const branch = empBranchEdits[employee.id] ?? employee.branch;
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateEmployee",
          employeeId: employee.id,
          branch,
          dailyWage: Number.isFinite(dailyWage) ? dailyWage : employee.dailyWage,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "შეცდომა");
      await onRefresh();
      setMsg("შენახულია ✓");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    }
  }

  async function deleteEmployee(employeeId: string, name: string) {
    if (!confirm(`წავშალოთ თანამშრომელი „${name}"?`)) return;
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteEmployee", employeeId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "შეცდომა");
      await onRefresh();
      setMsg("თანამშრომელი წაიშალა");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    }
  }

  async function importFile(file: File) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/employees", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "იმპორტი ვერ მოხერხდა");
      await onRefresh();
      setMsg(`იმპორტი ✓ ფაილიდან ${data.imported} · ახალი ${data.added} · სულ ${data.total}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addWorkDay(e: React.FormEvent) {
    e.preventDefault();
    if (!empWorkEmployee || !empWorkDate) return;
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "checkin",
          employeeId: empWorkEmployee,
          date: empWorkDate,
          shift: "დღის",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "შეცდომა");
      await onRefresh();
      setMsg("სამუშაო დღე დაემატა ✓");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    }
  }

  async function deleteWorkDay(attendanceId: string) {
    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteAttendance", attendanceId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "შეცდომა");
      await onRefresh();
      setMsg("სამუშაო დღე წაიშალა");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    }
  }

  const monthAttendance = attendance.filter((a) => a.date.startsWith(empMonthFilter));
  const empMap = new Map<string, { name: string; branch: Branch; records: AttendanceRecord[]; wage: number }>();
  for (const emp of employees) {
    empMap.set(emp.id, { name: emp.name, branch: emp.branch, records: [], wage: emp.dailyWage });
  }
  for (const a of monthAttendance) {
    let row = empMap.get(a.employeeId);
    if (!row) {
      row = { name: a.employeeName, branch: a.branch, records: [], wage: a.wageAmount ?? 0 };
      empMap.set(a.employeeId, row);
    }
    row.records.push(a);
  }
  const attendanceRows = [...empMap.entries()].map(([id, data]) => ({
    id,
    ...data,
    total: data.records.reduce((s, r) => s + (r.wageAmount ?? data.wage), 0),
  }));

  return (
    <section className="space-y-6">
      {err && <p className="text-sm text-red-400">{err}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      <form onSubmit={addEmployee} className="rounded-xl border border-teal-900/50 bg-teal-950/10 p-5">
        <h2 className="mb-4 text-lg font-semibold text-teal-300">ახალი თანამშრომელი</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="სახელი და გვარი">
            <input className={inputCls} value={empName} onChange={(e) => setEmpName(e.target.value)} placeholder="მაგ: ნინო მაისურაძე" required />
          </Field>
          <Field label="ფილიალი">
            <select className={inputCls} value={empBranch} onChange={(e) => setEmpBranch(e.target.value as Branch)}>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </Field>
          <Field label="დღიური ხელფასი (₾)">
            <input className={inputCls} type="number" min={0} step={0.01} value={empWage} onChange={(e) => setEmpWage(e.target.value)} placeholder="მაგ: 40" />
          </Field>
          <div className="flex items-end">
            <button type="submit" className={`${btnCls} w-full`} disabled={busy}>დამატება</button>
          </div>
        </div>
      </form>

      <div className="rounded-xl border border-zinc-800 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">თანამშრომლების სია ({employees.length})</h3>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
            <button type="button" className={btnCls} disabled={busy} onClick={() => fileRef.current?.click()}>
              Excel ატვირთვა
            </button>
            <a href="/api/employees/export" className={`${btnCls} bg-sky-700 hover:bg-sky-600`}>
              ჩამოტვირთვა
            </a>
          </div>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Excel სვეტები: სახელი და გვარი, ფილიალი, დღიური ხელფასი. ფილიალი შეგიძლიათ შეცვალოთ სიიდან და დააჭიროთ „შენახვა“.
        </p>
        {employees.length === 0 ? (
          <p className="text-sm text-zinc-500">თანამშრომლები არ არის — დაამატეთ ხელით ან ატვირთეთ Excel</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pr-3">სახელი და გვარი</th>
                  <th className="pb-2 pr-3">ფილიალი</th>
                  <th className="pb-2 pr-3">დღიური ხელფასი</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => (
                  <tr key={emp.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pr-3 font-medium">{emp.name}</td>
                    <td className="py-2 pr-3">
                      <select
                        className={`${inputCls} max-w-[140px]`}
                        value={empBranchEdits[emp.id] ?? emp.branch}
                        onChange={(e) => setEmpBranchEdits((v) => ({ ...v, [emp.id]: e.target.value as Branch }))}
                      >
                        {BRANCHES.map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className={`${inputCls} max-w-32`}
                        type="number"
                        min={0}
                        step={0.01}
                        value={empWageEdits[emp.id] ?? String(emp.dailyWage)}
                        onChange={(e) => setEmpWageEdits((values) => ({ ...values, [emp.id]: e.target.value }))}
                      />
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <button type="button" className="mr-3 text-xs text-emerald-400 hover:text-emerald-300" onClick={() => void saveEmployee(emp)}>
                        შენახვა
                      </button>
                      <button type="button" className="text-xs text-red-400 hover:text-red-300" onClick={() => void deleteEmployee(emp.id, emp.name)}>
                        წაშლა
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <form onSubmit={addWorkDay} className="rounded-xl border border-teal-900/50 bg-teal-950/10 p-5">
        <h3 className="mb-4 font-semibold text-teal-300">სამუშაო დღის დამატება</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="თანამშრომელი">
            <select className={inputCls} value={empWorkEmployee} onChange={(e) => setEmpWorkEmployee(e.target.value)} required>
              <option value="">აირჩიეთ...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name} · {emp.branch}</option>
              ))}
            </select>
          </Field>
          <Field label="თარიღი">
            <input className={inputCls} type="date" value={empWorkDate} onChange={(e) => setEmpWorkDate(e.target.value)} required />
          </Field>
          <div className="flex items-end">
            <button type="submit" className={`${btnCls} w-full`} disabled={!empWorkEmployee}>დამატება</button>
          </div>
        </div>
      </form>

      <div className="rounded-xl border border-zinc-800 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">სამუშაო დღეები / მოპწიჩკვა</h3>
          <Field label="თვე">
            <input type="month" className={inputCls} value={empMonthFilter} onChange={(e) => setEmpMonthFilter(e.target.value)} />
          </Field>
        </div>
        {attendanceRows.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ თვეში მონაცემები არ არის</p>
        ) : (
          <div className="space-y-4">
            {attendanceRows.map((r) => (
              <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="mb-2 flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-teal-300">{r.name} · {r.branch}</span>
                  <span className="text-sm text-teal-400">ჯამი: {formatMoney(r.total)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {r.records.sort((a, b) => a.date.localeCompare(b.date)).map((record) => (
                    <span key={record.id} className="inline-flex items-center gap-2 rounded bg-teal-900/30 px-2 py-1 text-xs text-teal-300">
                      {record.date.slice(5)} · {formatMoney(record.wageAmount ?? r.wage)}
                      <button type="button" className="text-red-400 hover:text-red-300" onClick={() => void deleteWorkDay(record.id)}>✕</button>
                    </span>
                  ))}
                  {r.records.length === 0 && <span className="text-xs text-zinc-500">არ მუშაობდა</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
