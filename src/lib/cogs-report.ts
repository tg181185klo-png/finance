import type { Branch, Transaction } from "./types";
import { BRANCHES } from "./constants";
import {
  calcDistributorPay,
  calcUnitCost,
  emptyMonthCostSettings,
  type CostSettings,
  type ProductCostRecipe,
  type UnitCostBreakdown,
} from "./product-cost";
import { monthStartEnd } from "./utils";

export type CogsProductLine = {
  code: string;
  name: string;
  qty: number;
  revenue: number;
  unitCost: number;
  totalCogs: number;
  unit: UnitCostBreakdown;
};

export type BranchCogsReport = {
  branch: Branch;
  month: string;
  materialPerKg: number;
  lines: CogsProductLine[];
  soldQty: number;
  revenue: number;
  cogs: number;
  expenses: number;
  distributorPay: number;
  grossProfit: number;
  netAfterExpenses: number;
};

function isSale(t: Transaction): t is Extract<Transaction, { type: "sale" }> {
  return t.type === "sale";
}

export function buildBranchCogsReport(
  transactions: Transaction[],
  settings: CostSettings,
  branch: Branch,
  month: string
): BranchCogsReport {
  const { from, to } = monthStartEnd(month);
  const monthCfg = settings.months[month] ?? emptyMonthCostSettings();
  const branchCfg = monthCfg.branches[branch];
  const recipeByCode = new Map(settings.recipes.map((r) => [r.code, r]));

  const byCode = new Map<string, { name: string; qty: number; revenue: number; recipe?: ProductCostRecipe }>();

  for (const t of transactions) {
    if (!isSale(t)) continue;
    const d = t.date.slice(0, 10);
    if (d < from || d > to) continue;
    if (t.branch !== branch) continue;
    const code = (t.productCode || "").trim() || t.productName;
    const cur = byCode.get(code) ?? {
      name: t.productName,
      qty: 0,
      revenue: 0,
      recipe: recipeByCode.get(code),
    };
    cur.qty += t.quantity;
    cur.revenue += t.amount;
    if (!cur.recipe) cur.recipe = recipeByCode.get(code);
    byCode.set(code, cur);
  }

  let expenses = 0;
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const d = t.date.slice(0, 10);
    if (d < from || d > to) continue;
    if (String(t.branch) !== branch && t.branch !== "საერთო") continue;
    // საერთო ხარჯი მხოლოდ „საერთო“ არხზე ან ყველა ობიექტზე პროპორციულად — აქ მხოლოდ ფილიალის ხარჯი
    if (String(t.branch) !== branch) continue;
    expenses += t.amount;
  }

  const defaultMat =
    branchCfg?.materialPerKg && branchCfg.materialPerKg > 0
      ? branchCfg.materialPerKg
      : settings.recipes[0]?.materialPerKg ?? 3.5;

  const lines: CogsProductLine[] = [];
  for (const [code, row] of byCode) {
    const recipe =
      row.recipe ??
      ({
        code,
        name: row.name,
        weightKg: 0,
        material: "",
        machine: "",
        timeMin: 0,
        elecKwh: 0,
        elecPrice: branchCfg?.electricityPrice ?? 0.32,
        materialPerKg: defaultMat,
        wagePerUnit: 0,
        sellPrice: row.qty > 0 ? row.revenue / row.qty : 0,
        distPrice: 0,
        wasteFactor: 1.2,
      } satisfies ProductCostRecipe);

    const unit = calcUnitCost(recipe, {
      materialPerKg: branchCfg?.materialPerKg || recipe.materialPerKg,
      elecPrice: branchCfg?.electricityPrice || recipe.elecPrice,
      distPercent: monthCfg.distributor.percent,
    });

    lines.push({
      code,
      name: row.name || recipe.name,
      qty: row.qty,
      revenue: Math.round(row.revenue * 100) / 100,
      unitCost: unit.totalCost,
      totalCogs: Math.round(unit.totalCost * row.qty * 100) / 100,
      unit,
    });
  }

  lines.sort((a, b) => b.totalCogs - a.totalCogs || a.name.localeCompare(b.name, "ka"));

  const soldQty = lines.reduce((s, l) => s + l.qty, 0);
  const revenue = lines.reduce((s, l) => s + l.revenue, 0);
  const cogs = lines.reduce((s, l) => s + l.totalCogs, 0);

  let distributorPay = 0;
  if (branch === "დისტრიბუცია") {
    const distRevenue = lines.reduce((s, l) => s + l.unit.distPrice * l.qty, 0);
    distributorPay = calcDistributorPay(
      monthCfg.distributor.mode,
      monthCfg.distributor.fixedAmount,
      monthCfg.distributor.percent,
      distRevenue
    );
  }

  const grossProfit = Math.round((revenue - cogs) * 100) / 100;
  const netAfterExpenses = Math.round((grossProfit - expenses - distributorPay) * 100) / 100;

  return {
    branch,
    month,
    materialPerKg: branchCfg?.materialPerKg || defaultMat,
    lines,
    soldQty,
    revenue: Math.round(revenue * 100) / 100,
    cogs: Math.round(cogs * 100) / 100,
    expenses: Math.round(expenses * 100) / 100,
    distributorPay,
    grossProfit,
    netAfterExpenses,
  };
}

export function buildAllBranchesCogs(
  transactions: Transaction[],
  settings: CostSettings,
  month: string
): BranchCogsReport[] {
  return BRANCHES.map((b) => buildBranchCogsReport(transactions, settings, b, month));
}
