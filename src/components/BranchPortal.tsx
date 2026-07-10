"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExpenseCategory, ExpensePaymentMethod, PaymentMethod, Product } from "@/lib/types";
import { BRANCH_EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, PAYMENT_METHODS } from "@/lib/dashboard-data";
import { formatMoney, uid } from "@/lib/utils";
import type { BranchInventory } from "@/lib/types";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const btnCls = "w-full rounded-lg bg-emerald-600 py-3 font-medium hover:bg-emerald-500 disabled:opacity-40";
const smallBtn = "rounded-lg border border-zinc-600 px-3 py-1.5 text-xs hover:bg-zinc-800";

type SaleRow = {
  id: string;
  search: string;
  product: Product | null;
  quantity: number;
  unitPrice: number;
  paymentMethod: PaymentMethod;
  open: boolean;
};

type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  amount: string;
  paymentMethod: ExpensePaymentMethod;
  comment: string;
};

function emptySale(): SaleRow {
  return { id: uid(), search: "", product: null, quantity: 1, unitPrice: 0, paymentMethod: "ქეში (ნაღდი)", open: false };
}

function emptyExpense(): ExpenseRow {
  return { id: uid(), category: "სხვა", amount: "", paymentMethod: "ქეში (ნაღდი)", comment: "" };
}

export default function BranchPortal({ token }: { token: string }) {
  const [branch, setBranch] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<BranchInventory>({});
  const [sales, setSales] = useState<SaleRow[]>([emptySale()]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([emptyExpense()]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/branch?token=${token}`, { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/products", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([branchData, prodData]) => {
        if (branchData.error) setErr(branchData.error);
        else {
          setBranch(branchData.branch);
          setInventory(branchData.inventory ?? {});
        }
        setProducts(prodData.products ?? []);
      })
      .catch(() => setErr("კავშირის შეცდომა"))
      .finally(() => setLoading(false));
  }, [token]);

  const salesTotal = useMemo(
    () => sales.reduce((s, r) => s + (r.product ? r.quantity * r.unitPrice : 0), 0),
    [sales]
  );
  const expensesTotal = useMemo(
    () => expenses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [expenses]
  );

  function updateSale(id: string, patch: Partial<SaleRow>) {
    setSales((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function pickProduct(rowId: string, p: Product) {
    updateSale(rowId, {
      product: p,
      search: `${p.code} — ${p.name}`,
      unitPrice: p.price,
      quantity: 1,
      open: false,
    });
  }

  function filterProducts(q: string) {
    const s = q.toLowerCase().trim();
    if (!s) return products.slice(0, 6);
    return products.filter((p) => p.code.toLowerCase().includes(s) || p.name.toLowerCase().includes(s)).slice(0, 6);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const validSales = sales
      .filter((r) => r.product && r.quantity > 0 && r.unitPrice > 0)
      .map((r) => ({
        productCode: r.product!.code,
        productName: r.product!.name,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        amount: r.quantity * r.unitPrice,
        paymentMethod: r.paymentMethod,
      }));

    const validExpenses = expenses
      .filter((r) => parseFloat(r.amount) > 0)
      .map((r) => ({
        category: r.category,
        amount: parseFloat(r.amount),
        paymentMethod: r.paymentMethod,
        comment: r.comment.trim() || r.category,
      }));

    if (!validSales.length && !validExpenses.length) {
      setErr("დაამატეთ მინიმუმ ერთი გაყიდვა ან ხარჯი");
      return;
    }

    setSubmitting(true);
    setErr("");
    try {
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, date, sales: validSales, expenses: validExpenses }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "შეცდომა");
        return;
      }
      setOk(true);
      setSales([emptySale()]);
      setExpenses([emptyExpense()]);
      fetch(`/api/branch?token=${token}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((branchData) => {
          if (!branchData.error) setInventory(branchData.inventory ?? {});
        })
        .catch(() => {});
    } catch {
      setErr("კავშირის შეცდომა");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">იტვირთება...</div>;
  if (err && !branch) return <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-red-400">{err}</div>;

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-zinc-950 px-4 py-6 text-zinc-100">
      <h1 className="text-xl font-bold">{branch}</h1>
      <p className="mb-4 text-sm text-zinc-500">დღის ანგარიში · {products.length} პროდუქტი</p>

      {ok && (
        <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          გაგზავნილია!
        </div>
      )}
      {err && branch && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>}

      <form onSubmit={submit} className="space-y-6">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">თარიღი</label>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        {/* გაყიდვები */}
        <section className="rounded-xl border border-emerald-900/40 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-emerald-400">გაყიდვები</h2>
            <button type="button" className={smallBtn} onClick={() => setSales((s) => [...s, emptySale()])}>+ დამატება</button>
          </div>
          <div className="space-y-4">
            {sales.map((row, i) => (
              <div key={row.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="mb-2 flex justify-between text-xs text-zinc-500">#{i + 1}</div>
                <div className="relative mb-2">
                  <label className="mb-1 block text-xs text-zinc-400">პროდუქტი</label>
                  <input
                    className={inputCls}
                    value={row.search}
                    onChange={(e) => updateSale(row.id, { search: e.target.value, product: null, open: true })}
                    placeholder="კოდი ან სახელი..."
                    autoComplete="off"
                  />
                  {row.open && row.search && !row.product && (
                    <ul className="absolute z-10 mt-1 max-h-40 w-full overflow-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl">
                      {filterProducts(row.search).map((p) => (
                        <li key={p.code}>
                          <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-800" onClick={() => pickProduct(row.id, p)}>
                            <span className="text-emerald-400">{p.code}</span> {p.name}
                            <span className="float-right text-zinc-500">
                              {formatMoney(p.price)} · მარაგი: {inventory[p.code] ?? 0}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">რაოდენობა</label>
                    <input type="number" min={1} className={inputCls} value={row.quantity} onChange={(e) => updateSale(row.id, { quantity: +e.target.value })} />
                    {row.product && (
                      <p className={`mt-1 text-xs ${(inventory[row.product.code] ?? 0) < row.quantity ? "text-amber-400" : "text-zinc-500"}`}>
                        მარაგი: {inventory[row.product.code] ?? 0}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">ფასი (₾)</label>
                    <input type="number" min={0} step={0.01} className={inputCls} value={row.unitPrice} onChange={(e) => updateSale(row.id, { unitPrice: +e.target.value })} />
                  </div>
                </div>
                <div className="mb-2">
                  <label className="mb-1 block text-xs text-zinc-400">გადახდა</label>
                  <select className={inputCls} value={row.paymentMethod} onChange={(e) => updateSale(row.id, { paymentMethod: e.target.value as PaymentMethod })}>
                    {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                {row.product && (
                  <p className="text-right text-sm text-emerald-400">ჯამი: {formatMoney(row.quantity * row.unitPrice)}</p>
                )}
                {sales.length > 1 && (
                  <button type="button" className="mt-2 text-xs text-red-400" onClick={() => setSales((s) => s.filter((x) => x.id !== row.id))}>წაშლა</button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-right text-sm font-medium text-emerald-400">სულ გაყიდვა: {formatMoney(salesTotal)}</p>
        </section>

        {/* ხარჯები */}
        <section className="rounded-xl border border-red-900/40 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-red-400">ხარჯები</h2>
            <button type="button" className={smallBtn} onClick={() => setExpenses((s) => [...s, emptyExpense()])}>+ დამატება</button>
          </div>
          <div className="space-y-4">
            {expenses.map((row, i) => (
              <div key={row.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="mb-2 text-xs text-zinc-500">#{i + 1}</div>
                <div className="mb-2">
                  <label className="mb-1 block text-xs text-zinc-400">კატეგორია</label>
                  <select className={inputCls} value={row.category} onChange={(e) => setExpenses((s) => s.map((x) => x.id === row.id ? { ...x, category: e.target.value as ExpenseCategory } : x))}>
                    {BRANCH_EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">თანხა (₾)</label>
                    <input type="number" min={0} step={0.01} className={inputCls} value={row.amount} onChange={(e) => setExpenses((s) => s.map((x) => x.id === row.id ? { ...x, amount: e.target.value } : x))} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">გადახდა</label>
                    <select className={inputCls} value={row.paymentMethod} onChange={(e) => setExpenses((s) => s.map((x) => x.id === row.id ? { ...x, paymentMethod: e.target.value as ExpensePaymentMethod } : x))}>
                      {EXPENSE_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mb-2">
                  <label className="mb-1 block text-xs text-zinc-400">კომენტარი</label>
                  <input className={inputCls} value={row.comment} onChange={(e) => setExpenses((s) => s.map((x) => x.id === row.id ? { ...x, comment: e.target.value } : x))} placeholder="რა ხარჯი იყო..." />
                </div>
                {expenses.length > 1 && (
                  <button type="button" className="text-xs text-red-400" onClick={() => setExpenses((s) => s.filter((x) => x.id !== row.id))}>წაშლა</button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-right text-sm font-medium text-red-400">სულ ხარჯი: {formatMoney(expensesTotal)}</p>
        </section>

        <button type="submit" className={btnCls} disabled={submitting}>{submitting ? "იგზავნება..." : "გაგზავნა"}</button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        ნეტო: <span className={salesTotal - expensesTotal >= 0 ? "text-emerald-400" : "text-red-400"}>{formatMoney(salesTotal - expensesTotal)}</span>
      </p>
    </div>
  );
}
