"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Branch, BranchCash, PaymentMethod, Transaction } from "@/lib/types";
import { BRANCHES, PAYMENT_METHODS } from "@/lib/dashboard-data";
import {
  buildAccountLedgerRows,
  ledgerTotals,
  nonCashOpening,
  type LedgerChannel,
} from "@/lib/bank-ledger";
import { OPERATIONAL_DATA_FROM } from "@/lib/report-config";
import {
  calcBalances,
  currentMonth,
  emptyBranchCash,
  formatDate,
  formatMoney,
  monthStartEnd,
  paymentMethodLabel,
} from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-violet-500";
const smallInputCls = "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-violet-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const selectCls = "rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-violet-500";
const btnCls = "rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-medium hover:bg-violet-600 disabled:opacity-40";
const tabBtn = (on: boolean) =>
  `rounded-lg px-3 py-1.5 text-sm ${on ? "bg-violet-800 text-white" : "text-zinc-500 hover:text-zinc-300"}`;

const OPENING_DATE_LABEL = "1 სექტემბერი 2026";

type Props = {
  transactions: Transaction[];
  branchCash: Record<Branch, BranchCash>;
  bankLedgerReviewed: Record<string, string>;
  onUpdatePayment: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
  onToggleReview: (id: string, reviewed: boolean) => Promise<boolean>;
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

function channelLabel(ch: LedgerChannel) {
  return ch === "bank" ? "ანგარიში" : "ბარათი";
}

export default function BankAccountPanel({
  transactions,
  branchCash,
  bankLedgerReviewed,
  onUpdatePayment,
  onToggleReview,
  onRefresh,
}: Props) {
  const [viewMonth, setViewMonth] = useState(currentMonth());
  const [branchFilter, setBranchFilter] = useState<Branch | "ყველა">("ყველა");
  const [channelFilter, setChannelFilter] = useState<"all" | LedgerChannel>("all");
  const [search, setSearch] = useState("");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [reviewBusy, setReviewBusy] = useState<string | null>(null);
  const [openings, setOpenings] = useState<Record<Branch, BranchCash>>(() => ({ ...branchCash }));
  const [savingBranch, setSavingBranch] = useState<Branch | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    setOpenings({ ...branchCash });
  }, [branchCash]);

  const { from, to } = useMemo(() => monthStartEnd(viewMonth), [viewMonth]);

  const opening = useMemo(
    () => nonCashOpening(branchCash, branchFilter, BRANCHES),
    [branchCash, branchFilter]
  );

  const currentNonCash = useMemo(() => {
    const bal = calcBalances(transactions, branchFilter, branchCash);
    return { card: bal.card, bank: bal.bank, total: bal.card + bal.bank };
  }, [transactions, branchFilter, branchCash]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buildAccountLedgerRows(transactions, {
      from,
      to,
      branch: branchFilter,
      channelFilter,
      operationalFrom: OPERATIONAL_DATA_FROM,
    }).filter((r) => {
      if (onlyUnreviewed && (r.direction !== "in" || bankLedgerReviewed[r.id])) return false;
      if (!q) return true;
      return [r.label, r.comment, r.depositorName, r.branch, r.date].join(" ").toLowerCase().includes(q);
    });
  }, [transactions, from, to, branchFilter, channelFilter, search, onlyUnreviewed, bankLedgerReviewed]);

  const unreviewedIncoming = useMemo(() => {
    return buildAccountLedgerRows(transactions, {
      from,
      to,
      branch: branchFilter,
      channelFilter,
      operationalFrom: OPERATIONAL_DATA_FROM,
    }).filter((r) => r.direction === "in" && !bankLedgerReviewed[r.id]).length;
  }, [transactions, from, to, branchFilter, channelFilter, bankLedgerReviewed]);

  const totals = useMemo(() => ledgerTotals(rows), [rows]);

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

  async function toggleReview(id: string, currentlyReviewed: boolean) {
    setReviewBusy(id);
    try {
      await onToggleReview(id, !currentlyReviewed);
      await onRefresh();
    } finally {
      setReviewBusy(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-1 font-semibold text-zinc-200">საწყისი ნაშთები — {OPENING_DATE_LABEL}</h2>
        <p className="mb-4 text-xs text-zinc-500">
          ქეში, ბარათი და საბანკო ანგარიში ფილიალების მიხედვით · {OPERATIONAL_DATA_FROM}-ის მდგომარეობით
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
          </table>
        </div>
        {msg && <p className="mt-2 text-sm text-emerald-400">{msg}</p>}
        {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      </div>

      <div className="rounded-xl border border-violet-900/40 bg-violet-950/20 p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold text-violet-200">ბარათი და საბანკო ანგარიში — მოძრაობა</h2>
            <p className="mt-1 text-xs text-zinc-500">
              დღიური რეპორტიდან შემოსული (ბარათი/ანგარიში), ვალდებულებების გასტუმრება და ხარჯები
            </p>
            {unreviewedIncoming > 0 && (
              <p className="mt-1 text-xs font-medium text-amber-300">
                {unreviewedIncoming} უნახული ჩარიცხვა ამ ფილტრით
              </p>
            )}
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
          <button type="button" className={tabBtn(branchFilter === "ყველა")} onClick={() => setBranchFilter("ყველა")}>
            ყველა ფილიალი
          </button>
          {BRANCHES.map((b) => (
            <button key={b} type="button" className={tabBtn(branchFilter === b)} onClick={() => setBranchFilter(b)}>
              {b}
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" className={tabBtn(channelFilter === "all")} onClick={() => setChannelFilter("all")}>
            ბარათი + ანგარიში
          </button>
          <button type="button" className={tabBtn(channelFilter === "card")} onClick={() => setChannelFilter("card")}>
            მხოლოდ ბარათი
          </button>
          <button type="button" className={tabBtn(channelFilter === "bank")} onClick={() => setChannelFilter("bank")}>
            მხოლოდ ანგარიში
          </button>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-violet-900/50 bg-violet-950/30 p-3">
            <p className="text-xs text-zinc-500">საწყისი (ბარათი+ანგარიში)</p>
            <p className="mt-1 text-lg font-semibold text-violet-300">{formatMoney(opening.total)}</p>
            <p className="mt-1 text-[10px] text-zinc-600">
              ბარათი {formatMoney(opening.card)} · ანგარიში {formatMoney(opening.bank)}
            </p>
          </div>
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3">
            <p className="text-xs text-zinc-500">შემოსული (თვე)</p>
            <p className="mt-1 text-lg font-semibold text-emerald-400">+{formatMoney(totals.incoming)}</p>
          </div>
          <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3">
            <p className="text-xs text-zinc-500">გასავალი (თვე)</p>
            <p className="mt-1 text-lg font-semibold text-red-400">−{formatMoney(totals.outgoing)}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
            <p className="text-xs text-zinc-500">ნეტო მოძრაობა (თვე)</p>
            <p className={`mt-1 text-lg font-semibold ${totals.net >= 0 ? "text-emerald-300" : "text-red-400"}`}>
              {totals.net >= 0 ? "+" : ""}
              {formatMoney(totals.net)}
            </p>
          </div>
          <div className="rounded-lg border border-indigo-900/40 bg-indigo-950/20 p-3">
            <p className="text-xs text-zinc-500">მიმდინარე ნაშთი</p>
            <p className="mt-1 text-lg font-semibold text-indigo-200">{formatMoney(currentNonCash.total)}</p>
            <p className="mt-1 text-[10px] text-zinc-600">
              ბარათი {formatMoney(currentNonCash.card)} · ანგარიში {formatMoney(currentNonCash.bank)}
            </p>
          </div>
        </div>

        <div className="mb-4">
          <Field label="ძებნა">
            <input
              className={inputCls}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ჩამრიცხავი, კომენტარი, კლიენტი, ხარჯი..."
            />
          </Field>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              className="rounded border-zinc-600 bg-zinc-900"
              checked={onlyUnreviewed}
              onChange={(e) => setOnlyUnreviewed(e.target.checked)}
            />
            მხოლოდ უნახული ჩარიცხვები
          </label>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">ამ თვეში ბარათი/ანგარიშის მოძრაობა არ არის.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                  <th className="pb-2 pl-3 pr-3 pt-2">თარიღი</th>
                  <th className="pb-2 pr-3">ფილიალი</th>
                  <th className="pb-2 pr-3">ტიპი</th>
                  <th className="pb-2 pr-3">ჩამრიცხავი</th>
                  <th className="pb-2 pr-3">აღწერა</th>
                  <th className="pb-2 pr-3">კომენტარი</th>
                  <th className="pb-2 pr-3">არხი</th>
                  <th className="pb-2 pr-3">გადახდა</th>
                  <th className="pb-2 pr-3 text-right">თანხა</th>
                  <th className="pb-2 pr-3 pt-2 text-center">ნანახია</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const reviewed = Boolean(bankLedgerReviewed[row.id]);
                  const isIncoming = row.direction === "in";
                  return (
                  <tr
                    key={row.id}
                    className={`border-b border-zinc-800/50 ${isIncoming && !reviewed ? "bg-amber-950/20" : ""}`}
                  >
                    <td className="py-2 pl-3 pr-3 whitespace-nowrap text-zinc-400">{formatDate(row.date)}</td>
                    <td className="py-2 pr-3">{row.branch}</td>
                    <td className={`py-2 pr-3 text-xs ${row.direction === "in" ? "text-emerald-400" : "text-red-400"}`}>
                      {row.direction === "in" ? "შემოსავალი" : "გასავალი"}
                    </td>
                    <td className="py-2 pr-3 font-medium text-sky-200" title={row.depositorName}>
                      {isIncoming ? row.depositorName || "—" : "—"}
                    </td>
                    <td className="py-2 pr-3 max-w-[160px] truncate text-zinc-300" title={row.label}>
                      {row.label}
                    </td>
                    <td className="py-2 pr-3 max-w-[200px] truncate text-zinc-500" title={row.comment}>
                      {row.comment}
                    </td>
                    <td className="py-2 pr-3 text-xs text-sky-300">{channelLabel(row.channel)}</td>
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
                    <td
                      className={`py-2 pr-3 text-right font-medium ${row.direction === "in" ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {row.direction === "in" ? "+" : "−"}
                      {formatMoney(row.amount)}
                    </td>
                    <td className="py-2 pr-3 text-center">
                      {isIncoming ? (
                        <button
                          type="button"
                          title={reviewed ? "ნანახია — მონიშვნის მოხსნა" : "მონიშნე როგორც ნანახი"}
                          disabled={reviewBusy === row.id}
                          onClick={() => void toggleReview(row.id, reviewed)}
                          className={`inline-flex h-7 w-7 items-center justify-center rounded border text-sm transition ${
                            reviewed
                              ? "border-emerald-600 bg-emerald-950/50 text-emerald-400"
                              : "border-zinc-600 bg-zinc-900 text-zinc-600 hover:border-violet-500 hover:text-violet-300"
                          }`}
                        >
                          ✓
                        </button>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-700 font-semibold">
                  <td colSpan={8} className="py-3 pl-3 pr-3 text-right text-zinc-400">
                    თვის ჯამი (შემოსული − გასავალი)
                  </td>
                  <td className={`py-3 pr-3 text-right ${totals.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {totals.net >= 0 ? "+" : ""}
                    {formatMoney(totals.net)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-zinc-600">
          ჩარიცხვებზე ჩანს ვინ გადარიცხა; ბოლოში ✓ დააჭირეთ რომ ნანახად მონიშნოთ და არაფერი გამოგრჩეთ.
        </p>
      </div>
    </section>
  );
}
