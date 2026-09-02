import * as XLSX from "xlsx";
import type { Branch, BranchClientSale, Customer, CustomerPersonType, Store } from "./types";
import { uid } from "./utils";

export function normalizeId(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "").slice(-9);
}

export function customerDedupeKey(c: {
  personType: CustomerPersonType;
  personalId?: string;
  phone?: string;
  companyId?: string;
}): string | null {
  if (c.personType === "legal") {
    const id = normalizeId(c.companyId ?? "");
    if (id.length >= 7) return `legal:${id}`;
    return null;
  }
  const pid = normalizeId(c.personalId ?? "");
  if (pid.length >= 9) return `physical:pid:${pid}`;
  const phone = normalizePhone(c.phone ?? "");
  if (phone.length >= 9) return `physical:phone:${phone}`;
  return null;
}

export function customerDisplayName(c: Customer): string {
  if (c.personType === "legal") return c.companyName?.trim() || "—";
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "—";
}

export function customerFromBranchSale(
  sale: BranchClientSale,
  ctx: {
    branch: Branch;
    registeredByEmployeeId: string;
    registeredByEmployeeName: string;
    registeredAt: string;
  }
): Customer {
  const personType = sale.personType ?? "physical";
  return {
    id: uid(),
    personType,
    isLegacy: false,
    firstName: sale.customerFirstName?.trim() || sale.contactFirstName?.trim(),
    lastName: sale.customerLastName?.trim() || sale.contactLastName?.trim(),
    personalId: sale.personalId?.trim(),
    phone: sale.phone?.trim() || sale.contactPhone?.trim(),
    companyName: sale.companyName?.trim(),
    companyId: sale.companyId?.trim(),
    contactFirstName: sale.contactFirstName?.trim(),
    contactLastName: sale.contactLastName?.trim(),
    contactPhone: sale.contactPhone?.trim(),
    driverEmployeeId: sale.driverEmployeeId,
    driverEmployeeName: sale.driverEmployeeName,
    registeredByEmployeeId: ctx.registeredByEmployeeId,
    registeredByEmployeeName: ctx.registeredByEmployeeName,
    branch: ctx.branch,
    registeredAt: ctx.registeredAt,
    source: "employee",
  };
}

export function branchSaleBuyerName(sale: BranchClientSale): string {
  if (sale.personType === "legal") {
    return sale.companyName?.trim() || `${sale.customerFirstName} ${sale.customerLastName}`.trim();
  }
  return `${sale.customerFirstName} ${sale.customerLastName}`.trim();
}

/** პირველი რეგისტრაცია ინარჩუნებს უპირატესობას */
export function upsertCustomer(store: Store, candidate: Customer): Customer {
  const key = customerDedupeKey(candidate);
  if (key) {
    const existing = store.customers.find((c) => customerDedupeKey(c) === key);
    if (existing) return existing;
  }
  store.customers.push(candidate);
  return candidate;
}

export function mergeCustomerImport(existing: Customer[], incoming: Customer[]): { merged: Customer[]; added: number } {
  const merged = [...existing];
  const keys = new Set(existing.map((c) => customerDedupeKey(c)).filter(Boolean) as string[]);
  let added = 0;
  for (const c of incoming) {
    const key = customerDedupeKey(c);
    if (key && keys.has(key)) continue;
    if (key) keys.add(key);
    merged.push(c);
    added++;
  }
  return { merged, added };
}

function fallbackCustomerKey(c: Customer): string {
  if (c.personType === "legal") {
    const id = normalizeId(c.companyId ?? "");
    if (id.length >= 7) return `legal:${id}`;
    const name = (c.companyName ?? "").trim().toLowerCase();
    if (name) return `legal:name:${name}`;
  }
  const pid = normalizeId(c.personalId ?? "");
  if (pid.length >= 9) return `physical:pid:${pid}`;
  const phone = normalizePhone(c.phone ?? c.contactPhone ?? "");
  if (phone.length >= 9) return `physical:phone:${phone}`;
  return `physical:name:${customerDisplayName(c).toLowerCase()}`;
}

/** დუბლიკატების მოცილება — პირველი რეგისტრაცია რჩება */
export function dedupeCustomersList(customers: Customer[]): { customers: Customer[]; removed: number } {
  const byKey = new Map<string, Customer>();

  for (const c of customers) {
    const key = customerDedupeKey(c) ?? fallbackCustomerKey(c);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, c);
      continue;
    }
    const keep =
      c.registeredAt < existing.registeredAt
        ? c
        : c.registeredAt > existing.registeredAt
          ? existing
          : c.isLegacy && !existing.isLegacy
            ? c
            : existing;
    byKey.set(key, keep);
  }

  const merged = [...byKey.values()];
  return { customers: merged, removed: customers.length - merged.length };
}

type ParsedRow = { name: string; companyId: string };

function parseRegistrySheet(rows: unknown[][]): ParsedRow[] {
  if (!rows.length) return [];
  const header = rows[0].map((c) => String(c ?? "").trim().toLowerCase());
  const nameIdx = header.findIndex((h) => h.includes("მყიდველ"));
  const idIdx = header.findIndex((h) => h.includes("საიდენტ") || h.includes("კოდ"));
  if (nameIdx < 0) return [];

  const out: ParsedRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[nameIdx] ?? "").trim();
    const companyId = idIdx >= 0 ? normalizeId(String(row[idIdx] ?? "")) : "";
    if (!name) continue;
    out.push({ name, companyId });
  }
  return out;
}

function parseTransactionBuyers(rows: unknown[][]): ParsedRow[] {
  if (!rows.length) return [];
  const header = rows[0].map((c) => String(c ?? "").trim().toLowerCase());
  const nameIdx = header.findIndex((h) => h === "მყიდველი");
  const idIdx = header.findIndex((h) => h.includes("მყიდველის კოდ") || h.includes("კოდი"));
  if (nameIdx < 0) return [];

  const map = new Map<string, ParsedRow>();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[nameIdx] ?? "").trim();
    const companyId = idIdx >= 0 ? normalizeId(String(row[idIdx] ?? "")) : "";
    if (!name) continue;
    const key = companyId || name.toLowerCase();
    if (!map.has(key)) map.set(key, { name, companyId });
  }
  return [...map.values()];
}

export function parseCustomersExcel(buffer: Buffer): Customer[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const now = new Date().toISOString();
  const rowsByKey = new Map<string, ParsedRow>();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
    const header = rows[0]?.map((c) => String(c ?? "").trim().toLowerCase()) ?? [];
    const isRegistry = header.some((h) => h.includes("საიდენტ"));
    const parsed = isRegistry ? parseRegistrySheet(rows) : parseTransactionBuyers(rows);
    for (const p of parsed) {
      const key = p.companyId || p.name.toLowerCase();
      if (!rowsByKey.has(key)) rowsByKey.set(key, p);
    }
  }

  return [...rowsByKey.values()].map((p) => ({
    id: uid(),
    personType: "legal" as const,
    isLegacy: true,
    companyName: p.name,
    companyId: p.companyId || undefined,
    registeredAt: now,
    source: "import" as const,
  }));
}

export function customersToExportRows(customers: Customer[]) {
  return customers.map((c, i) => {
    if (c.personType === "legal") {
      return {
        N: i + 1,
        ტიპი: "იურიდიული",
        სტატუსი: c.isLegacy ? "ძველი" : "ახალი",
        "კომპანიის დასახელება": c.companyName ?? "",
        "საიდენტ. კოდი": c.companyId ?? "",
        "საკონტაქტო სახელი": c.contactFirstName ?? "",
        "საკონტაქტო გვარი": c.contactLastName ?? "",
        "საკონტაქტო ტელეფონი": c.contactPhone ?? c.phone ?? "",
        "მომზიდავი თანამშრომელი": c.driverEmployeeName ?? "",
        ფილიალი: c.branch ?? "",
        "რეგისტრაციის თარიღი": c.registeredAt.slice(0, 10),
        წყარო: c.source === "import" ? "იმპორტი" : "თანამშრომელი",
      };
    }
    return {
      N: i + 1,
      ტიპი: "ფიზიკური",
      სტატუსი: c.isLegacy ? "ძველი" : "ახალი",
      სახელი: c.firstName ?? "",
      გვარი: c.lastName ?? "",
      "პირადი ნომერი": c.personalId ?? "",
      ტელეფონი: c.phone ?? "",
      "მომზიდავი თანამშრომელი": c.driverEmployeeName ?? "",
      ფილიალი: c.branch ?? "",
      "რეგისტრაციის თარიღი": c.registeredAt.slice(0, 10),
      წყარო: c.source === "import" ? "იმპორტი" : "თანამშრომელი",
    };
  });
}

export function buildCustomersWorkbook(customers: Customer[]): Buffer {
  const rows = customersToExportRows(customers);
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ შეტყობინება: "კლიენტები არ არის" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "კლიენტები");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
