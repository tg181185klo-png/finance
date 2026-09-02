"use client";

import { useMemo, useState } from "react";
import type { PaymentMethod, Transaction, TxRecurrence } from "@/lib/types";
import {
  filterFlowDetailTransactions,
  flowDetailTitle,
  flowDrillShowBranch,
  type FlowBranchScope,
  type FlowDetailKind,
} from "@/lib/flow-detail";
import TransactionTable from "@/components/TransactionTable";

export type FlowDrillState = {
  kind: FlowDetailKind;
  scope: FlowBranchScope;
  from: string;
  to: string;
  rangeLabel: string;
  recurrence?: TxRecurrence;
};

function drillMatches(a: FlowDrillState | null, b: FlowDrillState) {
  if (!a) return false;
  return (
    a.kind === b.kind &&
    a.scope === b.scope &&
    a.from === b.from &&
    a.to === b.to &&
    a.recurrence === b.recurrence
  );
}

export function useFlowDrill() {
  const [drill, setDrill] = useState<FlowDrillState | null>(null);

  function toggle(next: FlowDrillState) {
    setDrill((prev) => (drillMatches(prev, next) ? null : next));
  }

  function close() {
    setDrill(null);
  }

  function isActive(kind: FlowDetailKind, scope: FlowBranchScope, from: string, to: string, recurrence?: TxRecurrence) {
    return drillMatches(drill, { kind, scope, from, to, rangeLabel: "", recurrence });
  }

  return { drill, toggle, close, isActive };
}

export function ClickableFlowStat({
  label,
  value,
  accent,
  large,
  hint,
  onClick,
  active,
  variant = "card",
  className,
}: {
  label: string;
  value: string;
  accent?: string;
  large?: boolean;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
  variant?: "inline" | "card";
  className?: string;
}) {
  if (variant === "inline") {
    const Tag = onClick ? "button" : "div";
    return (
      <Tag
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={`text-left ${onClick ? "cursor-pointer rounded-lg px-1 -mx-1 hover:bg-zinc-800/50" : ""} ${
          active ? "ring-1 ring-emerald-600/40 rounded-lg" : ""
        } ${className ?? ""}`}
      >
        <p className="text-xs text-zinc-500">{label}</p>
        <p className={`text-base font-semibold ${accent ?? "text-zinc-100"}`}>{value}</p>
        {onClick && !active && <p className="text-[10px] text-zinc-600">დაჭერით სია</p>}
      </Tag>
    );
  }

  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`rounded-xl border bg-zinc-900/60 p-4 text-left transition ${
        onClick ? "cursor-pointer hover:border-emerald-700/50 hover:bg-zinc-900/80" : "border-zinc-800"
      } ${active ? "border-emerald-600 ring-1 ring-emerald-600/40" : "border-zinc-800"} ${className ?? ""}`}
    >
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 font-semibold ${large ? "text-2xl" : "text-lg"} ${accent ?? "text-zinc-100"}`}>{value}</p>
      {hint && <p className="mt-1 text-[10px] text-zinc-600">{hint}</p>}
      {onClick && !active && <p className="mt-1 text-[10px] text-zinc-600">დაჭერით ტრანზაქციების სია</p>}
    </Tag>
  );
}

type FlowDrillPanelProps = {
  drill: FlowDrillState | null;
  transactions: Transaction[];
  onClose: () => void;
  onDelete: (id: string) => Promise<boolean>;
  onUpdatePayment: (id: string, paymentMethod: PaymentMethod) => Promise<boolean>;
  className?: string;
};

export function FlowDrillPanel({
  drill,
  transactions,
  onClose,
  onDelete,
  onUpdatePayment,
  className,
}: FlowDrillPanelProps) {
  const rows = useMemo(() => {
    if (!drill) return [];
    return filterFlowDetailTransactions(transactions, drill.kind, drill.scope, drill.from, drill.to, {
      recurrence: drill.recurrence,
    });
  }, [drill, transactions]);

  if (!drill) return null;

  return (
    <div className={`rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-5 ${className ?? ""}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-emerald-200">
          {flowDetailTitle(drill.kind, drill.scope, drill.rangeLabel)}
          <span className="ml-2 text-sm font-normal text-zinc-500">({rows.length})</span>
        </h3>
        <button
          type="button"
          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-600"
          onClick={onClose}
        >
          დახურვა
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">ამ პერიოდში ტრანზაქცია არ არის.</p>
      ) : (
        <TransactionTable
          rows={rows}
          showBranch={flowDrillShowBranch(drill.scope)}
          onDelete={onDelete}
          onUpdatePayment={onUpdatePayment}
        />
      )}
    </div>
  );
}
