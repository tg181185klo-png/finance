import * as XLSX from "xlsx";
import type { Branch, Sale } from "./types";
import { monthStartEnd } from "./utils";

export type ParsedSaleRow = {
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
};

function normHeader(h: unknown): string {
  return String(h ?? "").trim().toLowerCase();
}

function findCol(headers: string[], ...keys: string[]): number {
  for (let i = 0; i < headers.length; i += 1) {
    const h = normHeader(headers[i]);
    if (keys.some((k) => h.includes(k))) return i;
  }
  return -1;
}

/** გასაყიდი/ჯამური თანხა — არა შესყიდვის სვეტები */
function findSalesCol(headers: string[], ...keys: string[]): number {
  for (let i = 0; i < headers.length; i += 1) {
    const h = normHeader(headers[i]);
    if (h.includes("შესყიდ")) continue;
    if (keys.some((k) => h.includes(k))) return i;
  }
  return -1;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** distribucia marti.xlsx და მსგავსი ფაილების პარსინგი */
export function parseDistributionExcel(buffer: Buffer): ParsedSaleRow[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Excel ფაილი ცარიელია");
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (rows.length < 2) throw new Error("Excel-ში მონაცემები არ არის");

  const headers = rows[0].map(String);
  const codeCol = findCol(headers, "ბარკოდ", "კოდ");
  const nameCol = findCol(headers, "დასახელებ");
  const qtyCol = findCol(headers, "რაოდენობ");
  const priceCol = findSalesCol(headers, "გასაყიდ");
  const totalCol = findSalesCol(headers, "ჯამური თანხ");

  if (codeCol < 0) throw new Error("ვერ მოიძებნა „ბარკოდი/კოდი“ სვეტი");
  if (qtyCol < 0) throw new Error("ვერ მოიძებნა „რაოდენობა“ სვეტი");
  if (priceCol < 0 && totalCol < 0) throw new Error("ვერ მოიძებნა ფასის ან ჯამური თანხის სვეტი");

  const out: ParsedSaleRow[] = [];
  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row?.length) continue;
    const productCode = String(row[codeCol] ?? "").trim();
    if (!productCode) continue;
    const quantity = num(row[qtyCol]);
    if (quantity <= 0) continue;
    const unitPrice = priceCol >= 0 ? num(row[priceCol]) : 0;
    let amount = totalCol >= 0 ? num(row[totalCol]) : 0;
    if (!amount && unitPrice) amount = Math.round(quantity * unitPrice * 100) / 100;
    if (!amount) continue;
    const resolvedUnit = unitPrice > 0 ? unitPrice : Math.round((amount / quantity) * 100) / 100;
    const productName =
      nameCol >= 0 ? String(row[nameCol] ?? productCode).trim() || productCode : productCode;
    out.push({
      productCode,
      productName,
      quantity,
      unitPrice: resolvedUnit,
      amount,
    });
  }

  if (!out.length) throw new Error("ვალიდური ხაზები ვერ მოიძებნა — შეამოწმეთ სვეტების სახელები");
  return mergeRowsByProduct(out);
}

/** ერთნაირი კოდის ხაზების გაერთიანება — რაოდენობა და თანხა ემატება */
export function mergeRowsByProduct(rows: ParsedSaleRow[]): ParsedSaleRow[] {
  const map = new Map<string, ParsedSaleRow>();
  for (const row of rows) {
    const key = row.productCode.trim();
    if (!key) continue;
    const cur = map.get(key);
    if (!cur) {
      map.set(key, { ...row, productCode: key });
      continue;
    }
    cur.quantity += row.quantity;
    cur.amount = Math.round((cur.amount + row.amount) * 100) / 100;
    cur.unitPrice =
      cur.quantity > 0 ? Math.round((cur.amount / cur.quantity) * 100) / 100 : cur.unitPrice;
    if (row.productName.length > cur.productName.length) cur.productName = row.productName;
  }
  return [...map.values()].sort((a, b) => a.productCode.localeCompare(b.productCode));
}

export function salesToImportRows(sales: Sale[]): ParsedSaleRow[] {
  return sales.map((s) => ({
    productCode: s.productCode,
    productName: s.productName,
    quantity: s.quantity,
    unitPrice: s.unitPrice,
    amount: s.amount,
  }));
}

export function importSaleId(branch: Branch, month: string, productCode: string) {
  const safe = productCode.replace(/[^a-zA-Z0-9/]/g, "_");
  return `import-${month}-${branch}-${safe}`;
}

export function isBranchMonthImport(sale: Sale, branch: Branch, month: string) {
  return sale.source === "import" && sale.branch === branch && sale.date.slice(0, 7) === month;
}

export function buildImportSales(
  rows: ParsedSaleRow[],
  opts: { branch: Branch; month: string; fileLabel: string; employeeName?: string }
): Sale[] {
  const { to } = monthStartEnd(opts.month);
  const date = `${to}T12:00:00.000Z`;
  const comment = `Excel · ${opts.month} · ${opts.branch} · ${opts.fileLabel}`;

  return rows.map((row) => ({
    id: importSaleId(opts.branch, opts.month, row.productCode),
    type: "sale" as const,
    date,
    branch: opts.branch,
    productCode: row.productCode,
    productName: row.productName,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    amount: row.amount,
    paymentStatus: "სრულად გადახდილი" as const,
    paymentMethod: "ანგარიშზე ჩარიცხვა" as const,
    comment,
    recurrence: "ერთჯერადი" as const,
    source: "import" as const,
    employeeName: opts.employeeName,
  }));
}

export function summarizeImportRows(rows: ParsedSaleRow[]) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const qty = rows.reduce((s, r) => s + r.quantity, 0);
  return { lines: rows.length, products: rows.length, total, quantity: qty };
}
