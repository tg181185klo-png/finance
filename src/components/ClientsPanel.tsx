"use client";

import { useMemo, useRef, useState } from "react";
import type { Branch, Customer, Employee, Transaction } from "@/lib/types";
import { buildClientReport, buildClientSaleLines } from "@/lib/client-report";
import { customerDisplayName } from "@/lib/customers";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { BRANCHES } from "@/lib/dashboard-data";
import { formatDate, formatMoney } from "@/lib/utils";

const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`;
const inputCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm";
const btnCls = "rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-40";

type MainView = "registry" | "sales";
type StatusFilter = "ყველა" | "ახალი" | "ძველი";
type TypeFilter = "ყველა" | "ფიზიკური" | "იურიდიული";

type Props = {
  customers: Customer[];
  employees: Employee[];
  transactions: Transaction[];
  period: ResolvedPeriod;
  branchFilter: Branch | "ყველა";
  onRefresh: () => Promise<unknown>;
};

export default function ClientsPanel({
  customers,
  employees,
  transactions,
  period,
  branchFilter,
  onRefresh,
}: Props) {
  const [mainView, setMainView] = useState<MainView>("registry");
  const [view, setView] = useState<"summary" | "detail">("summary");
  const [branch, setBranch] = useState<Branch | "ყველა">(branchFilter);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ყველა");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ყველა");
  const [search, setSearch] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const scopedTx = useMemo(() => {
    if (branch === "ყველა") return transactions;
    return transactions.filter((t) => t.branch === branch);
  }, [transactions, branch]);

  const rows = useMemo(
    () => buildClientReport(scopedTx, period.from, period.to),
    [scopedTx, period.from, period.to]
  );

  const lines = useMemo(
    () => buildClientSaleLines(scopedTx, period.from, period.to),
    [scopedTx, period.from, period.to]
  );

  const totals = useMemo(
    () => ({
      clients: rows.length,
      orders: rows.reduce((s, r) => s + r.orders, 0),
      revenue: rows.reduce((s, r) => s + r.total, 0),
    }),
    [rows]
  );

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers
      .filter((c) => {
        if (statusFilter === "ახალი" && c.isLegacy) return false;
        if (statusFilter === "ძველი" && !c.isLegacy) return false;
        if (typeFilter === "ფიზიკური" && c.personType !== "physical") return false;
        if (typeFilter === "იურიდიული" && c.personType !== "legal") return false;
        if (!q) return true;
        const hay = [
          customerDisplayName(c),
          c.personalId,
          c.phone,
          c.companyId,
          c.contactPhone,
          c.driverEmployeeName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        if (a.isLegacy !== b.isLegacy) return a.isLegacy ? 1 : -1;
        return customerDisplayName(a).localeCompare(customerDisplayName(b), "ka");
      });
  }, [customers, statusFilter, typeFilter, search]);

  const registryStats = useMemo(
    () => ({
      total: customers.length,
      legacy: customers.filter((c) => c.isLegacy).length,
      newCount: customers.filter((c) => !c.isLegacy).length,
    }),
    [customers]
  );

  async function importFile(file: File) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/clients", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "იმპორტი ვერ მოხერხდა");
      await onRefresh();
      setMsg(`იმპორტი ✓ ფაილიდან ${data.imported} · ახალი ${data.added} · სულ რეგისტრში ${data.total}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function updateDriver(customerId: string, driverEmployeeId: string) {
    const emp = employees.find((e) => e.id === driverEmployeeId);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateDriver",
          customerId,
          driverEmployeeId,
          driverEmployeeName: emp?.name ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      await onRefresh();
      setMsg("მომზიდავი განახლდა ✓");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h2 className="mb-1 text-lg font-semibold">კლიენტები</h2>
        <p className="text-xs text-zinc-500">
          რეგისტრი ინახავს ყველა კლიენტს — Excel იმპორტიდან და თანამშრომლის რეგისტრაციიდან. დუბლიკატზე უპირატესობა აქვს პირველ რეგისტრაციას.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={tabBtn(mainView === "registry")} onClick={() => setMainView("registry")}>
            რეგისტრი ({registryStats.total})
          </button>
          <button type="button" className={tabBtn(mainView === "sales")} onClick={() => setMainView("sales")}>
            გაყიდვების რეპორტი
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      {mainView === "registry" && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs text-zinc-500">სულ რეგისტრში</p>
              <p className="mt-1 text-xl font-semibold">{registryStats.total}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs text-zinc-500">ძველი (იმპორტი)</p>
              <p className="mt-1 text-xl font-semibold text-amber-400">{registryStats.legacy}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs text-zinc-500">ახალი (თანამშრომელი)</p>
              <p className="mt-1 text-xl font-semibold text-emerald-400">{registryStats.newCount}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs text-zinc-500">ნაჩვენები</p>
              <p className="mt-1 text-xl font-semibold">{filteredCustomers.length}</p>
            </div>
          </div>

          <div className="rounded-xl border border-sky-900/40 bg-sky-950/15 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-xs text-zinc-500">ძებნა</label>
                <input className={`${inputCls} w-full`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="სახელი, ს/კ, ტელეფონი..." />
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">სტატუსი</label>
                <select className={inputCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                  <option value="ყველა">ყველა</option>
                  <option value="ახალი">ახალი</option>
                  <option value="ძველი">ძველი</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">ტიპი</label>
                <select className={inputCls} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
                  <option value="ყველა">ყველა</option>
                  <option value="ფიზიკური">ფიზიკური</option>
                  <option value="იურიდიული">იურიდიული</option>
                </select>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
              <button type="button" className={btnCls} disabled={busy} onClick={() => fileRef.current?.click()}>
                Excel ატვირთვა
              </button>
              <a href="/api/clients/export" className={`${btnCls} bg-teal-700 hover:bg-teal-600`}>
                ჩამოტვირთვა
              </a>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            {filteredCustomers.length === 0 ? (
              <p className="text-sm text-zinc-500">კლიენტები არ არის — ატვირთეთ gayidvebi.xlsx ან დაელოდეთ თანამშრომლის რეგისტრაციას</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-3">სტატუსი</th>
                    <th className="pb-2 pr-3">ტიპი</th>
                    <th className="pb-2 pr-3">დასახელება / სახელი</th>
                    <th className="pb-2 pr-3">ს/კ / პირადი №</th>
                    <th className="pb-2 pr-3">ტელეფონი</th>
                    <th className="pb-2 pr-3">საკონტაქტო</th>
                    <th className="pb-2 pr-3">მომზიდავი</th>
                    <th className="pb-2 pr-3">ფილიალი</th>
                    <th className="pb-2">რეგისტრაცია</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((c) => (
                    <tr key={c.id} className="border-b border-zinc-800/50">
                      <td className="py-2 pr-3">
                        <span className={`rounded px-2 py-0.5 text-xs ${c.isLegacy ? "bg-amber-950/50 text-amber-300" : "bg-emerald-950/50 text-emerald-300"}`}>
                          {c.isLegacy ? "ძველი" : "ახალი"}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-xs">{c.personType === "legal" ? "იურიდიული" : "ფიზიკური"}</td>
                      <td className="py-2 pr-3 font-medium">{customerDisplayName(c)}</td>
                      <td className="py-2 pr-3 text-zinc-400">{c.personType === "legal" ? c.companyId ?? "—" : c.personalId ?? "—"}</td>
                      <td className="py-2 pr-3 text-zinc-400">{c.phone || c.contactPhone || "—"}</td>
                      <td className="py-2 pr-3 text-zinc-500">
                        {c.personType === "legal"
                          ? `${c.contactFirstName ?? ""} ${c.contactLastName ?? ""}`.trim() || "—"
                          : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <select
                          className="max-w-[140px] rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                          value={c.driverEmployeeId ?? ""}
                          onChange={(e) => void updateDriver(c.id, e.target.value)}
                        >
                          <option value="">—</option>
                          {employees.filter((e) => e.active).map((emp) => (
                            <option key={emp.id} value={emp.id}>{emp.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-3">{c.branch ?? "—"}</td>
                      <td className="py-2 whitespace-nowrap text-xs text-zinc-500">{formatDate(c.registeredAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {mainView === "sales" && (
        <>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-xs text-zinc-500">
              პერიოდი: <span className="text-zinc-300">{period.label}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value as Branch | "ყველა")}>
                <option value="ყველა">ყველა ფილიალი</option>
                {BRANCHES.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <button type="button" className={tabBtn(view === "summary")} onClick={() => setView("summary")}>შეჯამება</button>
              <button type="button" className={tabBtn(view === "detail")} onClick={() => setView("detail")}>ხაზები</button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs text-zinc-500">კლიენტები</p>
              <p className="mt-1 text-xl font-semibold">{totals.clients}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs text-zinc-500">შეკვეთები</p>
              <p className="mt-1 text-xl font-semibold">{totals.orders}</p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs text-zinc-500">ჯამური გაყიდვა</p>
              <p className="mt-1 text-xl font-semibold text-emerald-400">{formatMoney(totals.revenue)}</p>
            </div>
          </div>

          {view === "summary" && (
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              {rows.length === 0 ? (
                <p className="text-sm text-zinc-500">ამ პერიოდში კლიენტის მონაცემები არ არის</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 pr-3">კლიენტი</th>
                      <th className="pb-2 pr-3">ტელეფონი</th>
                      <th className="pb-2 pr-3">ფილიალი</th>
                      <th className="pb-2 pr-3">თანამშრომელი</th>
                      <th className="pb-2 pr-3">წყარო</th>
                      <th className="pb-2 pr-3 text-right">შეკვეთა</th>
                      <th className="pb-2 pr-3 text-right">ჯამი</th>
                      <th className="pb-2">ბოლო</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-3 font-medium">{r.name}</td>
                        <td className="py-2 pr-3 text-zinc-400">{r.phone || "—"}</td>
                        <td className="py-2 pr-3">{r.branch}</td>
                        <td className="py-2 pr-3 text-violet-300">{r.employee}</td>
                        <td className="py-2 pr-3 text-xs text-zinc-500">{r.source}</td>
                        <td className="py-2 pr-3 text-right">{r.orders}</td>
                        <td className="py-2 pr-3 text-right font-medium text-emerald-400">{formatMoney(r.total)}</td>
                        <td className="py-2 whitespace-nowrap text-xs text-zinc-500">{formatDate(r.lastDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {view === "detail" && (
            <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              {lines.length === 0 ? (
                <p className="text-sm text-zinc-500">ამ პერიოდში ხაზები არ არის</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="pb-2 pr-3">დრო</th>
                      <th className="pb-2 pr-3">კლიენტი</th>
                      <th className="pb-2 pr-3">ფილიალი</th>
                      <th className="pb-2 pr-3">თანამშრომელი</th>
                      <th className="pb-2 pr-3">პროდუქტი</th>
                      <th className="pb-2 pr-3 text-right">ჯამი</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-3 whitespace-nowrap text-zinc-400">{formatDate(l.date)}</td>
                        <td className="py-2 pr-3">
                          {l.clientName}
                          {l.clientPhone && <span className="text-zinc-500"> · {l.clientPhone}</span>}
                        </td>
                        <td className="py-2 pr-3">{l.branch}</td>
                        <td className="py-2 pr-3 text-violet-300">{l.employee}</td>
                        <td className="py-2 pr-3">{l.productName} × {l.quantity}</td>
                        <td className="py-2 pr-3 text-right text-emerald-400">{formatMoney(l.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
