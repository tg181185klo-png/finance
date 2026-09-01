import * as XLSX from "xlsx";
import type { Branch, Employee } from "./types";
import { BRANCHES } from "./constants";
import { uid } from "./utils";

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function parseBranch(value: string): Branch | null {
  const v = value.trim().toLowerCase();
  for (const b of BRANCHES) {
    if (v === b.toLowerCase()) return b;
  }
  if (/ქუთაის|kutais/i.test(v)) return "ქუთაისი";
  if (/ლილო|lilo/i.test(v)) return "ლილო";
  if (/დიღომ|digom/i.test(v)) return "დიღომი";
  if (/დისტრიბუც|დისტრიბუტ|distrib/i.test(v)) return "დისტრიბუცია";
  return null;
}

/** პოზიციიდან ფილიალის გამოტანა (მაგ. „ლილო კონსულტანტი“, „დისტრიბუტორი“) */
function branchFromPosition(position: string): Branch | null {
  return parseBranch(position);
}

function findCol(header: string[], patterns: RegExp[]) {
  return header.findIndex((h) => patterns.some((p) => p.test(h)));
}

export function parseEmployeesExcel(buffer: Buffer, defaultBranch: Branch = "ქუთაისი"): Employee[] {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
  if (!rows.length) return [];

  const header = rows[0].map((c) => normalizeHeader(String(c ?? "")));
  const nameIdx = findCol(header, [/სახელი/, /გვარი/, /name/, /თანამშრომ/]);
  const branchIdx = findCol(header, [/ფილიალ/, /branch/]);
  const positionIdx = findCol(header, [/პოზიც/, /position/, /თანამდებობ/]);
  const wageIdx = findCol(header, [/ხელფას/, /ფას/, /wage/, /დღიურ/]);

  const out: Employee[] = [];
  const startRow = nameIdx >= 0 ? 1 : 0;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    let name = "";
    let branch = defaultBranch;
    let dailyWage = 0;

    if (nameIdx >= 0) {
      name = String(row[nameIdx] ?? "").trim();
      if (branchIdx >= 0) {
        const b = parseBranch(String(row[branchIdx] ?? ""));
        if (b) branch = b;
      }
      if (positionIdx >= 0 && branch === defaultBranch) {
        const fromPos = branchFromPosition(String(row[positionIdx] ?? ""));
        if (fromPos) branch = fromPos;
      }
      if (wageIdx >= 0) {
        dailyWage = parseFloat(String(row[wageIdx] ?? "").replace(",", ".")) || 0;
      }
    } else {
      name = String(row[0] ?? "").trim();
      const b = parseBranch(String(row[1] ?? ""));
      if (b) branch = b;
      dailyWage = parseFloat(String(row[2] ?? "").replace(",", ".")) || 0;
    }

    if (!name || name.length < 2) continue;
    out.push({
      id: uid(),
      name,
      branch,
      dailyWage,
      active: true,
    });
  }

  return out;
}

export function mergeEmployeeImport(existing: Employee[], incoming: Employee[]): { merged: Employee[]; added: number } {
  const merged = [...existing];
  const keys = new Set(existing.map((e) => e.name.trim().toLowerCase()));
  let added = 0;
  for (const e of incoming) {
    const key = e.name.trim().toLowerCase();
    if (keys.has(key)) continue;
    keys.add(key);
    merged.push(e);
    added++;
  }
  return { merged, added };
}

export function buildEmployeesWorkbook(employees: Employee[]): Buffer {
  const rows = employees.map((e, i) => ({
    N: i + 1,
    "სახელი და გვარი": e.name,
    ფილიალი: e.branch,
    "დღიური ხელფასი": e.dailyWage,
    სტატუსი: e.active ? "აქტიური" : "გაუქმებული",
  }));
  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ შეტყობინება: "თანამშრომლები არ არის" }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "თანამშრომლები");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
