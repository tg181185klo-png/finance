import type { Branch } from "./types";

export const COST_VAT_RATE = 0.18;
export const COST_WASTE_FACTOR = 1.2;

export type ProductCostRecipe = {
  code: string;
  name: string;
  weightKg: number;
  material: string;
  machine: string;
  timeMin: number;
  elecKwh: number;
  /** ლარი / კვტ·სთ */
  elecPrice: number;
  /** 1 კგ მასალის საწყისი ღირებულება */
  materialPerKg: number;
  /** მუშის ხელფასი ცალზე */
  wagePerUnit: number;
  sellPrice: number;
  distPrice: number;
  wasteFactor: number;
};

export type DistributorPayMode = "fixed" | "percent" | "fixed_plus_percent";

export type BranchMonthCostInput = {
  /** იმ თვეში წამოღებული 1 კგ მასალის ღირებულება ობიექტზე */
  materialPerKg: number;
  /** თუ მითითებულია — ყველა პროდუქტზე ელ. ფასის გადაფარვა */
  electricityPrice?: number;
};

export type MonthDistributorPay = {
  mode: DistributorPayMode;
  fixedAmount: number;
  /** მაგ. 5 = 5% */
  percent: number;
};

export type MonthCostSettings = {
  branches: Partial<Record<Branch, BranchMonthCostInput>>;
  distributor: MonthDistributorPay;
};

export type CostSettings = {
  recipes: ProductCostRecipe[];
  months: Record<string, MonthCostSettings>;
  syncedAt?: string;
};

export type UnitCostBreakdown = {
  elecCost: number;
  elecVat: number;
  realWeightKg: number;
  materialCost: number;
  materialVat: number;
  wage: number;
  totalCost: number;
  costExVat: number;
  sellPrice: number;
  sellVat: number;
  sellExVat: number;
  vatPayable: number;
  profit: number;
  marginPct: number;
  distPrice: number;
  distVat: number;
  distExVat: number;
  distCommission: number;
  profitAfterDist: number;
  marginAfterDistPct: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** დღგ-ის ნაწილი ფასში (დღგ ჩათვლილი) */
export function vatIncludedPart(amountInclVat: number, rate = COST_VAT_RATE): number {
  if (!(amountInclVat > 0)) return 0;
  return round2((amountInclVat * rate) / (1 + rate));
}

export function emptyDistributorPay(): MonthDistributorPay {
  return { mode: "percent", fixedAmount: 0, percent: 5 };
}

export function emptyMonthCostSettings(): MonthCostSettings {
  return { branches: {}, distributor: emptyDistributorPay() };
}

export function emptyCostSettings(): CostSettings {
  return { recipes: [], months: {} };
}

export function calcElectricityCost(timeMin: number, elecKwh: number, elecPrice: number): number {
  return round2((timeMin / 60) * elecKwh * elecPrice);
}

export function calcUnitCost(
  recipe: ProductCostRecipe,
  opts?: { materialPerKg?: number; elecPrice?: number; distPercent?: number }
): UnitCostBreakdown {
  const materialPerKg = opts?.materialPerKg ?? recipe.materialPerKg;
  const elecPrice = opts?.elecPrice ?? recipe.elecPrice;
  const waste = recipe.wasteFactor > 0 ? recipe.wasteFactor : COST_WASTE_FACTOR;
  const distPercent = opts?.distPercent ?? 5;

  const elecCost = calcElectricityCost(recipe.timeMin, recipe.elecKwh, elecPrice);
  const elecVat = vatIncludedPart(elecCost);
  const realWeightKg = round2(recipe.weightKg * waste);
  const materialCost = round2(realWeightKg * materialPerKg);
  const materialVat = vatIncludedPart(materialCost);
  const wage = round2(recipe.wagePerUnit);
  const totalCost = round2(elecCost + materialCost + wage);
  const costExVat = round2(totalCost - elecVat - materialVat);

  const sellPrice = round2(recipe.sellPrice);
  const sellVat = vatIncludedPart(sellPrice);
  const sellExVat = round2(sellPrice - sellVat);
  const vatPayable = round2(sellVat - elecVat - materialVat);
  const profit = round2(sellExVat - costExVat);
  const marginPct = sellPrice > 0 ? round2((profit / sellPrice) * 100) : 0;

  const distPrice = round2(recipe.distPrice);
  const distVat = vatIncludedPart(distPrice);
  const distExVat = round2(distPrice - distVat);
  const distCommission = round2(distPrice * (distPercent / 100));
  const profitAfterDist = round2(distExVat - costExVat - distCommission);
  const marginAfterDistPct = distPrice > 0 ? round2((profitAfterDist / distPrice) * 100) : 0;

  return {
    elecCost,
    elecVat,
    realWeightKg,
    materialCost,
    materialVat,
    wage,
    totalCost,
    costExVat,
    sellPrice,
    sellVat,
    sellExVat,
    vatPayable,
    profit,
    marginPct,
    distPrice,
    distVat,
    distExVat,
    distCommission,
    profitAfterDist,
    marginAfterDistPct,
  };
}

export function calcDistributorPay(
  mode: DistributorPayMode,
  fixedAmount: number,
  percent: number,
  distributionRevenue: number
): number {
  const fixed = Math.max(0, fixedAmount || 0);
  const pct = Math.max(0, percent || 0);
  const fromPct = round2(distributionRevenue * (pct / 100));
  if (mode === "fixed") return round2(fixed);
  if (mode === "percent") return fromPct;
  return round2(fixed + fromPct);
}

export function replaceRecipeFieldValue(
  recipes: ProductCostRecipe[],
  field: keyof Pick<
    ProductCostRecipe,
    "materialPerKg" | "elecPrice" | "wagePerUnit" | "sellPrice" | "distPrice"
  >,
  from: number,
  to: number
): { recipes: ProductCostRecipe[]; changed: number } {
  const fromR = Math.round(from * 100) / 100;
  const toR = Math.round(to * 100) / 100;
  let changed = 0;
  const next = recipes.map((r) => {
    const cur = Math.round(Number(r[field]) * 100) / 100;
    if (cur !== fromR) return r;
    changed += 1;
    return { ...r, [field]: toR };
  });
  return { recipes: next, changed };
}

/** უნიკალური მნიშვნელობები ველზე — რამდენ პროდუქტზე გვხვდება */
export function collectRecipeValueGroups(
  recipes: ProductCostRecipe[],
  field: keyof Pick<
    ProductCostRecipe,
    "materialPerKg" | "elecPrice" | "wagePerUnit" | "sellPrice" | "distPrice"
  >
): { value: number; count: number }[] {
  const map = new Map<number, number>();
  for (const r of recipes) {
    const v = Math.round(Number(r[field]) * 100) / 100;
    if (!Number.isFinite(v)) continue;
    map.set(v, (map.get(v) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value - b.value);
}

export function parseMoneyKa(raw: string): number {
  const s = (raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function looksLikeProductCode(code: string) {
  if (!code || code.length > 24) return false;
  return /^[\d]+\/[\dA-Za-z\-\/]+$/.test(code) || (/^[\d\/A-Za-z\-]+$/.test(code) && code.includes("/"));
}

/** Google Sheets თვითღირებულება → რეცეპტები */
export function parseCostRecipesFromRows(rows: string[][]): ProductCostRecipe[] {
  const out: ProductCostRecipe[] = [];
  for (const row of rows) {
    const code = (row[0] ?? "").trim();
    const name = (row[1] ?? "").trim();
    if (!looksLikeProductCode(code) || !name) continue;

    const weightKg = parseMoneyKa(row[2] ?? "");
    const timeMin = parseMoneyKa(row[5] ?? "");
    const elecKwh = parseMoneyKa(row[6] ?? "");
    const elecPrice = parseMoneyKa(row[7] ?? "");
    const materialPerKg = parseMoneyKa(row[10] ?? "");
    const wagePerUnit = parseMoneyKa(row[14] ?? "");
    const sellPrice = parseMoneyKa(row[17] ?? "");
    const distPrice = parseMoneyKa(row[23] ?? "");

    if (!(weightKg > 0) || !(sellPrice > 0)) continue;

    out.push({
      code,
      name,
      weightKg,
      material: (row[3] ?? "").trim(),
      machine: (row[4] ?? "").trim(),
      timeMin: Number.isFinite(timeMin) ? timeMin : 0,
      elecKwh: Number.isFinite(elecKwh) ? elecKwh : 0,
      elecPrice: Number.isFinite(elecPrice) && elecPrice > 0 ? elecPrice : 0.32,
      materialPerKg: Number.isFinite(materialPerKg) && materialPerKg > 0 ? materialPerKg : 3.5,
      wagePerUnit: Number.isFinite(wagePerUnit) ? wagePerUnit : 0,
      sellPrice,
      distPrice: Number.isFinite(distPrice) && distPrice > 0 ? distPrice : sellPrice,
      wasteFactor: COST_WASTE_FACTOR,
    });
  }
  return out;
}
