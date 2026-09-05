import * as XLSX from "xlsx";
import type { Transaction } from "./types";
import { saleGroupKey, saleGroupLabel } from "./branch-payments";
import { isCreditOrder, isCreditOrderActive, txPaymentMethod } from "./utils";
import { BANK_METHOD, CARD_METHOD } from "./bank-ledger";

export type StatementDirection = "in" | "out";

export type BankStatementLine = {
  key: string;
  date: string;
  documentNo: string;
  debit: number;
  credit: number;
  amount: number;
  direction: StatementDirection;
  description: string;
  opType: string;
  opId: string;
  senderName: string;
  purpose: string;
  /** ბარათის გადახდაზე აღწერიდან ამოღებული სრული თანხა (საკომისიომდე) */
  grossAmount: number | null;
  /** შედარებისთვის: gross ან credit/debit */
  matchAmount: number;
};

export type MatchCandidate = {
  key: string;
  ids: string[];
  date: string;
  amount: number;
  channel: "card" | "bank";
  label: string;
  buyerName: string;
};

export type StatementMatchRow = {
  line: BankStatementLine;
  status: "matched" | "unmatched" | "skipped";
  candidate: MatchCandidate | null;
  note: string;
};

export type AppUnmatchedRow = {
  candidate: MatchCandidate;
  note: string;
};

export type BankStatementMatchResult = {
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  lines: BankStatementLine[];
  matches: StatementMatchRow[];
  appUnmatched: AppUnmatchedRow[];
  summary: {
    credits: number;
    matched: number;
    unmatched: number;
    skipped: number;
    appMissingInStatement: number;
    matchedIds: string[];
  };
};

function excelSerialToIso(n: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
  return d.toISOString().slice(0, 10);
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function cellNum(v: unknown): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/\s/g, "").replace(",", ".");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDdMmYyyy(raw: string): string | null {
  const m = raw.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (!m) return null;
  const dd = m[1].padStart(2, "0");
  const mm = m[2].padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

function parsePeriod(raw: string): { from: string; to: string } | null {
  const m = raw.match(/(\d{1,2}[./]\d{1,2}[./]\d{4})\s*[-–—]\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/);
  if (!m) return null;
  const from = parseDdMmYyyy(m[1]);
  const to = parseDdMmYyyy(m[2]);
  if (!from || !to) return null;
  return { from, to };
}

function extractGrossFromDescription(desc: string): number | null {
  const m = desc.match(/თანხა\s*:\s*GEL\s*([\d\s.,]+)/i) || desc.match(/თანხა:\s*GEL\s*([\d\s.,]+)/i);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractPaymentDate(desc: string): string | null {
  const m = desc.match(/თარიღი\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  if (!m) return null;
  return parseDdMmYyyy(m[1].replace(/\//g, "."));
}

function amountsClose(a: number, b: number, tol = 0.02): boolean {
  return Math.abs(a - b) <= tol;
}

function daysApart(a: string, b: string): number {
  const da = Date.parse(`${a}T12:00:00Z`);
  const db = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999;
  return Math.abs(da - db) / 86400000;
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i] ?? [];
    const joined = row.map((c) => cellStr(c).toLowerCase()).join("|");
    if (joined.includes("თარიღი") && (joined.includes("კრედიტი") || joined.includes("დებეტი"))) {
      return i;
    }
  }
  return -1;
}

export function parseBankStatementExcel(buffer: Buffer): {
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  lines: BankStatementLine[];
} {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Excel ფაილი ცარიელია");
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];

  let periodLabel = "";
  let periodFrom = "";
  let periodTo = "";
  for (const row of rows.slice(0, 15)) {
    for (let i = 0; i < row.length; i++) {
      if (cellStr(row[i]).includes("პერიოდი") && row[i + 1] != null) {
        periodLabel = cellStr(row[i + 1]);
        const p = parsePeriod(periodLabel);
        if (p) {
          periodFrom = p.from;
          periodTo = p.to;
        }
      }
    }
  }

  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) throw new Error("ამონაწერში ცხრილის სათაური ვერ მოიძებნა");

  const lines: BankStatementLine[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const dateRaw = row[0];
    if (dateRaw === "" || dateRaw == null) continue;

    let date = "";
    if (typeof dateRaw === "number") date = excelSerialToIso(dateRaw);
    else date = parseDdMmYyyy(cellStr(dateRaw)) ?? "";
    if (!date) continue;

    const documentNo = cellStr(row[1]);
    const debit = cellNum(row[3]);
    const credit = cellNum(row[4]);
    const description = cellStr(row[5]);
    const opType = cellStr(row[6]);
    const opId = cellStr(row[7]);
    const senderName = cellStr(row[9]) || cellStr(row[26]);
    const purpose = cellStr(row[19]) || cellStr(row[20]);
    const amountCell = cellNum(row[21]);

    const direction: StatementDirection = credit > 0 ? "in" : "out";
    const signed =
      amountCell !== 0
        ? amountCell
        : credit > 0
          ? credit
          : debit > 0
            ? -debit
            : 0;
    if (signed === 0 && credit === 0 && debit === 0) continue;

    const grossAmount = direction === "in" ? extractGrossFromDescription(description) : null;
    const payDate = extractPaymentDate(description);
    if (payDate) date = payDate;

    const absAmount = Math.abs(signed) || credit || debit;
    const matchAmount = grossAmount ?? (direction === "in" ? credit || absAmount : debit || absAmount);

    lines.push({
      key: `${date}|${opId || documentNo}|${absAmount}|${i}`,
      date,
      documentNo,
      debit,
      credit,
      amount: absAmount,
      direction,
      description,
      opType,
      opId,
      senderName,
      purpose,
      grossAmount,
      matchAmount,
    });
  }

  if (!periodFrom && lines.length) {
    const dates = lines.map((l) => l.date).sort();
    periodFrom = dates[0];
    periodTo = dates[dates.length - 1];
    periodLabel = periodLabel || `${periodFrom} — ${periodTo}`;
  }

  return { periodLabel, periodFrom, periodTo, lines };
}

/** აპში ბარათი/ანგარიშის შემოსავლები (გაყიდვა ჯგუფებით + შენატანი) */
export function buildMatchCandidates(transactions: Transaction[], from: string, to: string): MatchCandidate[] {
  const padFrom = addDays(from, -2);
  const padTo = addDays(to, 2);
  const salesByGroup = new Map<string, Extract<Transaction, { type: "sale" }>[]>();
  const deposits: MatchCandidate[] = [];

  for (const t of transactions) {
    const d = t.date.slice(0, 10);
    if (d < padFrom || d > padTo) continue;
    const method = txPaymentMethod(t);
    if (method !== CARD_METHOD && method !== BANK_METHOD) continue;

    if (t.type === "sale") {
      if (isCreditOrder(t) && isCreditOrderActive(t)) continue;
      const key = saleGroupKey(t);
      const list = salesByGroup.get(key) ?? [];
      list.push(t);
      salesByGroup.set(key, list);
      continue;
    }

    if (t.type === "deposit") {
      deposits.push({
        key: `dep:${t.id}`,
        ids: [t.id],
        date: d,
        amount: t.amount,
        channel: method === CARD_METHOD ? "card" : "bank",
        label: t.comment?.trim() || (t.kind === "founder" ? "დამფუძნებლის შენატანი" : "შენატანი"),
        buyerName: t.comment?.trim() || "",
      });
    }
  }

  const out: MatchCandidate[] = [...deposits];

  for (const [gKey, sales] of salesByGroup) {
    const amount = sales.reduce((s, x) => s + x.amount, 0);
    const primary = [...sales].sort((a, b) => b.date.localeCompare(a.date))[0];
    const method = txPaymentMethod(primary);
    out.push({
      key: gKey,
      ids: sales.map((s) => s.id),
      date: primary.date.slice(0, 10),
      amount,
      channel: method === CARD_METHOD ? "card" : "bank",
      label: saleGroupLabel(primary),
      buyerName: primary.buyerName?.trim() || "",
    });
  }

  return out;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function scoreMatch(line: BankStatementLine, c: MatchCandidate): number {
  if (!amountsClose(line.matchAmount, c.amount) && !amountsClose(line.amount, c.amount)) {
    return -1;
  }
  const dayGap = daysApart(line.date, c.date);
  if (dayGap > 2) return -1;

  let score = 100 - dayGap * 10;
  if (amountsClose(line.matchAmount, c.amount)) score += 20;
  else if (amountsClose(line.amount, c.amount)) score += 5;

  if (line.opType === "TRN" && c.channel === "card") score += 15;
  if (line.opType === "PMD" && c.channel === "bank") score += 15;

  const sender = line.senderName.toLowerCase();
  const buyer = c.buyerName.toLowerCase();
  if (sender && buyer && (sender.includes(buyer) || buyer.includes(sender))) score += 25;

  return score;
}

function shouldSkipCredit(line: BankStatementLine): { skip: boolean; note: string } {
  if (line.direction !== "in") return { skip: true, note: "გასავალი — შედარება შემოსავლებზე" };
  if (line.opType === "CCO") return { skip: true, note: "ვალუტის გაცვლა — გამოტოვებული" };
  const desc = line.description.toLowerCase();
  if (desc.includes("ვალუტის გაცვლ")) return { skip: true, note: "ვალუტის გაცვლა — გამოტოვებული" };
  return { skip: false, note: "" };
}

export function matchBankStatement(
  lines: BankStatementLine[],
  candidates: MatchCandidate[],
  periodFrom: string,
  periodTo: string
): { matches: StatementMatchRow[]; appUnmatched: AppUnmatchedRow[] } {
  const used = new Set<string>();
  const matches: StatementMatchRow[] = [];

  const credits = lines.filter((l) => l.direction === "in");

  // უკეთესი ქულის მატჩები ჯერ
  type Pair = { line: BankStatementLine; candidate: MatchCandidate; score: number };
  const pairs: Pair[] = [];
  for (const line of credits) {
    const skip = shouldSkipCredit(line);
    if (skip.skip) continue;
    for (const c of candidates) {
      const score = scoreMatch(line, c);
      if (score >= 0) pairs.push({ line, candidate: c, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const lineMatched = new Map<string, MatchCandidate>();
  for (const p of pairs) {
    if (lineMatched.has(p.line.key) || used.has(p.candidate.key)) continue;
    lineMatched.set(p.line.key, p.candidate);
    used.add(p.candidate.key);
  }

  for (const line of lines) {
    const skip = shouldSkipCredit(line);
    if (skip.skip) {
      matches.push({ line, status: "skipped", candidate: null, note: skip.note });
      continue;
    }
    const c = lineMatched.get(line.key) ?? null;
    if (c) {
      matches.push({
        line,
        status: "matched",
        candidate: c,
        note: `${c.channel === "card" ? "ბარათი" : "ანგარიში"} · ${c.label}`,
      });
    } else {
      matches.push({
        line,
        status: "unmatched",
        candidate: null,
        note: "აპში შესაბამისი ჩანაწერი ვერ მოიძებნა",
      });
    }
  }

  const appUnmatched: AppUnmatchedRow[] = candidates
    .filter((c) => !used.has(c.key) && c.date >= periodFrom && c.date <= periodTo)
    .map((c) => ({
      candidate: c,
      note: "ამონაწერში ეს თანხა არ ჩანს",
    }));

  return { matches, appUnmatched };
}

export function runBankStatementMatch(buffer: Buffer, transactions: Transaction[]): BankStatementMatchResult {
  const parsed = parseBankStatementExcel(buffer);
  const candidates = buildMatchCandidates(transactions, parsed.periodFrom, parsed.periodTo);
  const { matches, appUnmatched } = matchBankStatement(
    parsed.lines,
    candidates,
    parsed.periodFrom,
    parsed.periodTo
  );

  const matchedIds = [
    ...new Set(
      matches.filter((m) => m.status === "matched" && m.candidate).flatMap((m) => m.candidate!.ids)
    ),
  ];

  return {
    periodLabel: parsed.periodLabel,
    periodFrom: parsed.periodFrom,
    periodTo: parsed.periodTo,
    lines: parsed.lines,
    matches,
    appUnmatched,
    summary: {
      credits: matches.filter((m) => m.line.direction === "in" && m.status !== "skipped").length,
      matched: matches.filter((m) => m.status === "matched").length,
      unmatched: matches.filter((m) => m.status === "unmatched").length,
      skipped: matches.filter((m) => m.status === "skipped").length,
      appMissingInStatement: appUnmatched.length,
      matchedIds,
    },
  };
}
