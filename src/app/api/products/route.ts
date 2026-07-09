import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { fetchProductsFromGoogleSheets } from "@/lib/google-sheets";
import { env } from "@/lib/env";
import type { Product } from "@/lib/types";

export const dynamic = "force-dynamic";

const EXCEL_PATH = env.excelPath || "C:\\Users\\User\\Desktop\\PROGRAM\\საწყობი\\kalkulatori.xlsx";

function parseSheet(rows: unknown[][], codeIdx: number, nameIdx: number, priceIdx: number, map: Map<string, Product>) {
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const code = String(row[codeIdx] ?? "").trim();
    const name = String(row[nameIdx] ?? "").trim();
    const price = Number(row[priceIdx]);
    if (!code || !name || !Number.isFinite(price) || price <= 0) continue;
    if (!map.has(code)) map.set(code, { code, name, price });
  }
}

async function fetchFromExcel() {
  const buf = await readFile(EXCEL_PATH);
  const wb = XLSX.read(buf, { type: "buffer" });
  const map = new Map<string, Product>();
  const calc = wb.Sheets["პროდუქტების დასათვლელი"];
  if (calc) parseSheet(XLSX.utils.sheet_to_json(calc, { header: 1 }) as unknown[][], 0, 1, 11, map);
  const cost = wb.Sheets["თვითღირებულება"];
  if (cost) parseSheet(XLSX.utils.sheet_to_json(cost, { header: 1 }) as unknown[][], 0, 1, 17, map);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ka"));
}

export async function GET() {
  try {
    const { products, error } = await fetchProductsFromGoogleSheets();

    if (products.length > 0) {
      return NextResponse.json(
        { products, count: products.length, source: "google-sheets", updatedAt: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    }

    try {
      const fallback = await fetchFromExcel();
      return NextResponse.json(
        {
          products: fallback,
          count: fallback.length,
          source: "excel-fallback",
          warning: error || "Google Sheets ვერ ჩაიტვირთა",
          updatedAt: new Date().toISOString(),
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } }
      );
    } catch {
      return NextResponse.json(
        { products: [], count: 0, source: "none", error: error || "პროდუქტები ვერ ჩაიტვირთა" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "წაკითხვის შეცდომა";
    return NextResponse.json({ error: msg, products: [] }, { status: 500 });
  }
}
