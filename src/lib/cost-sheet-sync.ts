import { env } from "./sheets-config";
import { parseCostRecipesFromRows, type ProductCostRecipe } from "./product-cost";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (q) {
      if (c === '"' && n === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || (c === "\r" && n === "\n")) {
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
      if (c === "\r") i++;
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  return rows;
}

export async function fetchCostRecipesFromGoogleSheet(): Promise<{
  recipes: ProductCostRecipe[];
  error?: string;
}> {
  const url = `https://docs.google.com/spreadsheets/d/${env.googleSheetId}/gviz/tq?tqx=out:csv&gid=${env.googleSheetGidCost}`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "FinDashboard/1.0" },
    });
    if (!res.ok) return { recipes: [], error: `HTTP ${res.status}` };
    const text = await res.text();
    if (text.includes("Sign in") || text.includes("<!DOCTYPE html")) {
      return { recipes: [], error: "ფურცელი კერძოა — გააზიარეთ ყველასთვის ნახვაზე" };
    }
    const recipes = parseCostRecipesFromRows(parseCsv(text));
    return {
      recipes,
      error: recipes.length ? undefined : "რეცეპტები ვერ მოიძებნა",
    };
  } catch (e) {
    return { recipes: [], error: e instanceof Error ? e.message : "შეცდომა" };
  }
}
