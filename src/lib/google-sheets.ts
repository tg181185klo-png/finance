import type { Product } from "./types";
import { env, PRODUCT_SHEETS } from "./sheets-config";

function sheetCsvUrl(name: string, gid?: string) {
  const base = `https://docs.google.com/spreadsheets/d/${env.googleSheetId}`;
  if (gid) return `${base}/export?format=csv&gid=${gid}`;
  return `${base}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}`;
}

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

function parsePrice(raw: string): number {
  const s = (raw ?? "").trim().replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function colIndex(headers: string[], ...keys: string[]) {
  const norm = (s: string) => s.trim().toLowerCase();
  for (const k of keys) {
    const i = headers.findIndex((h) => norm(h) === norm(k) || norm(h).includes(norm(k)));
    if (i >= 0) return i;
  }
  return -1;
}

function priceCol(headers: string[]) {
  const exact = headers.findIndex((h) => h.trim() === "გასაყიდი ფასი");
  if (exact >= 0) return exact;
  return headers.findIndex((h) => h.includes("გასაყიდი ფასი") && !h.includes("დღგ გარეშე") && !h.includes("სულ"));
}

function looksLikeProductCode(code: string) {
  if (!code || code.length > 24) return false;
  if (/^[\d]+\/[\dA-Za-z\-\/]+$/.test(code)) return true;
  if (/^[\d]+\/[\dA-Za-z]+$/.test(code)) return true;
  return /^[\d\/A-Za-z\-]+$/.test(code) && code.includes("/");
}

function parseHeaderRows(rows: string[][], map: Map<string, Product>, overwrite = false) {
  if (!rows.length) return 0;
  const headers = rows[0].map((h) => h.trim());
  const codeIdx = colIndex(headers, "კოდი", "ბარკოდი");
  const nameIdx = colIndex(headers, "პროდუქტი", "დასახელება");
  const priceIdx = priceCol(headers);
  if (codeIdx < 0 || nameIdx < 0 || priceIdx < 0) return 0;

  let added = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const code = (row[codeIdx] ?? "").trim();
    const name = (row[nameIdx] ?? "").trim();
    const price = parsePrice(row[priceIdx] ?? "");
    if (!code || !name || !Number.isFinite(price) || price <= 0) continue;
    if (!overwrite && map.has(code)) continue;
    map.set(code, { code, name, price });
    added++;
  }
  return added;
}

/** თვითღირებულების ფურცელი — სათაურის გარეშე, კოდი/სახელი/გასაყიდი ფასი ფიქსირებული სვეტებით */
function parseCostSheetRows(rows: string[][], map: Map<string, Product>) {
  const CODE = 0;
  const NAME = 1;
  const PRICE = 17;
  let added = 0;

  for (const row of rows) {
    const code = (row[CODE] ?? "").trim();
    const name = (row[NAME] ?? "").trim();
    if (!looksLikeProductCode(code) || !name) continue;
    const price = parsePrice(row[PRICE] ?? "");
    if (!Number.isFinite(price) || price <= 0) continue;
    map.set(code, { code, name, price });
    added++;
  }
  return added;
}

export async function fetchProductsFromGoogleSheets(): Promise<{ products: Product[]; error?: string }> {
  const map = new Map<string, Product>();
  let lastErr = "";

  for (const sheet of PRODUCT_SHEETS) {
    const url = sheetCsvUrl(sheet.name, sheet.gid || undefined);
    try {
      const res = await fetch(url, {
        cache: "no-store",
        headers: { "User-Agent": "FinDashboard/1.0" },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const text = await res.text();
      if (text.includes("Sign in") || text.includes("<!DOCTYPE html") || text.includes("accounts.google.com")) {
        lastErr = "ფურცელი კერძოა — გააზიარეთ „ინტერნეთზე ყველას“";
        continue;
      }

      const rows = parseCsv(text);
      const isCostSheet = sheet.gid === env.googleSheetGidCost;

      if (isCostSheet) {
        parseCostSheetRows(rows, map);
      } else {
        const n = parseHeaderRows(rows, map);
        if (n === 0) parseCostSheetRows(rows, map);
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "შეცდომა";
    }
  }

  const products = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ka"));
  if (!products.length && lastErr) return { products: [], error: lastErr };
  return { products, error: products.length ? undefined : lastErr };
}
