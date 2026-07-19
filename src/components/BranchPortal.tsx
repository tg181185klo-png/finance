"use client";

import { useEffect, useMemo, useState } from "react";
import type { Employee, ExpenseCategory, ExpensePaymentMethod, PaymentMethod, WorkShift } from "@/lib/types";
import { BRANCH_EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, PAYMENT_METHODS } from "@/lib/dashboard-data";
import { formatMoney, uid } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const btnCls = "w-full rounded-lg bg-emerald-600 py-3 font-medium hover:bg-emerald-500 disabled:opacity-40";
const smallBtn = "rounded-lg border border-zinc-600 px-3 py-1.5 text-xs hover:bg-zinc-800";

type IncomeRow = {
  id: string;
  amount: string;
  paymentMethod: PaymentMethod;
};

type ExpenseRow = {
  id: string;
  category: ExpenseCategory;
  amount: string;
  paymentMethod: ExpensePaymentMethod;
  comment: string;
};

function emptyIncome(): IncomeRow {
  return { id: uid(), amount: "", paymentMethod: "ქეში (ნაღდი)" };
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
  const [incomes, setIncomes] = useState<IncomeRow[]>([emptyIncome()]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([emptyExpense()]);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [shift, setShift] = useState<WorkShift>("დღის");

  useEffect(() => {
    fetch(`/api/branch?token=${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((branchData) => {
        if (branchData.error) setErr(branchData.error);
        else {
          setBranch(branchData.branch);
          setEmployees(branchData.employees ?? []);
          if (branchData.employees?.length === 1) {
            setSelectedEmployeeId(branchData.employees[0].id);
          }
        }
      })
      .catch(() => setErr("კავშირის შეცდომა"))
      .finally(() => setLoading(false));
  }, [token]);

  const incomeTotal = useMemo(
    () => incomes.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [incomes]
  );
  const expensesTotal = useMemo(
    () => expenses.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0),
    [expenses]
  );

  function updateIncome(id: string, patch: Partial<IncomeRow>) {
    setIncomes((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const validIncomes = incomes
      .filter((r) => parseFloat(r.amount) > 0)
      .map((r) => ({
        amount: parseFloat(r.amount),
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

    if (!validIncomes.length && !validExpenses.length) {
      setErr("დაამატეთ მინიმუმ ერთი შემოსავალი ან ხარჯი");
      return;
    }
    if ((branch === "ლილო" || branch === "დიღომი") && employees.length > 0 && !selectedEmployeeId) {
      setErr("აირჩიეთ თანამშრომელი, რომელიც აგზავნის რეპორტს");
      return;
    }

    setSubmitting(true);
    setErr("");
    try {
      const selectedEmployee = employees.find((item) => item.id === selectedEmployeeId);
      const res = await fetch("/api/branch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          date,
          incomes: validIncomes,
          expenses: validExpenses,
          submittedBy: selectedEmployee?.name,
          submittedEmployeeId: selectedEmployee?.id,
          shift,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error || "შეცდომა");
        return;
      }
      setOk(true);
      setIncomes([emptyIncome()]);
      setExpenses([emptyExpense()]);
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
      <p className="mb-4 text-sm text-zinc-500">დღის შემოსავლისა და ხარჯის ანგარიში</p>

      {ok && (
        <div className="mb-4 rounded-lg border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-300">
          გაგზავნილია!
        </div>
      )}
      {err && branch && <div className="mb-4 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">{err}</div>}

      {employees.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl border border-teal-900/40 bg-zinc-900/40 p-4">
          <div>
            <label className="mb-1 block text-xs text-zinc-400">ვინ აგზავნის რეპორტს?</label>
            <select className={inputCls} value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)}>
              <option value="">აირჩიეთ...</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-400">ცვლა</label>
            <select className={inputCls} value={shift} onChange={(e) => setShift(e.target.value as WorkShift)}>
              <option value="დღის">დღის</option>
              <option value="საღამოს">საღამოს</option>
              <option value="ღამის">ღამის</option>
            </select>
          </div>
          <p className="col-span-2 text-xs text-teal-300">
            რეპორტის გაგზავნისას ამ თანამშრომელს სამუშაო დღე და ხელფასი ავტომატურად დაერიცხება.
          </p>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">თარიღი</label>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        {/* შემოსავლები */}
        <section className="rounded-xl border border-emerald-900/40 bg-zinc-900/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-emerald-400">შემოსავალი</h2>
            <button type="button" className={smallBtn} onClick={() => setIncomes((s) => [...s, emptyIncome()])}>+ დამატება</button>
          </div>
          <div className="space-y-4">
            {incomes.map((row, i) => (
              <div key={row.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="mb-2 flex justify-between text-xs text-zinc-500">#{i + 1}</div>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">შემოსავალი (₾)</label>
                    <input type="number" min={0} step={0.01} className={inputCls} value={row.amount} onChange={(e) => updateIncome(row.id, { amount: e.target.value })} placeholder="მიღებული თანხა" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-400">მიღების მეთოდი</label>
                    <select className={inputCls} value={row.paymentMethod} onChange={(e) => updateIncome(row.id, { paymentMethod: e.target.value as PaymentMethod })}>
                      {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                </div>
                {incomes.length > 1 && (
                  <button type="button" className="mt-2 text-xs text-red-400" onClick={() => setIncomes((s) => s.filter((x) => x.id !== row.id))}>წაშლა</button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-right text-sm font-medium text-emerald-400">სულ შემოსავალი: {formatMoney(incomeTotal)}</p>
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
        ნეტო: <span className={incomeTotal - expensesTotal >= 0 ? "text-emerald-400" : "text-red-400"}>{formatMoney(incomeTotal - expensesTotal)}</span>
      </p>
    </div>
  );
}
