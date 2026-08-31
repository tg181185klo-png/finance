import * as XLSX from "xlsx";
import type { Branch, Deposit, DepositKind, Expense, ExpenseCategory } from "./types";
import { resolveExpenseBranchFromText } from "./branch-allocation";

export type ParsedExpenseRow = {
  rowIndex: number;
  date: string;
  branch: Branch;
  category: ExpenseCategory;
  amount: number;
  comment: string;
  label: string;
  account: string;
};

function normHeader(h: unknown): string {
  return String(h ?? "").trim().toLowerCase();
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function findCol(headers: string[], ...keys: string[]): number {
  for (let i = 0; i < headers.length; i += 1) {
    const h = normHeader(headers[i]);
    if (keys.some((k) => h.includes(k))) return i;
  }
  return -1;
}

/** ბოლო „სახელი“ სვეტი — კატეგორიის ველი (პირველი ანგარიშია) */
function findLabelCol(headers: string[]): number {
  let last = -1;
  for (let i = 0; i < headers.length; i += 1) {
    if (normHeader(headers[i]).includes("სახელ")) last = i;
  }
  return last;
}

export function detectDefaultBranchFromFileName(fileName: string): Branch | null {
  const n = fileName.toLowerCase();
  if (/დისტრიბუც|distrib/.test(n)) return "დისტრიბუცია";
  if (/ქუთაის|kutais|kut/.test(n)) return "ქუთაისი";
  if (/ლილო|lilo/.test(n)) return "ლილო";
  if (/დიღომ|digom|dig/.test(n)) return "დიღომი";
  return null;
}

export function resolveExpenseBranch(label: string, comment: string, defaultBranch: Branch): Branch {
  return resolveExpenseBranchFromText(label, comment, defaultBranch);
}

export function mapExpenseCategory(label: string, comment: string): ExpenseCategory {
  const text = `${label} ${comment}`.toLowerCase();

  if (/ხელფას/i.test(text)) return "ხელფასი";
  if (/დღგ/i.test(text)) return "დღგ";
  if (/სესხ/i.test(text)) return "სესხი";
  if (/დივიდენდ/i.test(text)) return "სხვა";
  if (/ნედლეულ/i.test(text)) return "ნედლეული";
  if (/საწარმო|წარმოებ/i.test(text)) return "წარმოება";
  if (/საკვები|კვებ/i.test(text)) return "საკვები";
  if (/საყოფაცხოვრებ|დასუფთავ/i.test(text)) return "საყოფაცხოვრებო";
  if (/ელ\.?\s*ენერგ|კომუნალ|წყალი/i.test(text)) return "კომუნალური";
  if (/საწვავ/i.test(text)) return "ლოგისტიკა";
  if (/ტრანსპორტ|შემოტან|ტაქს/i.test(text)) return "ლოგისტიკა";
  if (/^დისტრიბუცია$/i.test(label.trim()) || (/დისტრიბუც/i.test(label) && !/ხელფას/i.test(label))) {
    return "დისტრიბუცია";
  }

  return "სხვა";
}

export function parseExpenseDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const d = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H ?? 12, parsed.M ?? 0, parsed.S ?? 0));
      return d.toISOString();
    }
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);
    const year = Number(m[3]);
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }

  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

function fileSlug(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9\u10A0-\u10FF]+/g, "_").slice(0, 48);
}

export type ParsedDepositRow = {
  rowIndex: number;
  date: string;
  branch: Branch;
  kind: DepositKind;
  amount: number;
  comment: string;
  label: string;
  account: string;
};

export function mapDepositKind(label: string, comment: string): DepositKind {
  const text = `${label} ${comment}`.toLowerCase();
  if (/დამფუძნებ|შენატან/i.test(text)) return "founder";
  if (/ვალ.*დაბრუნ|სესხ/i.test(text)) return "loan_repayment";
  if (/^შემოტან/i.test(label.trim())) return "founder";
  return "other";
}

export function importDepositId(month: string, slug: string, rowIndex: number) {
  return `import-dep-${month}-${slug}-${rowIndex}`;
}

export function isFileMonthDepositImport(deposit: Deposit, month: string, slug: string) {
  return deposit.source === "import" && deposit.id.startsWith(`import-dep-${month}-${slug}-`);
}

export function isFileMonthExpenseImport(expense: Expense, month: string, slug: string) {
  return expense.source === "import" && expense.id.startsWith(`import-exp-${month}-${slug}-`);
}

/** ხარჯების Excel: სახელი, ტიპი, კომენტარი, თანხა, თარიღი, სახელი */
export function parseExpenseExcel(
  buffer: Buffer,
  opts: { defaultBranch: Branch; month: string; fileName: string }
): {
  rows: ParsedExpenseRow[];
  deposits: ParsedDepositRow[];
  skipped: number;
  outOfMonth: number;
} {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Excel ფაილი ცარიელია");
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }) as unknown[][];
  if (rows.length < 2) throw new Error("Excel-ში მონაცემები არ არის");

  const headers = rows[0].map(String);
  const typeCol = findCol(headers, "ტიპ");
  const commentCol = findCol(headers, "კომენტარ");
  const amountCol = findCol(headers, "თანხ");
  const dateCol = findCol(headers, "თარიღ");
  const labelCol = findLabelCol(headers);
  const accountCol = headers.findIndex((h, i) => normHeader(h).includes("სახელ") && i !== labelCol);

  if (typeCol < 0 || amountCol < 0 || dateCol < 0) {
    throw new Error("ვერ მოიძებნა საჭირო სვეტები (ტიპი, თანხა, თარიღი)");
  }
  if (labelCol < 0) throw new Error("ვერ მოიძებნა კატეგორიის სვეტი „სახელი“");

  const out: ParsedExpenseRow[] = [];
  const deposits: ParsedDepositRow[] = [];
  let skipped = 0;
  let outOfMonth = 0;

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row?.length) continue;

    const txType = String(row[typeCol] ?? "").trim();
    const rawAmount = num(row[amountCol]);
    const amount = Math.round(Math.abs(rawAmount) * 100) / 100;
    const label = String(row[labelCol] ?? "").trim();
    const comment = commentCol >= 0 ? String(row[commentCol] ?? "").trim() : "";
    const account = accountCol >= 0 ? String(row[accountCol] ?? "").trim() : "";
    const date = parseExpenseDate(row[dateCol]);

    if (txType === "მიღება") {
      if (!amount || !date) {
        skipped += 1;
        continue;
      }
      if (date.slice(0, 7) !== opts.month) {
        outOfMonth += 1;
        continue;
      }
      const branch = resolveExpenseBranch(label, comment, opts.defaultBranch);
      const kind = mapDepositKind(label, comment);
      const fullComment = comment || label || account || kind;
      deposits.push({
        rowIndex: r,
        date,
        branch,
        kind,
        amount,
        comment: fullComment,
        label,
        account,
      });
      continue;
    }

    if (txType && txType !== "გაცემა") {
      skipped += 1;
      continue;
    }

    if (!amount) {
      skipped += 1;
      continue;
    }

    if (!date) {
      skipped += 1;
      continue;
    }
    if (date.slice(0, 7) !== opts.month) {
      outOfMonth += 1;
      continue;
    }

    const branch = resolveExpenseBranch(label, comment, opts.defaultBranch);
    const category = mapExpenseCategory(label, comment);
    const fullComment = comment || label || account || category;

    out.push({
      rowIndex: r,
      date,
      branch,
      category,
      amount,
      comment: fullComment,
      label,
      account,
    });
  }

  if (!out.length && !deposits.length) {
    throw new Error(
      outOfMonth > 0
        ? `არჩეულ თვეში (${opts.month}) ხარჯის/შენატანის ხაზები ვერ მოიძებნა`
        : "ვალიდური ხარჯის ან შენატანის ხაზები ვერ მოიძებნა"
    );
  }

  return { rows: out, deposits, skipped, outOfMonth };
}

export function buildImportDeposits(
  rows: ParsedDepositRow[],
  opts: { month: string; fileLabel: string; fileSlug: string }
): Deposit[] {
  const commentPrefix = `Excel შენატანი · ${opts.month} · ${opts.fileLabel}`;

  return rows.map((row) => ({
    id: importDepositId(opts.month, opts.fileSlug, row.rowIndex),
    type: "deposit" as const,
    date: row.date,
    branch: row.branch,
    kind: row.kind,
    amount: row.amount,
    comment: row.comment ? `${row.comment} · ${commentPrefix}` : commentPrefix,
    recurrence: "ერთჯერადი" as const,
    source: "import" as const,
    depositPaymentMethod: "ქეში (ნაღდი)" as const,
  }));
}

export function summarizeDepositImport(rows: ParsedDepositRow[]) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const founder = rows.filter((r) => r.kind === "founder").reduce((s, r) => s + r.amount, 0);
  const byBranch = {} as Record<Branch, { count: number; total: number; founder: number }>;
  for (const row of rows) {
    if (!byBranch[row.branch]) byBranch[row.branch] = { count: 0, total: 0, founder: 0 };
    byBranch[row.branch].count += 1;
    byBranch[row.branch].total += row.amount;
    if (row.kind === "founder") byBranch[row.branch].founder += row.amount;
  }
  return { lines: rows.length, total, founder, byBranch };
}

export function importExpenseId(month: string, slug: string, rowIndex: number) {
  return `import-exp-${month}-${slug}-${rowIndex}`;
}

export function buildImportExpenses(
  rows: ParsedExpenseRow[],
  opts: { month: string; fileLabel: string; fileSlug: string }
): Expense[] {
  const commentPrefix = `Excel ხარჯი · ${opts.month} · ${opts.fileLabel}`;

  return rows.map((row) => ({
    id: importExpenseId(opts.month, opts.fileSlug, row.rowIndex),
    type: "expense" as const,
    date: row.date,
    branch: row.branch,
    category: row.category,
    amount: row.amount,
    comment: row.comment ? `${row.comment} · ${commentPrefix}` : commentPrefix,
    recurrence: "ერთჯერადი" as const,
    source: "import" as const,
    expensePaymentMethod: "ქეში (ნაღდი)" as const,
  }));
}

export function summarizeExpenseImport(rows: ParsedExpenseRow[]) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const byBranch = {} as Record<Branch, { count: number; total: number }>;
  for (const row of rows) {
    if (!byBranch[row.branch]) byBranch[row.branch] = { count: 0, total: 0 };
    byBranch[row.branch].count += 1;
    byBranch[row.branch].total += row.amount;
  }
  return { lines: rows.length, total, byBranch };
}

export function slugFromFileName(fileName: string) {
  return fileSlug(fileName);
}
