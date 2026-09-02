"use client";

import type { Branch, BranchCash, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import { OPENING_BALANCE_DATE, buildBranchBalanceRows, sumOpening } from "@/lib/opening-balances";
import { calcBalances, emptyBranchCash, formatMoney } from "@/lib/utils";

type Props = {
  transactions: Transaction[];
  branchCash: Record<Branch, BranchCash>;
  compact?: boolean;
  /** ჩაწერა გვერდი: ბარათი + ანგარიში ერთ ხაზად */
  mergeCardBank?: boolean;
  highlightBranch?: Branch;
};

function MoneyRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <p className="text-sm">
      {label}: <span className={accent}>{value}</span>
    </p>
  );
}

export default function OpeningBalancesSummary({
  transactions,
  branchCash,
  compact,
  mergeCardBank,
  highlightBranch,
}: Props) {
  const rows = buildBranchBalanceRows(transactions, branchCash);
  const companyOpening = sumOpening(branchCash);
  const companyCurrent = calcBalances(transactions, "ყველა", branchCash);

  if (compact) {
    const shown = highlightBranch ? rows.filter((r) => r.branch === highlightBranch) : rows;
    const companyBal = calcBalances(transactions, "ყველა", branchCash);
    const accountLabel = mergeCardBank ? "ანგარიში" : "ბარათი";
    const accountOf = (c: { card: number; bank: number }) =>
      mergeCardBank ? c.card + c.bank : c.card;

    return (
      <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/15 p-4">
        <p className="mb-2 text-xs text-emerald-300/80">მიმდინარე ნაშთები</p>
        {mergeCardBank && (
          <p className="mb-2 text-[10px] text-zinc-500">ბარათით გადახდილი თანხაც ანგარიშზე ირიცხება</p>
        )}
        <div className={`grid gap-2 ${shown.length === 1 ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
          {shown.map((r) => (
            <div key={r.branch} className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-3 py-2 text-xs">
              <p className="mb-1 font-semibold text-zinc-200">{r.branch}</p>
              <p className="text-emerald-400">ქეში: {formatMoney(r.current.cash)}</p>
              {mergeCardBank ? (
                <p className="text-violet-400">
                  {accountLabel}: {formatMoney(accountOf(r.current))}
                </p>
              ) : (
                <>
                  <p className="text-sky-400">ბარათი: {formatMoney(r.current.card)}</p>
                  <p className="text-violet-400">ანგარიში: {formatMoney(r.current.bank)}</p>
                </>
              )}
            </div>
          ))}
        </div>
        {!highlightBranch && (
          <div className="mt-3 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-xs">
            <p className="mb-1 font-semibold text-emerald-300">კომპანია (ჯამი)</p>
            <p className="text-emerald-400">ქეში: {formatMoney(companyBal.cash)}</p>
            {mergeCardBank ? (
              <p className="text-violet-400">
                {accountLabel}: {formatMoney(accountOf(companyBal))}
              </p>
            ) : (
              <>
                <p className="text-sky-400">ბარათი: {formatMoney(companyBal.card)}</p>
                <p className="text-violet-400">ანგარიში: {formatMoney(companyBal.bank)}</p>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div>
        <h3 className="mb-1 text-sm font-semibold text-sky-300">საწყისი ნაშთები — {OPENING_BALANCE_DATE}</h3>
        <p className="text-xs text-zinc-500">ფილიალების მიხედვით · რედაქტირება: საბანკო ანგარიში ან ჩაწერა ტაბი</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <div
            key={r.branch}
            className={`rounded-xl border p-4 ${
              highlightBranch === r.branch
                ? "border-sky-700 bg-sky-950/30"
                : "border-zinc-800 bg-zinc-900/50"
            }`}
          >
            <h4 className="mb-3 font-bold text-zinc-100">{r.branch}</h4>
            <div className="mb-3 space-y-1 border-b border-zinc-800 pb-3">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">საწყისი</p>
              <MoneyRow label="💵 ქეში" value={formatMoney(r.opening.cash)} accent="text-emerald-400" />
              <MoneyRow label="💳 ბარათი" value={formatMoney(r.opening.card)} accent="text-sky-400" />
              <MoneyRow label="🏦 ანგარიში" value={formatMoney(r.opening.bank)} accent="text-violet-400" />
            </div>
            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wide text-zinc-500">მიმდინარე</p>
              <MoneyRow label="💵 ქეში" value={formatMoney(r.current.cash)} accent="text-emerald-300" />
              <MoneyRow label="💳 ბარათი" value={formatMoney(r.current.card)} accent="text-sky-300" />
              <MoneyRow label="🏦 ანგარიში" value={formatMoney(r.current.bank)} accent="text-violet-300" />
            </div>
          </div>
        ))}

        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-4 sm:col-span-2 lg:col-span-1">
          <h4 className="mb-3 font-bold text-emerald-300">კომპანია</h4>
          <div className="mb-3 space-y-1 border-b border-emerald-900/40 pb-3">
            <p className="text-[10px] uppercase tracking-wide text-emerald-600/80">საწყისი</p>
            <MoneyRow label="💵 ქეში" value={formatMoney(companyOpening.cash)} accent="text-emerald-400" />
            <MoneyRow label="💳 ბარათი" value={formatMoney(companyOpening.card)} accent="text-sky-400" />
            <MoneyRow label="🏦 ანგარიში" value={formatMoney(companyOpening.bank)} accent="text-violet-400" />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-emerald-600/80">მიმდინარე</p>
            <MoneyRow label="💵 ქეში" value={formatMoney(companyCurrent.cash)} accent="text-emerald-300" />
            <MoneyRow label="💳 ბარათი" value={formatMoney(companyCurrent.card)} accent="text-sky-300" />
            <MoneyRow label="🏦 ანგარიში" value={formatMoney(companyCurrent.bank)} accent="text-violet-300" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function CurrentBalanceStrip({
  transactions,
  branchCash,
  branch,
}: {
  transactions: Transaction[];
  branchCash: Record<Branch, BranchCash>;
  branch?: Branch;
}) {
  const bal = calcBalances(transactions, branch ?? "ყველა", branchCash);
  const title = branch ?? "კომპანია";
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-emerald-900/30 bg-emerald-950/10 px-3 py-2 text-xs text-zinc-400">
      <span className="text-emerald-300/90">{title} — მიმდინარე:</span>
      <span className="text-emerald-400">ქეში {formatMoney(bal.cash)}</span>
      <span className="text-sky-400">ბარათი {formatMoney(bal.card)}</span>
      <span className="text-violet-400">ანგარიში {formatMoney(bal.bank)}</span>
    </div>
  );
}

export function OpeningBalanceStrip({
  branchCash,
  branch,
}: {
  branchCash: Record<Branch, BranchCash>;
  branch?: Branch;
}) {
  const opening = branch ? (branchCash[branch] ?? emptyBranchCash()) : sumOpening(branchCash);
  const title = branch ?? "კომპანია";
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-sky-900/30 bg-sky-950/10 px-3 py-2 text-xs text-zinc-400">
      <span className="text-sky-300/90">{title} — საწყისი ({OPENING_BALANCE_DATE}):</span>
      <span className="text-emerald-400">ქეში {formatMoney(opening.cash)}</span>
      <span className="text-sky-400">ბარათი {formatMoney(opening.card)}</span>
      <span className="text-violet-400">ანგარიში {formatMoney(opening.bank)}</span>
    </div>
  );
}
