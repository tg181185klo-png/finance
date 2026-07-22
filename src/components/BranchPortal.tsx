"use client";

import { useEffect, useMemo, useState } from "react";
import type { Employee, ExpenseCategory, ExpensePaymentMethod, PaymentMethod, WorkShift } from "@/lib/types";
import { BRANCH_EXPENSE_CATEGORIES, EXPENSE_PAYMENT_METHODS, PAYMENT_METHODS } from "@/lib/dashboard-data";
import { formatMoney, uid, wageForShift } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const btnCls = "w-full rounded-lg bg-emerald-600 py-3 font-medium hover:bg-emerald-500 disabled:opacity-40";
const smallBtn = "rounded-lg border border-zinc-600 px-3 py-1.5 text-xs hover:bg-zinc-800";

const ALL_SHIFTS: WorkShift[] = ["დღის", "საღამოს", "ღამის"];

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

type WorkSelection = Record<string, WorkShift[]>;

function emptyIncome(): IncomeRow {
  return { id: uid(), amount: "", paymentMethod: "ქეში (ნაღდი)" };
}

function emptyExpense(): ExpenseRow {
  return { id: uid(), category: "სხვა", amount: "", paymentMethod: "ქეში (ნაღდი)", comment: "" };
}

function shiftWageHint(dailyWage: number) {
  return `დღე/საღამო: ${formatMoney(wageForShift(dailyWage, "დღის"))} · ღამე: ${formatMoney(wageForShift(dailyWage, "ღამის"))}`;
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
  const [reporterShifts, setReporterShifts] = useState<WorkShift[]>(["დღის"]);
  const [workSelection, setWorkSelection] = useState<WorkSelection>({});

  useEffect(() => {
    fetch(`/api/branch?token=${token}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((branchData) => {
        if (branchData.error) setErr(branchData.error);
        else {
          setBranch(branchData.branch);
          const list: Employee[] = branchData.employees ?? [];
          setEmployees(list);
          if (list.length === 1) {
            setSelectedEmployeeId(list[0].id);
          }
          const initial: WorkSelection = {};
          for (const emp of list) {
            initial[emp.id] = [];
          }
          setWorkSelection(initial);
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
  const selectedWorkers = useMemo(
    () =>
      employees
        .filter((emp) => (workSelection[emp.id] ?? []).length > 0)
        .map((emp) => ({
          employeeId: emp.id,
          shifts: workSelection[emp.id] ?? [],
          name: emp.name,
          wage: (workSelection[emp.id] ?? []).reduce(
            (sum, shift) => sum + wageForShift(emp.dailyWage, shift),
            0
          ),
        })),
    [employees, workSelection]
  );
  const isLiloOrDigomi = branch === "ლილო" || branch === "დიღომი";
  const isKutaisi = branch === "ქუთაისი";
  const selectedReporter = employees.find((item) => item.id === selectedEmployeeId);
  const reporterWageTotal = selectedReporter
    ? reporterShifts.reduce((sum, shift) => sum + wageForShift(selectedReporter.dailyWage, shift), 0)
    : 0;

  function updateIncome(id: string, patch: Partial<IncomeRow>) {
    setIncomes((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleWorkerShift(employeeId: string, shift: WorkShift, checked: boolean) {
    setWorkSelection((prev) => {
      const current = prev[employeeId] ?? [];
      const next = checked
        ? [...new Set([...current, shift])]
        : current.filter((item) => item !== shift);
      return { ...prev, [employeeId]: next };
    });
  }

  function toggleReporterShift(shift: WorkShift, checked: boolean) {
    setReporterShifts((prev) => {
      if (checked) return [...new Set([...prev, shift])];
      return prev.filter((item) => item !== shift);
    });
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

    if (!validIncomes.length && !validExpenses.length && !(isKutaisi && selectedWorkers.length > 0)) {
      setErr(isKutaisi
        ? "დაამატეთ შემოსავალი, ხარჯი ან მონიშნეთ ვინ იმუშავა"
        : "დაამატეთ მინიმუმ ერთი შემოსავალი ან ხარჯი");
      return;
    }
    if (isLiloOrDigomi && !selectedEmployeeId) {
      setErr("აირჩიეთ თანამშრომელი, რომელიც აგზავნის რეპორტს");
      return;
    }
    if (isLiloOrDigomi && reporterShifts.length === 0) {
      setErr("აირჩიეთ მინიმუმ ერთი ცვლა");
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
          shifts: isLiloOrDigomi ? reporterShifts : undefined,
          shift: isLiloOrDigomi ? reporterShifts[0] : undefined,
          ...(isKutaisi
            ? {
                workedEmployees: selectedWorkers.map((w) => ({
                  employeeId: w.employeeId,
                  shifts: w.shifts,
                })),
              }
            : {}),
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
      setReporterShifts(["დღის"]);
      setWorkSelection((prev) => {
        const next: WorkSelection = {};
        for (const id of Object.keys(prev)) next[id] = [];
        return next;
      });
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

      {isLiloOrDigomi && (
        <div className="mb-4 space-y-3 rounded-xl border border-teal-900/40 bg-zinc-900/40 p-4">
          {employees.length === 0 ? (
            <p className="text-sm text-amber-300">
              ამ ფილიალში თანამშრომელი ჯერ არ არის დამატებული. დაამატეთ თანამშრომლის სახელი და გვარი ადმინ პანელიდან.
            </p>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">გამომგზავნის სახელი და გვარი</label>
                <select className={inputCls} value={selectedEmployeeId} onChange={(e) => setSelectedEmployeeId(e.target.value)} required>
                  <option value="">აირჩიეთ თანამშრომელი...</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-zinc-400">რომელ ცვლებში იმუშავა?</label>
                <div className="grid grid-cols-3 gap-2">
                  {ALL_SHIFTS.map((item) => (
                    <label key={item} className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/50 px-2 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={reporterShifts.includes(item)}
                        onChange={(e) => toggleReporterShift(item, e.target.checked)}
                      />
                      {item}
                    </label>
                  ))}
                </div>
                {selectedReporter && (
                  <p className="mt-2 text-xs text-zinc-500">{shiftWageHint(selectedReporter.dailyWage)}</p>
                )}
                {reporterShifts.length > 0 && selectedReporter && (
                  <p className="mt-1 text-xs text-teal-300">ამ დღის ხელფასი: {formatMoney(reporterWageTotal)}</p>
                )}
              </div>
              <p className="text-xs text-teal-300">
                დღის და საღამოს ცვლა = დღიური ხელფასი; ღამის ცვლა = დღიური + ნახევარი. შეიძლება სამივე ცვლა ერთ დღეს.
              </p>
            </>
          )}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <div>
          <label className="mb-1 block text-xs text-zinc-400">თარიღი</label>
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>

        {isKutaisi && (
          <section className="rounded-xl border border-teal-900/40 bg-zinc-900/40 p-4">
            <h2 className="mb-1 font-semibold text-teal-300">თანამშრომლების აღრიცხვა</h2>
            <p className="mb-3 text-xs text-zinc-400">
              მონიშნეთ ვინ და რომელ ცვლებში იმუშავა. დღე/საღამო = დღიური; ღამე = დღიური + ნახევარი. შეიძლება სამივე ცვლა ერთ დღეს.
            </p>
            {employees.length === 0 ? (
              <p className="text-sm text-amber-300">
                ქუთაისის თანამშრომლები ჯერ არ არის დამატებული. დაამატეთ ადმინ პანელიდან (თანამშრომლები → ფილიალი: ქუთაისი).
              </p>
            ) : (
              <div className="space-y-2">
                {employees.map((emp) => {
                  const shifts = workSelection[emp.id] ?? [];
                  const wage = shifts.reduce((sum, shift) => sum + wageForShift(emp.dailyWage, shift), 0);
                  return (
                    <div key={emp.id} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                      <div className="mb-2">
                        <span className="block font-medium">{emp.name}</span>
                        <span className="text-xs text-zinc-500">{shiftWageHint(emp.dailyWage)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {ALL_SHIFTS.map((item) => (
                          <label key={item} className="flex items-center gap-2 rounded-lg border border-zinc-800 px-2 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={shifts.includes(item)}
                              onChange={(e) => toggleWorkerShift(emp.id, item, e.target.checked)}
                            />
                            {item}
                          </label>
                        ))}
                      </div>
                      {shifts.length > 0 && (
                        <p className="mt-2 text-right text-xs text-teal-300">ამ დღის ხელფასი: {formatMoney(wage)}</p>
                      )}
                    </div>
                  );
                })}
                {selectedWorkers.length > 0 && (
                  <p className="pt-1 text-right text-sm text-teal-300">
                    მონიშნული: {selectedWorkers.length} · {formatMoney(selectedWorkers.reduce((s, w) => s + w.wage, 0))}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

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

        <button
          type="submit"
          className={btnCls}
          disabled={submitting || (isLiloOrDigomi && employees.length === 0)}
        >
          {submitting ? "იგზავნება..." : "გაგზავნა"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        ნეტო: <span className={incomeTotal - expensesTotal >= 0 ? "text-emerald-400" : "text-red-400"}>{formatMoney(incomeTotal - expensesTotal)}</span>
      </p>
    </div>
  );
}
