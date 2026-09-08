import type { Branch, Transaction } from "./types";
import { BRANCHES } from "./constants";
import { isWageCategory } from "./expense-categories";
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

export type ExpenseBreakdownRow = {
  category: string;
  amount: number;
};

export type BranchCogsReport = {
  branch: Branch;
  month: string;
  materialPerKg: number;
  lines: CogsProductLine[];
  soldQty: number;
  revenue: number;
  cogs: number;
  /** თვითღირებულების კომპონენტები (გაყიდულ რაოდენობაზე) */
  cogsMaterial: number;
  cogsElectricity: number;
  cogsWage: number;
  expenses: number;
  expensesByCategory: ExpenseBreakdownRow[];
  salaryExpenses: number;
  rentExpenses: number;
  fuelExpenses: number;
  otherExpenses: number;
  distributorPay: number;
  /** დისტრიბუციის ფასით შემოსავალი (თუ რეცეპტი აქვს) */
  distListRevenue: number;
  grossProfit: number;
  netAfterExpenses: number;
};

function isSale(t: Transaction): t is Extract<Transaction, { type: "sale" }> {
  return t.type === "sale";
}

function categorizeExpenseBucket(category: string): "salary" | "rent" | "fuel" | "other" {
  if (isWageCategory(category)) return "salary";
  if (/იჯარ|არენდ|rent/i.test(category)) return "rent";
  if (/საწვავ|ბენზინ|დიზელ|fuel|ლოგისტიკ/i.test(category)) return "fuel";
  return "other";
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
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

  const expenseMap = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const d = t.date.slice(0, 10);
    if (d < from || d > to) continue;
    if (String(t.branch) !== branch) continue;
    const cat = (t.category || "სხვა").trim() || "სხვა";
    expenseMap.set(cat, (expenseMap.get(cat) ?? 0) + t.amount);
  }

  const expensesByCategory: ExpenseBreakdownRow[] = [...expenseMap.entries()]
    .map(([category, amount]) => ({ category, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category, "ka"));

  let salaryExpenses = 0;
  let rentExpenses = 0;
  let fuelExpenses = 0;
  let otherExpenses = 0;
  let expenses = 0;
  for (const row of expensesByCategory) {
    expenses += row.amount;
    const bucket = categorizeExpenseBucket(row.category);
    if (bucket === "salary") salaryExpenses += row.amount;
    else if (bucket === "rent") rentExpenses += row.amount;
    else if (bucket === "fuel") fuelExpenses += row.amount;
    else otherExpenses += row.amount;
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
      revenue: round2(row.revenue),
      unitCost: unit.totalCost,
      totalCogs: round2(unit.totalCost * row.qty),
      unit,
    });
  }

  lines.sort((a, b) => b.totalCogs - a.totalCogs || a.name.localeCompare(b.name, "ka"));

  const soldQty = lines.reduce((s, l) => s + l.qty, 0);
  const revenue = lines.reduce((s, l) => s + l.revenue, 0);
  const cogs = lines.reduce((s, l) => s + l.totalCogs, 0);
  const cogsMaterial = round2(lines.reduce((s, l) => s + l.unit.materialCost * l.qty, 0));
  const cogsElectricity = round2(lines.reduce((s, l) => s + l.unit.elecCost * l.qty, 0));
  const cogsWage = round2(lines.reduce((s, l) => s + l.unit.wage * l.qty, 0));
  const distListRevenue = round2(lines.reduce((s, l) => s + l.unit.distPrice * l.qty, 0));

  let distributorPay = 0;
  if (branch === "დისტრიბუცია") {
    distributorPay = calcDistributorPay(
      monthCfg.distributor.mode,
      monthCfg.distributor.fixedAmount,
      monthCfg.distributor.percent,
      distListRevenue > 0 ? distListRevenue : revenue
    );
  }

  const grossProfit = round2(revenue - cogs);
  const netAfterExpenses = round2(grossProfit - expenses - distributorPay);

  return {
    branch,
    month,
    materialPerKg: branchCfg?.materialPerKg || defaultMat,
    lines,
    soldQty,
    revenue: round2(revenue),
    cogs: round2(cogs),
    cogsMaterial,
    cogsElectricity,
    cogsWage,
    expenses: round2(expenses),
    expensesByCategory,
    salaryExpenses: round2(salaryExpenses),
    rentExpenses: round2(rentExpenses),
    fuelExpenses: round2(fuelExpenses),
    otherExpenses: round2(otherExpenses),
    distributorPay,
    distListRevenue,
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
