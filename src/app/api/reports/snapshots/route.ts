import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { buildPeriodReport } from "@/lib/utils";
import { readStore } from "@/lib/server-store";
import {
  canSaveSnapshots,
  deleteReportSnapshot,
  getReportSnapshot,
  listReportSnapshots,
  saveReportSnapshot,
} from "@/lib/report-snapshots";
import type { Branch } from "@/lib/types";

export async function GET(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const snapshot = await getReportSnapshot(id);
    if (!snapshot) {
      return NextResponse.json({ error: "რეპორტი ვერ მოიძებნა" }, { status: 404 });
    }
    return NextResponse.json(snapshot);
  }

  const snapshots = await listReportSnapshots();
  return NextResponse.json({
    snapshots,
    canSave: canSaveSnapshots(),
  });
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  if (!canSaveSnapshots()) {
    return NextResponse.json(
      { error: "ბაზა არ არის კონფიგურირებული — POSTGRES_URL საჭიროა რეპორტის შესანახად" },
      { status: 503 }
    );
  }

  const body = (await req.json()) as {
    title?: string;
    from?: string;
    to?: string;
    branch?: Branch | "ყველა";
  };

  const { from, to, branch = "ყველა" } = body;
  if (!from || !to) {
    return NextResponse.json({ error: "from და to სავალდებულოა" }, { status: 400 });
  }

  const store = await readStore();
  const report = buildPeriodReport(
    store.transactions,
    store.obligations,
    from,
    to,
    branch,
    store.branchCash
  );

  const title =
    body.title?.trim() ||
    `${from === to ? from : `${from} — ${to}`} · ${branch}`;

  const meta = await saveReportSnapshot(title, report);
  return NextResponse.json({ ok: true, snapshot: meta });
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id სავალდებულოა" }, { status: 400 });
  }

  const ok = await deleteReportSnapshot(id);
  if (!ok) {
    return NextResponse.json({ error: "რეპორტი ვერ მოიძებნა" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
