"use client";

import { useMemo, useState } from "react";
import { BRANCHES } from "@/lib/dashboard-data";
import { buildBranchCogsReport } from "@/lib/cogs-report";
import {
  calcUnitCost,
  emptyCostSettings,
  emptyDistributorPay,
  emptyMonthCostSettings,
  type CostSettings,
  type DistributorPayMode,
  type ProductCostRecipe,
} from "@/lib/product-cost";
import type { Branch, Transaction } from "@/lib/types";
import { currentMonth, formatMoney } from "@/lib/utils";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm focus:border-amber-500";
const smallInputCls =
  "w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs focus:border-amber-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls =
  "rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium hover:bg-amber-600 disabled:opacity-40";
const btnSec =
  "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-40";

type Props = {
  transactions: Transaction[];
  costSettings: CostSettings;
  onCostSettings: (next: CostSettings) => void;
};

type View = "month" | "recipes" | "report";

export default function CostingPanel({ transactions, costSettings, onCostSettings }: Props) {
  const [view, setView] = useState<View>("month");
  const [month, setMonth] = useState(currentMonth());
  const [branch, setBranch] = useState<Branch>("ქუთაისი");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [recipeQuery, setRecipeQuery] = useState("");

  const settings = costSettings?.recipes ? costSettings : emptyCostSettings();
  const monthCfg = settings.months[month] ?? emptyMonthCostSettings();
  const branchCfg = monthCfg.branches[branch] ?? { materialPerKg: 0 };
  const dist = monthCfg.distributor ?? emptyDistributorPay();

  const report = useMemo(
    () => buildBranchCogsReport(transactions, settings, branch, month),
    [transactions, settings, branch, month]
  );

  const filteredRecipes = useMemo(() => {
    const q = recipeQuery.trim().toLowerCase();
    if (!q) return settings.recipes;
    return settings.recipes.filter(
      (r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
    );
  }, [settings.recipes, recipeQuery]);

  async function api(body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch("/api/cost-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      if (data.costSettings) onCostSettings(data.costSettings);
      return data;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function syncSheet(force = false) {
    const data = await api({ action: "syncSheet", forceSheetDefaults: force });
    if (data) setMsg(`ცხრილიდან ჩაიტვირთა ${data.synced} პროდუქტი`);
  }

  async function saveBranchMonth(materialPerKg: number, electricityPrice?: number) {
    const nextMonth: typeof monthCfg = {
      ...monthCfg,
      branches: {
        ...monthCfg.branches,
        [branch]: {
          materialPerKg,
          electricityPrice: electricityPrice && electricityPrice > 0 ? electricityPrice : undefined,
        },
      },
      distributor: dist,
    };
    const data = await api({ action: "saveMonth", month, monthSettings: nextMonth });
    if (data) setMsg(`${branch} · ${month} შენახულია`);
  }

  async function saveDistributor(next: typeof dist) {
    const data = await api({
      action: "saveMonth",
      month,
      monthSettings: { ...monthCfg, distributor: next },
    });
    if (data) setMsg(`დისტრიბუტორის ანაზღაურება · ${month} შენახულია`);
  }

  async function saveRecipe(updated: ProductCostRecipe) {
    const recipes = settings.recipes.map((r) => (r.code === updated.code ? updated : r));
    const data = await api({ action: "saveRecipes", recipes });
    if (data) setMsg(`${updated.code} განახლდა`);
  }

  function updateLocalRecipe(code: string, patch: Partial<ProductCostRecipe>) {
    onCostSettings({
      ...settings,
      recipes: settings.recipes.map((r) => (r.code === code ? { ...r, ...patch } : r)),
    });
  }

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-amber-200">თვითღირებულება და ობიექტის ხარჯი</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Google Sheet-ის ფორმულებით: მასალა + ელ. ენერგია + მუშის ხელფასი. ობიექტზე თვიური 1 კგ მასალა და
              დისტრიბუტორის ფიქსი / % / ფიქსი+% .
            </p>
            {settings.syncedAt && (
              <p className="mt-1 text-[10px] text-zinc-600">
                ბოლო სინქი: {new Date(settings.syncedAt).toLocaleString("ka-GE")} · {settings.recipes.length}{" "}
                პროდუქტი
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnCls} disabled={busy} onClick={() => void syncSheet(false)}>
              ცხრილიდან წამოღება
            </button>
            <button type="button" className={btnSec} disabled={busy} onClick={() => void syncSheet(true)}>
              სრული განახლება Sheet-იდან
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ["month", "თვე / ობიექტი"],
              ["recipes", "პროდუქტის რეცეპტები"],
              ["report", "ობიექტის ანგარიში"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`rounded-lg px-3 py-1.5 text-sm ${
                view === id ? "bg-amber-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              }`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <div>
            <label className={labelCls}>თვე</label>
            <input
              type="month"
              className={`${inputCls} w-auto`}
              value={month}
              min="2026-09"
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>ობიექტი</label>
            <select className={inputCls} value={branch} onChange={(e) => setBranch(e.target.value as Branch)}>
              {BRANCHES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {msg && <p className="mt-3 text-sm text-emerald-400">{msg}</p>}
        {err && <p className="mt-3 text-sm text-red-400">{err}</p>}
      </div>

      {view === "month" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="font-medium text-zinc-200">1 კგ მასალა · {branch}</h3>
            <p className="mt-1 text-xs text-zinc-500">იმ თვეში წამოღებული მასალის ღირებულება (ლარი / კგ)</p>
            <BranchMonthForm
              key={`${month}-${branch}-${branchCfg.materialPerKg}-${branchCfg.electricityPrice ?? ""}`}
              materialPerKg={branchCfg.materialPerKg || 0}
              electricityPrice={branchCfg.electricityPrice}
              busy={busy}
              onSave={(mat, elec) => void saveBranchMonth(mat, elec)}
            />
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="font-medium text-zinc-200">დისტრიბუტორის ანაზღაურება · {month}</h3>
            <p className="mt-1 text-xs text-zinc-500">
              ფიქსირებული, პროცენტი, ან ორივე ერთად. ანგარიშში აისახება დისტრიბუციის ობიექტზე.
            </p>
            <DistributorForm
              key={`${month}-${dist.mode}-${dist.fixedAmount}-${dist.percent}`}
              value={dist}
              busy={busy}
              onSave={(v) => void saveDistributor(v)}
            />
          </div>
        </div>
      )}

      {view === "recipes" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-medium text-zinc-200">პროდუქტის რეცეპტები</h3>
              <p className="mt-1 text-xs text-zinc-500">
                შეცვალე მასალა (ლ/კგ), ელ. ფასი და მუშის ხელფასი ცალზე — თვითღირებულება თავიდან დაიანგარიშება
              </p>
            </div>
            <input
              className={`${inputCls} max-w-xs`}
              placeholder="ძებნა კოდი / სახელი"
              value={recipeQuery}
              onChange={(e) => setRecipeQuery(e.target.value)}
            />
          </div>

          {!settings.recipes.length ? (
            <p className="text-sm text-zinc-500">ჯერ ატვირთე ცხრილი ღილაკით „ცხრილიდან წამოღება“.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500">
                    <th className="px-2 py-2">კოდი</th>
                    <th className="px-2 py-2">დასახელება</th>
                    <th className="px-2 py-2 text-right">წონა</th>
                    <th className="px-2 py-2 text-right">1კგ მასალა</th>
                    <th className="px-2 py-2 text-right">ელ. ფასი</th>
                    <th className="px-2 py-2 text-right">ხელფასი/ცალი</th>
                    <th className="px-2 py-2 text-right">თვითღირ.</th>
                    <th className="px-2 py-2 text-right">გასაყიდი</th>
                    <th className="px-2 py-2 text-right">მოგება</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRecipes.map((r) => {
                    const unit = calcUnitCost(r, {
                      materialPerKg: branchCfg.materialPerKg || r.materialPerKg,
                      elecPrice: branchCfg.electricityPrice || r.elecPrice,
                      distPercent: dist.percent,
                    });
                    return (
                      <tr key={r.code} className="border-b border-zinc-800/60">
                        <td className="whitespace-nowrap px-2 py-1.5 text-zinc-400">{r.code}</td>
                        <td className="max-w-[180px] px-2 py-1.5">{r.name}</td>
                        <td className="px-2 py-1.5 text-right text-zinc-400">{r.weightKg}</td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            className={smallInputCls}
                            type="number"
                            step="0.01"
                            value={r.materialPerKg}
                            onChange={(e) =>
                              updateLocalRecipe(r.code, { materialPerKg: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            className={smallInputCls}
                            type="number"
                            step="0.01"
                            value={r.elecPrice}
                            onChange={(e) =>
                              updateLocalRecipe(r.code, { elecPrice: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            className={smallInputCls}
                            type="number"
                            step="0.01"
                            value={r.wagePerUnit}
                            onChange={(e) =>
                              updateLocalRecipe(r.code, { wagePerUnit: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium text-amber-200">
                          {formatMoney(unit.totalCost)}
                        </td>
                        <td className="px-2 py-1.5 text-right">{formatMoney(r.sellPrice)}</td>
                        <td className="px-2 py-1.5 text-right text-emerald-400">
                          {formatMoney(unit.profit)} ({unit.marginPct}%)
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            className={btnSec}
                            disabled={busy}
                            onClick={() => void saveRecipe(r)}
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
          )}
        </div>
      )}

      {view === "report" && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h3 className="font-medium text-zinc-200">
            ანგარიში · {branch} · {month}
          </h3>
          <p className="mt-1 text-xs text-zinc-500">
            გაყიდული პროდუქტები × თვითღირებულება + ობიექტის ხარჯები
            {branch === "დისტრიბუცია" ? " + დისტრიბუტორის ანაზღაურება" : ""}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="შემოსავალი" value={`+${formatMoney(report.revenue)}`} tone="emerald" />
            <Stat label="თვითღირებულება (COGS)" value={formatMoney(report.cogs)} tone="amber" />
            <Stat label="ობიექტის ხარჯები" value={formatMoney(report.expenses)} tone="red" />
            <Stat
              label={branch === "დისტრიბუცია" ? "დისტრიბუტორი" : "მოგება ხარჯების შემდეგ"}
              value={
                branch === "დისტრიბუცია"
                  ? formatMoney(report.distributorPay)
                  : formatMoney(report.netAfterExpenses)
              }
              tone="violet"
            />
          </div>

          {branch === "დისტრიბუცია" && (
            <p className="mt-2 text-xs text-zinc-500">
              სუფთა მოგება (შემოსავალი − COGS − ხარჯი − დისტრიბუტორი):{" "}
              <span className="font-medium text-violet-300">{formatMoney(report.netAfterExpenses)}</span>
            </p>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500">
                  <th className="px-2 py-2">პროდუქტი</th>
                  <th className="px-2 py-2 text-right">რაოდ.</th>
                  <th className="px-2 py-2 text-right">შემოსავალი</th>
                  <th className="px-2 py-2 text-right">თვითღირ./ცალი</th>
                  <th className="px-2 py-2 text-right">COGS ჯამი</th>
                  <th className="px-2 py-2 text-right">მასალა</th>
                  <th className="px-2 py-2 text-right">ელ.</th>
                  <th className="px-2 py-2 text-right">ხელფასი</th>
                </tr>
              </thead>
              <tbody>
                {report.lines.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-6 text-center text-zinc-500">
                      ამ თვეში/ობიექტზე გაყიდვა არ არის
                    </td>
                  </tr>
                ) : (
                  report.lines.map((l) => (
                    <tr key={l.code} className="border-b border-zinc-800/60">
                      <td className="px-2 py-1.5">
                        <span className="text-zinc-400">{l.code}</span> · {l.name}
                      </td>
                      <td className="px-2 py-1.5 text-right">{l.qty}</td>
                      <td className="px-2 py-1.5 text-right text-emerald-400">{formatMoney(l.revenue)}</td>
                      <td className="px-2 py-1.5 text-right">{formatMoney(l.unitCost)}</td>
                      <td className="px-2 py-1.5 text-right font-medium text-amber-200">
                        {formatMoney(l.totalCogs)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-zinc-400">
                        {formatMoney(l.unit.materialCost)}
                      </td>
                      <td className="px-2 py-1.5 text-right text-zinc-400">{formatMoney(l.unit.elecCost)}</td>
                      <td className="px-2 py-1.5 text-right text-zinc-400">{formatMoney(l.unit.wage)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {report.lines.length > 0 && (
                <tfoot>
                  <tr className="border-t border-zinc-700 font-semibold">
                    <td className="px-2 py-2">ჯამი</td>
                    <td className="px-2 py-2 text-right">{report.soldQty}</td>
                    <td className="px-2 py-2 text-right text-emerald-400">{formatMoney(report.revenue)}</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right text-amber-200">{formatMoney(report.cogs)}</td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "red" | "violet";
}) {
  const toneCls =
    tone === "emerald"
      ? "border-emerald-900/40 text-emerald-300"
      : tone === "amber"
        ? "border-amber-900/40 text-amber-200"
        : tone === "red"
          ? "border-red-900/40 text-red-300"
          : "border-violet-900/40 text-violet-300";
  return (
    <div className={`rounded-lg border bg-zinc-950/40 p-3 ${toneCls}`}>
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function BranchMonthForm({
  materialPerKg,
  electricityPrice,
  busy,
  onSave,
}: {
  materialPerKg: number;
  electricityPrice?: number;
  busy: boolean;
  onSave: (mat: number, elec?: number) => void;
}) {
  const [mat, setMat] = useState(String(materialPerKg || ""));
  const [elec, setElec] = useState(electricityPrice != null ? String(electricityPrice) : "");
  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className={labelCls}>1 კგ მასალის ღირებულება (₾)</label>
        <input className={inputCls} type="number" step="0.01" value={mat} onChange={(e) => setMat(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>ელ. ფასი გადაფარვა (₾/კვტ·სთ, ცარიელი = რეცეპტიდან)</label>
        <input className={inputCls} type="number" step="0.01" value={elec} onChange={(e) => setElec(e.target.value)} />
      </div>
      <button
        type="button"
        className={btnCls}
        disabled={busy}
        onClick={() => onSave(parseFloat(mat) || 0, elec.trim() ? parseFloat(elec) : undefined)}
      >
        შენახვა
      </button>
    </div>
  );
}

function DistributorForm({
  value,
  busy,
  onSave,
}: {
  value: { mode: DistributorPayMode; fixedAmount: number; percent: number };
  busy: boolean;
  onSave: (v: { mode: DistributorPayMode; fixedAmount: number; percent: number }) => void;
}) {
  const [mode, setMode] = useState<DistributorPayMode>(value.mode);
  const [fixedAmount, setFixed] = useState(String(value.fixedAmount || ""));
  const [percent, setPercent] = useState(String(value.percent || ""));
  return (
    <div className="mt-4 space-y-3">
      <div>
        <label className={labelCls}>რეჟიმი</label>
        <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as DistributorPayMode)}>
          <option value="fixed">მხოლოდ ფიქსირებული</option>
          <option value="percent">მხოლოდ %</option>
          <option value="fixed_plus_percent">ფიქსირებული + %</option>
        </select>
      </div>
      {(mode === "fixed" || mode === "fixed_plus_percent") && (
        <div>
          <label className={labelCls}>ფიქსირებული ხელფასი (₾ / თვე)</label>
          <input
            className={inputCls}
            type="number"
            step="0.01"
            value={fixedAmount}
            onChange={(e) => setFixed(e.target.value)}
          />
        </div>
      )}
      {(mode === "percent" || mode === "fixed_plus_percent") && (
        <div>
          <label className={labelCls}>პროცენტი დისტრიბუციის ფასიდან (%)</label>
          <input
            className={inputCls}
            type="number"
            step="0.1"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </div>
      )}
      <button
        type="button"
        className={btnCls}
        disabled={busy}
        onClick={() =>
          onSave({
            mode,
            fixedAmount: parseFloat(fixedAmount) || 0,
            percent: parseFloat(percent) || 0,
          })
        }
      >
        შენახვა
      </button>
    </div>
  );
}
