import postgres from "postgres";
import type { PeriodReport } from "./types";
import { hasPostgres, postgresUrl } from "./db";

export type ReportSnapshotMeta = {
  id: string;
  title: string;
  reportType: "period" | "financial_summary";
  fromDate: string;
  toDate: string;
  branch: string;
  createdAt: string;
  revenue: number;
  expenses: number;
  net: number;
};

export type ReportSnapshot = ReportSnapshotMeta & {
  payload: PeriodReport;
};

let sql: ReturnType<typeof postgres> | null = null;

function getSql() {
  if (!sql) {
    const url = postgresUrl();
    if (!url) throw new Error("Postgres URL not configured");
    sql = postgres(url, {
      prepare: false,
      ssl: "require",
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return sql;
}

let snapshotsReady = false;

async function ensureSnapshotsTable() {
  if (snapshotsReady) return;
  const db = getSql();
  await db`
    CREATE TABLE IF NOT EXISTS report_snapshots (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      report_type TEXT NOT NULL,
      from_date DATE NOT NULL,
      to_date DATE NOT NULL,
      branch TEXT NOT NULL DEFAULT 'ყველა',
      payload JSONB NOT NULL,
      revenue NUMERIC NOT NULL DEFAULT 0,
      expenses NUMERIC NOT NULL DEFAULT 0,
      net NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS report_snapshots_created_at_idx
    ON report_snapshots (created_at DESC)
  `;
  snapshotsReady = true;
}

export function canSaveSnapshots() {
  return hasPostgres();
}

export async function saveReportSnapshot(
  title: string,
  report: PeriodReport,
  reportType: "period" | "financial_summary" = "period"
): Promise<ReportSnapshotMeta> {
  if (!hasPostgres()) throw new Error("ბაზა არ არის კონფიგურირებული — POSTGRES_URL საჭიროა");
  await ensureSnapshotsTable();
  const db = getSql();
  const id = `rs-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const payload = JSON.parse(JSON.stringify(report)) as postgres.JSONValue;
  await db`
    INSERT INTO report_snapshots (
      id, title, report_type, from_date, to_date, branch,
      payload, revenue, expenses, net, created_at
    ) VALUES (
      ${id},
      ${title},
      ${reportType},
      ${report.from},
      ${report.to},
      ${report.branch},
      ${db.json(payload)},
      ${report.revenue},
      ${report.expenses},
      ${report.net},
      NOW()
    )
  `;
  const rows = await db`
    SELECT id, title, report_type, from_date, to_date, branch,
           revenue, expenses, net, created_at
    FROM report_snapshots WHERE id = ${id}
  `;
  const row = rows[0];
  return {
    id: row.id as string,
    title: row.title as string,
    reportType: row.report_type as ReportSnapshotMeta["reportType"],
    fromDate: String(row.from_date).slice(0, 10),
    toDate: String(row.to_date).slice(0, 10),
    branch: row.branch as string,
    createdAt: new Date(row.created_at as string).toISOString(),
    revenue: Number(row.revenue),
    expenses: Number(row.expenses),
    net: Number(row.net),
  };
}

export async function listReportSnapshots(limit = 50): Promise<ReportSnapshotMeta[]> {
  if (!hasPostgres()) return [];
  await ensureSnapshotsTable();
  const db = getSql();
  const rows = await db`
    SELECT id, title, report_type, from_date, to_date, branch,
           revenue, expenses, net, created_at
    FROM report_snapshots
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id as string,
    title: row.title as string,
    reportType: row.report_type as ReportSnapshotMeta["reportType"],
    fromDate: String(row.from_date).slice(0, 10),
    toDate: String(row.to_date).slice(0, 10),
    branch: row.branch as string,
    createdAt: new Date(row.created_at as string).toISOString(),
    revenue: Number(row.revenue),
    expenses: Number(row.expenses),
    net: Number(row.net),
  }));
}

export async function getReportSnapshot(id: string): Promise<ReportSnapshot | null> {
  if (!hasPostgres()) return null;
  await ensureSnapshotsTable();
  const db = getSql();
  const rows = await db`
    SELECT id, title, report_type, from_date, to_date, branch,
           payload, revenue, expenses, net, created_at
    FROM report_snapshots WHERE id = ${id}
  `;
  if (!rows.length) return null;
  const row = rows[0];
  return {
    id: row.id as string,
    title: row.title as string,
    reportType: row.report_type as ReportSnapshotMeta["reportType"],
    fromDate: String(row.from_date).slice(0, 10),
    toDate: String(row.to_date).slice(0, 10),
    branch: row.branch as string,
    createdAt: new Date(row.created_at as string).toISOString(),
    revenue: Number(row.revenue),
    expenses: Number(row.expenses),
    net: Number(row.net),
    payload: row.payload as PeriodReport,
  };
}

export async function deleteReportSnapshot(id: string): Promise<boolean> {
  if (!hasPostgres()) return false;
  await ensureSnapshotsTable();
  const db = getSql();
  const rows = await db`DELETE FROM report_snapshots WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}
