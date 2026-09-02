"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Branch, BranchCash, PaymentMethod, Transaction } from "@/lib/types";
import { BRANCHES, PAYMENT_METHODS } from "@/lib/dashboard-data";
import { OPERATIONAL_DATA_FROM } from "@/lib/report-config";
import {
  calcBalances,
  currentMonth,
  emptyBranchCash,
  formatDate,
  formatMoney,
  isCreditOrder,
  isCreditOrderActive,
  monthStartEnd,
  paymentMethodLabel,
  txPaymentMethod,
} from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500";
const smallInputCls = "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-violet-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const selectCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-violet-500";
const btnCls = "rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-medium hover:bg-violet-600 disabled:opacity-40";
const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-violet-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

const BANK_METHOD: PaymentMethod = "ანგარიშზე ჩარიცხვა";
const OPENING_DATE_LABEL = "1 სექტემბერი 2026";

type LedgerRow = {
  id: string;
  date: string;
  branch: Branch;
  label: string;
  amount: number;
  paymentMethod: PaymentMethod;
};

type Props = {
  transactions: Transaction[];
  branchCash: Record<Branch, BranchCash>;
  onUpdatePayment: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
  onRefresh: () => void | Promise<void>;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function parseNum(raw: string): number {
  if (!raw.trim()) return 0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function txLedgerLabel(t: Transaction): string {
  if (t.type === "sale") return t.buyerName ? `${t.buyerName} · ${t.productName}` : t.productName;
  if (t.type === "deposit") {
    const kind =
      t.kind === "founder" ? "დამფუძნებლის შენატანი" : t.kind === "loan_repayment" ? "ვალის დაბრუნება" : "შენატანი";
    return t.comment || kind;
  }
  return `${t.category}${t.comment ? ` · ${t.comment}` : ""}`;
}

function sumOpeningBank(branchCash: Record<Branch, BranchCash>, branchFilter: Branch | "ყველა") {
  const branches = branchFilter === "ყველა" ? BRANCHES : [branchFilter];
  return branches.reduce((s, b) => s + (branchCash[b]?.bank ?? 0), 0);
}

export default function BankAccountPanel({
  transactions,
  branchCash,
  onUpdatePayment,
  onRefresh,
}: Props) {
  const [viewMonth, setViewMonth] = useState(currentMonth());
  const [branchFilter, setBranchFilter] = useState<Branch | "ყველა">("ყველა");
  const [search, setSearch] = useState("");
  const [openings, setOpenings] = useState<Record<Branch, BranchCash>>(() => ({ ...branchCash }));
  const [savingBranch, setSavingBranch] = useState<Branch | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setOpenings({ ...branchCash });
  }, [branchCash]);

  const { from, to } = useMemo(() => monthStartEnd(viewMonth), [viewMonth]);

  const openingBank = useMemo(
    () => sumOpeningBank(branchCash, branchFilter),
    [branchCash, branchFilter]
  );

  const currentBalance = useMemo(
    () => calcBalances(transactions, branchFilter, branchCash).bank,
    [transactions, branchFilter, branchCash]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out: LedgerRow[] = [];

    for (const t of transactions) {
      if (txPaymentMethod(t) !== BANK_METHOD) continue;
      if (t.type === "expense") continue;
      const date = t.date.slice(0, 10);
      if (date < OPERATIONAL_DATA_FROM || date < from || date > to) continue;
      if (branchFilter !== "ყველა" && t.branch !== branchFilter) continue;
      if (t.type === "sale" && isCreditOrder(t) && isCreditOrderActive(t)) continue;

      out.push({
        id: t.id,
        date,
        branch: t.branch,
        label: txLedgerLabel(t),
        amount: t.amount,
        paymentMethod: txPaymentMethod(t),
      });
    }

    return out
      .filter((r) => {
        if (!q) return true;
        return [r.label, r.branch, r.date].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [transactions, from, to, branchFilter, search]);

  const periodIncoming = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  const saveOpening = useCallback(
    async (branch: Branch) => {
      setSavingBranch(branch);
      setErr("");
      setMsg("");
      const o = openings[branch] ?? emptyBranchCash();
      try {
        const res = await fetch("/api/inventory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "setCash",
            branch,
            cash: o.cash,
            card: o.card,
            bank: o.bank,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "შეცდომა");
        setMsg(`${branch} — საწყისი ნაშთი შენახულია ✓`);
        await onRefresh();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "შეცდომა");
      } finally {
        setSavingBranch(null);
      }
    },
    [openings, onRefresh]
  );

  function updateOpening(branch: Branch, field: keyof BranchCash, raw: string) {
    setOpenings((prev) => ({
      ...prev,
      [branch]: {
        ...(prev[branch] ?? emptyBranchCash()),
        [field]: parseNum(raw),
      },
    }));
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-1 font-semibold text-zinc-200">საწყისი ნაშთები — {OPENING_DATE_LABEL}</h2>
        <p className="mb-4 text-xs text-zinc-500">
          დააყენეთ თითო ფილიალის ქეში, ბარათი და საბანკო ანგარიშის ნაშთი {OPERATIONAL_DATA_FROM}-ის მდგომარეობით.
          ამ თარიღის შემდეგ მოძრაობა ცალკე ითვლება.
        </p>

        <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                <th className="pb-2 pl-3 pr-3 pt-2">ფილიალი</th>
                <th className="pb-2 pr-3">ქეში</th>
                <th className="pb-2 pr-3">ბარათი</th>
                <th className="pb-2 pr-3">საბანკო ანგარიში</th>
                <th className="pb-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {BRANCHES.map((branch) => {
                const o = openings[branch] ?? emptyBranchCash();
                return (
                  <tr key={branch} className="border-b border-zinc-800/50">
                    <td className="py-2 pl-3 pr-3 font-medium">{branch}</td>
                    <td className="py-2 pr-3">
                      <input
                        className={smallInputCls}
                        type="number"
                        step={0.01}
                        value={o.cash}
                        onChange={(e) => updateOpening(branch, "cash", e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className={smallInputCls}
                        type="number"
                        step={0.01}
                        value={o.card}
                        onChange={(e) => updateOpening(branch, "card", e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        className={smallInputCls}
                        type="number"
                        step={0.01}
                        value={o.bank}
                        onChange={(e) => updateOpening(branch, "bank", e.target.value)}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className={btnCls}
                        disabled={savingBranch === branch}
                        onClick={() => saveOpening(branch)}
                      >
                        შენახვა
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-700 font-semibold">
                <td className="py-3 pl-3 pr-3 text-zinc-400">ჯამი</td>
                <td className="py-3 pr-3 text-emerald-400">
                  {formatMoney(BRANCHES.reduce((s, b) => s + (openings[b]?.cash ?? 0), 0))}
                </td>
                <td className="py-3 pr-3 text-sky-400">
                  {formatMoney(BRANCHES.reduce((s, b) => s + (openings[b]?.card ?? 0), 0))}
                </td>
                <td className="py-3 pr-3 text-violet-400">
                  {formatMoney(BRANCHES.reduce((s, b) => s + (openings[b]?.bank ?? 0), 0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        {msg && <p className="mt-2 text-sm text-emerald-400">{msg}</p>}
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </div>

      <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-violet-200">საბანკო ანგარიში — შემოსული გადმორიცხვები</h2>
            <p className="mt-1 text-xs text-zinc-500">
              მხოლოდ ანგარიშზე შემოსული თანხები ({OPERATIONAL_DATA_FROM}-დან)
            </p>
          </div>
          <Field label="თვე">
            <input
              type="month"
              className={`${inputCls} w-auto`}
              value={viewMonth}
              min="2026-09"
              onChange={(e) => setViewMonth(e.target.value)}
            />
          </Field>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={tabBtn(branchFilter === "ყველა")}
            onClick={() => setBranchFilter("ყველა")}
          >
            ყველა
          </button>
          {BRANCHES.map((b) => (
            <button key={b} type="button" className={tabBtn(branchFilter === b)} onClick={() => setBranchFilter(b)}>
              {b}
            </button>
          ))}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-violet-900/50 bg-violet-950/30 p-3">
            <p className="text-xs text-zinc-500">საწყისი ანგარიში ({OPENING_DATE_LABEL})</p>
            <p className="mt-1 text-lg font-semibold text-violet-300">{formatMoney(openingBank)}</p>
          </div>
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
            <p className="text-xs text-zinc-500">შემოსული (თვე)</p>
            <p className="mt-1 text-lg font-semibold text-emerald-400">+{formatMoney(periodIncoming)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">მიმდინარე ნაშთი ანგარიშზე</p>
            <p className="mt-1 text-lg font-semibold text-violet-200">{formatMoney(currentBalance)}</p>
            <p className="mt-1 text-[10px] text-zinc-600">საწყისი + შემოსული − გასული</p>
          </div>
        </div>

        <div className="mb-4">
          <Field label="ძებნა">
            <input
              className={inputCls}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="აღწერა, ფილიალი..."
            />
          </Field>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ თვეში ანგარიშზე შემოსული თანხა არ არის.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pl-3 pr-3 pt-2">თარიღი</th>
                  <th className="pb-2 pr-3">ფილიალი</th>
                  <th className="pb-2 pr-3">აღწერა</th>
                  <th className="pb-2 pr-3">გადახდა</th>
                  <th className="pb-2 pr-3 text-right">თანხა</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-800/50">
                    <td className="py-2 pl-3 pr-3 whitespace-nowrap text-zinc-400">{formatDate(row.date)}</td>
                    <td className="py-2 pr-3">{row.branch}</td>
                    <td className="py-2 pr-3 text-zinc-300">{row.label}</td>
                    <td className="py-2 pr-3">
                      <select
                        className={selectCls}
                        value={row.paymentMethod}
                        onChange={async (e) => {
                          await onUpdatePayment(row.id, e.target.value as PaymentMethod);
                          await onRefresh();
                        }}
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {paymentMethodLabel(m)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-3 text-right font-medium text-emerald-400">
                      +{formatMoney(row.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 font-semibold">
                  <td colSpan={4} className="py-3 pl-3 pr-3 text-right text-zinc-400">
                    შემოსული თვეში
                  </td>
                  <td className="py-3 pr-3 text-right text-emerald-400">+{formatMoney(periodIncoming)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-600">
          გასული თანხები (ხარჯები) აქ არ ჩანს — მხოლოდ ანგარიშზე შემოსული გაყიდვები და შენატანები.
        </p>
      </div>
    </section>
  );
}
