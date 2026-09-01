"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Branch,
  BranchClientSale,
  BranchDailyReport,
  BranchSaleLine,
  CustomerPersonType,
  Employee,
  PaymentMethod,
  Product,
} from "@/lib/types";
import { branchSaleBuyerName } from "@/lib/customers";
import { BRANCHES } from "@/lib/dashboard-data";
import type { ResolvedPeriod } from "@/lib/period-filter";
import { formatMoney } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm";
const btnCls = "rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium hover:bg-teal-500 disabled:opacity-40";
const smallBtn = "rounded-lg border border-zinc-600 px-3 py-1.5 text-xs hover:bg-zinc-800";

type SaleRow = {
  reportId: string;
  clientSaleId: string;
  date: string;
  branch: Branch;
  submittedBy: string;
  sale: BranchClientSale;
  total: number;
};

const PAYMENT_OPTIONS: PaymentMethod[] = ["ქეში (ნაღდი)", "ბარათი", "ანგარიშზე ჩარიცხვა"];

type Props = {
  branchReports: BranchDailyReport[];
  employees: Employee[];
  period: ResolvedPeriod;
  branchFilter: Branch | "ყველა";
  onRefresh: () => Promise<unknown>;
};

function saleBuyerLabel(sale: BranchClientSale) {
  return branchSaleBuyerName(sale);
}

function emptyProduct(): BranchSaleLine {
  return {
    productCode: "",
    productName: "",
    quantity: 1,
    unitPrice: 0,
    amount: 0,
    paymentMethod: "ქეში (ნაღდი)",
  };
}

export default function EmployeeSalesPanel({
  branchReports,
  employees,
  period,
  branchFilter,
  onRefresh,
}: Props) {
  const [branch, setBranch] = useState<Branch | "ყველა">(branchFilter);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [draft, setDraft] = useState<BranchClientSale | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setProducts((d.products ?? []) as Product[]))
      .catch(() => {});
  }, []);

  const rows = useMemo(() => {
    const out: SaleRow[] = [];
    for (const report of branchReports) {
      if (report.date < period.from || report.date > period.to) continue;
      if (branch !== "ყველა" && report.branch !== branch) continue;
      for (let i = 0; i < (report.clientSales ?? []).length; i++) {
        const sale = report.clientSales![i];
        const clientSaleId = sale.clientSaleId ?? `${report.id}-sale-${i}`;
        const total = sale.products.reduce((s, p) => s + (p.amount || 0), 0);
        out.push({
          reportId: report.id,
          clientSaleId,
          date: report.date,
          branch: report.branch,
          submittedBy: report.submittedBy ?? "—",
          sale: { ...sale, clientSaleId },
          total,
        });
      }
    }
    const q = search.trim().toLowerCase();
    return out
      .filter((r) => {
        if (!q) return true;
        const hay = [
          saleBuyerLabel(r.sale),
          r.sale.phone,
          r.sale.companyId,
          r.submittedBy,
          r.branch,
          r.sale.comment,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [branchReports, period.from, period.to, branch, search]);

  const totals = useMemo(
    () => ({
      count: rows.length,
      revenue: rows.reduce((s, r) => s + r.total, 0),
    }),
    [rows]
  );

  function openEdit(row: SaleRow) {
    setEditing(row);
    setDraft(JSON.parse(JSON.stringify(row.sale)) as BranchClientSale);
    setErr("");
    setMsg("");
  }

  function closeEdit() {
    setEditing(null);
    setDraft(null);
  }

  function updateProduct(idx: number, patch: Partial<BranchSaleLine>) {
    if (!draft) return;
    const products = draft.products.map((p, i) => {
      if (i !== idx) return p;
      const next = { ...p, ...patch };
      const qty = Number(next.quantity) || 0;
      const price = Number(next.unitPrice) || 0;
      return { ...next, quantity: qty, unitPrice: price, amount: qty * price };
    });
    setDraft({ ...draft, products });
  }

  function addProductLine() {
    if (!draft) return;
    setDraft({ ...draft, products: [...draft.products, emptyProduct()] });
  }

  function removeProductLine(idx: number) {
    if (!draft) return;
    setDraft({ ...draft, products: draft.products.filter((_, i) => i !== idx) });
  }

  function pickProduct(idx: number, code: string) {
    const p = products.find((x) => x.code === code);
    if (!p) return;
    updateProduct(idx, {
      productCode: p.code,
      productName: p.name,
      unitPrice: p.price,
      amount: (draft?.products[idx]?.quantity ?? 1) * p.price,
    });
  }

  async function saveEdit() {
    if (!editing || !draft) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/branch-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateClientSale",
          reportId: editing.reportId,
          clientSaleId: editing.clientSaleId,
          sale: draft,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      await onRefresh();
      setMsg("გაყიდვა განახლდა ✓ რეპორტები სინქრონშია");
      closeEdit();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSale(row: SaleRow) {
    if (!confirm(`წავშალოთ გაყიდვა „${saleBuyerLabel(row.sale)}"?`)) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/branch-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deleteClientSale",
          reportId: row.reportId,
          clientSaleId: row.clientSaleId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      await onRefresh();
      setMsg("გაყიდვა წაიშალა ✓ რეპორტები სინქრონშია");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-900/40 bg-violet-950/15 p-4">
        <p className="text-sm text-zinc-300">
          თანამშრომლების მიერ შეყვანილი გაყიდვები. რედაქტირება ავტომატურად აახლებს შემოსავალს და ხარჯს თვის რეპორტებში.
        </p>
        <p className="mt-1 text-xs text-zinc-500">პერიოდი: {period.label}</p>
      </div>

      {err && <p className="text-sm text-red-400">{err}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
          <p className="text-xs text-zinc-500">გაყიდვები</p>
          <p className="mt-1 text-xl font-semibold">{totals.count}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:col-span-2">
          <p className="text-xs text-zinc-500">ჯამური შემოსავალი</p>
          <p className="mt-1 text-xl font-semibold text-emerald-400">{formatMoney(totals.revenue)}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value as Branch | "ყველა")}>
          <option value="ყველა">ყველა ფილიალი</option>
          {BRANCHES.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <input
          className={`${inputCls} min-w-[200px] flex-1`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ძებნა: კლიენტი, ტელეფონი, თანამშრომელი..."
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ პერიოდში თანამშრომლის გაყიდვები არ არის</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="pb-2 pr-3">თარიღი</th>
                <th className="pb-2 pr-3">ფილიალი</th>
                <th className="pb-2 pr-3">კლიენტი</th>
                <th className="pb-2 pr-3">პროდუქტები</th>
                <th className="pb-2 pr-3">თანამშრომელი</th>
                <th className="pb-2 pr-3 text-right">ჯამი</th>
                <th className="pb-2">მოქმედება</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.reportId}-${r.clientSaleId}`} className="border-b border-zinc-800/50">
                  <td className="py-2 pr-3 whitespace-nowrap">{r.date}</td>
                  <td className="py-2 pr-3">{r.branch}</td>
                  <td className="py-2 pr-3">
                    <p className="font-medium">{saleBuyerLabel(r.sale)}</p>
                    <p className="text-xs text-zinc-500">
                      {r.sale.personType === "legal" ? r.sale.companyId : r.sale.phone}
                      {r.sale.comment ? ` · ${r.sale.comment}` : ""}
                    </p>
                  </td>
                  <td className="py-2 pr-3 text-xs text-zinc-400">
                    {r.sale.products.map((p) => `${p.productName} ×${p.quantity}`).join(", ")}
                  </td>
                  <td className="py-2 pr-3 text-violet-300">{r.submittedBy}</td>
                  <td className="py-2 pr-3 text-right font-medium text-emerald-400">{formatMoney(r.total)}</td>
                  <td className="py-2 whitespace-nowrap">
                    <button type="button" className={`${smallBtn} mr-2`} onClick={() => openEdit(r)}>რედაქტირება</button>
                    <button type="button" className={`${smallBtn} text-red-400`} onClick={() => void deleteSale(r)} disabled={busy}>წაშლა</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">გაყიდვის რედაქტირება</h3>
              <button type="button" className="text-zinc-500 hover:text-zinc-300" onClick={closeEdit}>✕</button>
            </div>
            <p className="mb-4 text-xs text-zinc-500">
              {editing.date} · {editing.branch} · {editing.submittedBy}
            </p>

            <div className="mb-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm ${draft.personType === "physical" ? "border-emerald-500 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}
                onClick={() => setDraft({ ...draft, personType: "physical" })}
              >
                ფიზიკური
              </button>
              <button
                type="button"
                className={`rounded-lg border px-3 py-2 text-sm ${draft.personType === "legal" ? "border-emerald-500 text-emerald-300" : "border-zinc-700 text-zinc-400"}`}
                onClick={() => setDraft({ ...draft, personType: "legal" as CustomerPersonType })}
              >
                იურიდიული
              </button>
            </div>

            {draft.personType === "physical" ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} value={draft.customerFirstName} onChange={(e) => setDraft({ ...draft, customerFirstName: e.target.value })} placeholder="სახელი" />
                  <input className={inputCls} value={draft.customerLastName} onChange={(e) => setDraft({ ...draft, customerLastName: e.target.value })} placeholder="გვარი" />
                </div>
                <input className={inputCls} value={draft.personalId ?? ""} onChange={(e) => setDraft({ ...draft, personalId: e.target.value })} placeholder="პირადი №" />
                <input className={inputCls} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="ტელეფონი" />
              </div>
            ) : (
              <div className="space-y-2">
                <input className={inputCls} value={draft.companyName ?? ""} onChange={(e) => setDraft({ ...draft, companyName: e.target.value })} placeholder="კომპანიის დასახელება" />
                <input className={inputCls} value={draft.companyId ?? ""} onChange={(e) => setDraft({ ...draft, companyId: e.target.value })} placeholder="ს/კ" />
                <input className={inputCls} value={draft.contactPhone ?? draft.phone ?? ""} onChange={(e) => setDraft({ ...draft, contactPhone: e.target.value, phone: e.target.value })} placeholder="ტელეფონი" />
              </div>
            )}

            <textarea
              className={`${inputCls} mt-3 min-h-[3rem]`}
              value={draft.comment ?? ""}
              onChange={(e) => setDraft({ ...draft, comment: e.target.value })}
              placeholder="კომენტარი"
              rows={2}
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-zinc-500">მომზიდავი</label>
                <select
                  className={inputCls}
                  value={draft.driverEmployeeId ?? ""}
                  onChange={(e) => {
                    const emp = employees.find((x) => x.id === e.target.value);
                    setDraft({ ...draft, driverEmployeeId: e.target.value, driverEmployeeName: emp?.name });
                  }}
                >
                  <option value="">—</option>
                  {employees.filter((e) => e.active).map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">გადახდა</label>
                <select
                  className={inputCls}
                  value={draft.paymentMethod}
                  onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value as PaymentMethod })}
                >
                  {PAYMENT_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <p className="text-xs font-medium uppercase text-zinc-500">პროდუქტები</p>
              {draft.products.map((p, idx) => (
                <div key={idx} className="rounded-lg border border-zinc-800 p-3">
                  <div className="mb-2 flex justify-between">
                    <span className="text-xs text-zinc-500">#{idx + 1}</span>
                    <button type="button" className="text-xs text-red-400" onClick={() => removeProductLine(idx)}>წაშლა</button>
                  </div>
                  <select
                    className={`${inputCls} mb-2`}
                    value={p.productCode}
                    onChange={(e) => pickProduct(idx, e.target.value)}
                  >
                    <option value="">აირჩიეთ პროდუქტი...</option>
                    {products.map((prod) => (
                      <option key={prod.code} value={prod.code}>{prod.code} — {prod.name}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-3 gap-2">
                    <input type="number" min={0} step={1} className={inputCls} value={p.quantity} onChange={(e) => updateProduct(idx, { quantity: parseFloat(e.target.value) || 0 })} placeholder="რაოდ." />
                    <input type="number" min={0} step={0.01} className={inputCls} value={p.unitPrice} onChange={(e) => updateProduct(idx, { unitPrice: parseFloat(e.target.value) || 0 })} placeholder="ფასი" />
                    <input className={inputCls} value={formatMoney(p.amount)} readOnly />
                  </div>
                </div>
              ))}
              <button type="button" className={smallBtn} onClick={addProductLine}>+ პროდუქტი</button>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className={smallBtn} onClick={closeEdit}>გაუქმება</button>
              <button type="button" className={btnCls} disabled={busy} onClick={() => void saveEdit()}>
                {busy ? "ინახება..." : "შენახვა"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
