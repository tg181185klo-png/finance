import * as XLSX from "xlsx";
import type { Transaction } from "./types";
import { saleGroupKey, saleGroupLabel } from "./branch-payments";
import { isCreditOrder, isCreditOrderActive, txPaymentMethod } from "./utils";
import { BANK_METHOD, CARD_METHOD } from "./bank-ledger";

export type StatementDirection = "in" | "out";

export type BankStatementLine = {
  key: string;
  /** ბანკის ამონაწერის თარიღი (სვეტი) */
  statementDate: string;
  /** გადახდის/ოპერაციის თარიღი (აღწერიდან თუ არის, სხვა შემთხვევაში statementDate) */
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
  branch: string;
  direction: StatementDirection;
  kind: "sale" | "deposit" | "expense";
  label: string;
  buyerName: string;
};

export type StatementMatchRow = {
  line: BankStatementLine;
  status: "matched" | "unmatched" | "skipped";
  candidate: MatchCandidate | null;
  note: string;
  /** აპის თანხა − ამონაწერში ჩარიცხული (საკომისიო/სხვაობა) */
  commission: number | null;
};

export type AppUnmatchedRow = {
  candidate: MatchCandidate;
  note: string;
};

/** ტრანზაქციის id → ამონაწერის შედარების ინფო (მოძრაობის ცხრილისთვის) */
export type StatementLedgerHint = {
  statementDate: string;
  statementSender: string;
  statementAmount: number;
  commission: number | null;
  status: "matched" | "unmatched";
};

export type BankStatementMatchResult = {
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  lines: BankStatementLine[];
  matches: StatementMatchRow[];
  appUnmatched: AppUnmatchedRow[];
  hints: Record<string, StatementLedgerHint>;
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

/** ამონაწერიდან კონტრაგენტი: შემოსავალზე გადმომრიცხავი, გასავალზე მიმღები */
function extractCounterpartyName(
  direction: StatementDirection,
  partyCol: string,
  description: string,
  purpose: string
): string {
  const fromCol = partyCol.replace(/\s+/g, " ").trim();
  if (fromCol && !/^\d+$/.test(fromCol)) return fromCol;

  const sources = [description, purpose].filter(Boolean);
  const patterns =
    direction === "in"
      ? [
          /გადმ?ომრიცხავი\s*[:：]\s*([^\n|;]+)/i,
          /გადამრიცხავი\s*[:：]\s*([^\n|;]+)/i,
          /payer\s*(?:name)?\s*[:：]\s*([^\n|;]+)/i,
          /from\s*[:：]\s*([^\n|;]+)/i,
        ]
      : [
          /მიმღები\s*[:：]\s*([^\n|;]+)/i,
          /ბენეფიციარი\s*[:：]\s*([^\n|;]+)/i,
          /beneficiary\s*[:：]\s*([^\n|;]+)/i,
          /to\s*[:：]\s*([^\n|;]+)/i,
          /გადმ?ომრიცხავი\s*[:：]\s*([^\n|;]+)/i,
        ];

  for (const src of sources) {
    for (const re of patterns) {
      const m = src.match(re);
      if (m?.[1]) {
        const name = m[1].replace(/\s+/g, " ").trim();
        if (name) return name;
      }
    }
  }

  if (purpose.replace(/\s+/g, " ").trim()) return purpose.replace(/\s+/g, " ").trim();
  // აღწერიდან პირველი აზრიანი ნაწილი (ხშირად იქ არის სახელი)
  const cleaned = description
    .replace(/\s+/g, " ")
    .replace(/თანხა\s*:\s*GEL\s*[\d\s.,]+/gi, "")
    .replace(/თარიღი\s*:\s*\d{1,2}\/\d{1,2}\/\d{4}/gi, "")
    .trim();
  if (cleaned.length >= 3 && cleaned.length <= 120) return cleaned;
  return fromCol;
}

function amountsClose(a: number, b: number, tol = 0.05): boolean {
  return Math.abs(a - b) <= tol;
}

/** საკომისიოს გათვალისწინებით: ამონაწერის თანხა შეიძლება აპის თანხაზე ნაკლები იყოს */
function amountsCompatible(statementAmt: number, appAmt: number): boolean {
  if (amountsClose(statementAmt, appAmt)) return true;
  if (appAmt <= 0 || statementAmt <= 0) return false;
  const diff = Math.abs(appAmt - statementAmt);
  const maxFee = Math.max(8, appAmt * 0.04);
  return diff <= maxFee;
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

type ColMap = {
  date: number;
  documentNo: number;
  debit: number;
  credit: number;
  description: number;
  opType: number;
  opId: number;
  party: number;
  purpose: number;
  amount: number;
};

function resolveColumns(headerRow: unknown[]): ColMap {
  const labels = headerRow.map((c) => cellStr(c).toLowerCase());
  const find = (...needles: string[]) => {
    for (let i = 0; i < labels.length; i++) {
      const h = labels[i];
      if (!h) continue;
      if (needles.some((n) => h.includes(n))) return i;
    }
    return -1;
  };

  const date = find("თარიღი");
  const documentNo = find("დოკუმენტ", "document");
  const debit = find("დებეტ");
  const credit = find("კრედიტ");
  const description = find("აღწერ", "დანიშნულ", "description", "comment");
  const opType = find("ოპერაციის ტიპ", "op. type", "operation type");
  const opId = find("ოპერაციის id", "operation id", "entry id");
  const party = find(
    "გადმომრიცხ",
    "გადამრიცხ",
    "მიმღებ",
    "კონტრაგენტ",
    "payer",
    "beneficiary",
    "correspondent",
    "დასახელება",
    "სახელი"
  );
  const purpose = find("დანიშნულების", "purpose", "additional");
  const amount = find("თანხა", "amount");

  return {
    date: date >= 0 ? date : 0,
    documentNo: documentNo >= 0 ? documentNo : 1,
    debit: debit >= 0 ? debit : 3,
    credit: credit >= 0 ? credit : 4,
    description: description >= 0 ? description : 5,
    opType: opType >= 0 ? opType : 6,
    opId: opId >= 0 ? opId : 7,
    party: party >= 0 ? party : 9,
    purpose: purpose >= 0 ? purpose : 19,
    amount: amount >= 0 ? amount : 21,
  };
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
  const cols = resolveColumns(rows[headerIdx] ?? []);

  const lines: BankStatementLine[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const dateRaw = row[cols.date];
    if (dateRaw === "" || dateRaw == null) continue;

    let statementDate = "";
    if (typeof dateRaw === "number") statementDate = excelSerialToIso(dateRaw);
    else statementDate = parseDdMmYyyy(cellStr(dateRaw)) ?? "";
    if (!statementDate) continue;

    const documentNo = cellStr(row[cols.documentNo]);
    const debit = cellNum(row[cols.debit]);
    const credit = cellNum(row[cols.credit]);
    const description = cellStr(row[cols.description]);
    const opType = cellStr(row[cols.opType]);
    const opId = cellStr(row[cols.opId]);
    // კონტრაგენტი — რამდენიმე სვეტიდან, თუ სათაური ვერ მოიძებნა
    const partyCol =
      cellStr(row[cols.party]) ||
      cellStr(row[9]) ||
      cellStr(row[10]) ||
      cellStr(row[11]) ||
      cellStr(row[26]) ||
      cellStr(row[8]);
    const purpose = cellStr(row[cols.purpose]) || cellStr(row[19]) || cellStr(row[20]);
    const amountCell = cellNum(row[cols.amount]);

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
    const date = payDate || statementDate;
    const senderName = extractCounterpartyName(direction, partyCol, description, purpose);

    const absAmount = Math.abs(signed) || credit || debit;
    const matchAmount = grossAmount ?? (direction === "in" ? credit || absAmount : debit || absAmount);

    lines.push({
      key: `${statementDate}|${opId || documentNo}|${absAmount}|${i}`,
      statementDate,
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

/** აპში ბარათი/ანგარიშის შემოსავლები და გასავლები */
export function buildMatchCandidates(transactions: Transaction[], from: string, to: string): MatchCandidate[] {
  const padFrom = addDays(from, -2);
  const padTo = addDays(to, 2);
  const salesByGroup = new Map<string, Extract<Transaction, { type: "sale" }>[]>();
  const deposits: MatchCandidate[] = [];
  const expensesByGroup = new Map<string, Extract<Transaction, { type: "expense" }>[]>();

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
        branch: t.branch,
        direction: "in",
        kind: "deposit",
        label: t.comment?.trim() || (t.kind === "founder" ? "დამფუძნებლის შენატანი" : "შენატანი"),
        buyerName: t.comment?.trim() || "",
      });
      continue;
    }

    if (t.type === "expense") {
      const gKey = t.obligationId
        ? `ob:${t.obligationId}:${d}:${method}`
        : `exp:${d}:${method}:${t.category}:${t.comment?.trim() || ""}:${t.amount}`;
      const list = expensesByGroup.get(gKey) ?? [];
      list.push(t);
      expensesByGroup.set(gKey, list);
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
      branch: primary.branch,
      direction: "in",
      kind: "sale",
      label: saleGroupLabel(primary),
      buyerName: primary.buyerName?.trim() || "",
    });
  }

  for (const [gKey, exps] of expensesByGroup) {
    const amount = exps.reduce((s, x) => s + x.amount, 0);
    const primary = [...exps].sort((a, b) => b.date.localeCompare(a.date))[0];
    const method = txPaymentMethod(primary);
    out.push({
      key: gKey,
      ids: exps.map((e) => e.id),
      date: primary.date.slice(0, 10),
      amount,
      channel: method === CARD_METHOD ? "card" : "bank",
      branch: String(primary.branch),
      direction: "out",
      kind: "expense",
      label: primary.comment?.trim() || primary.category,
      buyerName: primary.comment?.trim() || primary.category || "",
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
  if (line.direction !== c.direction) return -1;

  const statementAmts = [line.matchAmount, line.amount, line.credit, line.debit].filter((n) => n > 0);
  const amountOk = statementAmts.some((a) => amountsCompatible(a, c.amount));
  if (!amountOk) return -1;

  const dayGap = Math.min(daysApart(line.date, c.date), daysApart(line.statementDate, c.date));
  if (dayGap > 5) return -1;

  let score = 100 - dayGap * 8;
  if (amountsClose(line.matchAmount, c.amount) || amountsClose(line.amount, c.amount)) score += 25;
  else if (amountsCompatible(line.matchAmount, c.amount) || amountsCompatible(line.amount, c.amount)) {
    score += 10;
  }

  if (line.opType === "TRN" && c.channel === "card") score += 15;
  if ((line.opType === "PMD" || line.opType === "TPA") && c.channel === "bank") score += 15;

  const party = line.senderName.toLowerCase();
  const name = c.buyerName.toLowerCase();
  if (party && name) {
    const partyParts = party.split(/\s+/).filter((p) => p.length > 1);
    const nameParts = name.split(/\s+/).filter((p) => p.length > 1);
    const overlap = partyParts.some((p) => name.includes(p)) || nameParts.some((p) => party.includes(p));
    if (overlap) score += 25;
  }

  return score;
}

function shouldSkipLine(line: BankStatementLine): { skip: boolean; note: string } {
  if (line.opType === "CCO") return { skip: true, note: "ვალუტის გაცვლა — გამოტოვებული" };
  const desc = line.description.toLowerCase();
  if (desc.includes("ვალუტის გაცვლ")) return { skip: true, note: "ვალუტის გაცვლა — გამოტოვებული" };
  return { skip: false, note: "" };
}

function calcCommission(line: BankStatementLine, candidate: MatchCandidate | null): number | null {
  if (!candidate) return null;
  const bankAmt =
    line.direction === "in" ? line.credit || line.amount : line.debit || line.amount;
  const diff = Math.round((candidate.amount - bankAmt) * 100) / 100;
  if (Math.abs(diff) < 0.01) return null;
  return diff;
}

export function matchBankStatement(
  lines: BankStatementLine[],
  candidates: MatchCandidate[],
  periodFrom: string,
  periodTo: string
): { matches: StatementMatchRow[]; appUnmatched: AppUnmatchedRow[] } {
  const used = new Set<string>();
  const matches: StatementMatchRow[] = [];

  type Pair = { line: BankStatementLine; candidate: MatchCandidate; score: number };
  const pairs: Pair[] = [];
  for (const line of lines) {
    const skip = shouldSkipLine(line);
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
    const skip = shouldSkipLine(line);
    if (skip.skip) {
      matches.push({ line, status: "skipped", candidate: null, note: skip.note, commission: null });
      continue;
    }
    const c = lineMatched.get(line.key) ?? null;
    if (c) {
      matches.push({
        line,
        status: "matched",
        candidate: c,
        note: `${c.direction === "in" ? "შემოსავალი" : "გასავალი"} · ${c.channel === "card" ? "ბარათი" : "ანგარიში"} · ${c.branch} · ${c.label}`,
        commission: calcCommission(line, c),
      });
    } else {
      matches.push({
        line,
        status: "unmatched",
        candidate: null,
        note: "აპში შესაბამისი ჩანაწერი ვერ მოიძებნა",
        commission: null,
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

/** მოძრაობის ცხრილისთვის: ტრანზაქციის id → ამონაწერის მონაცემები */
export function buildStatementLedgerHints(matches: StatementMatchRow[]): Record<string, StatementLedgerHint> {
  const out: Record<string, StatementLedgerHint> = {};
  for (const m of matches) {
    if (m.status !== "matched" || !m.candidate) continue;
    const hint: StatementLedgerHint = {
      statementDate: m.line.statementDate || m.line.date,
      statementSender: m.line.senderName || "",
      statementAmount: m.line.credit || m.line.amount,
      commission: m.commission,
      status: "matched",
    };
    for (const id of m.candidate.ids) {
      out[id] = hint;
    }
  }
  return out;
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
  const hints = buildStatementLedgerHints(matches);

  return {
    periodLabel: parsed.periodLabel,
    periodFrom: parsed.periodFrom,
    periodTo: parsed.periodTo,
    lines: parsed.lines,
    matches,
    appUnmatched,
    hints,
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
