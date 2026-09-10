import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { ADMIN_PIN } from "@/lib/constants";
import { readStore, writeStore } from "@/lib/server-store";
import {
  canBackupStore,
  createStoreBackup,
  getStoreBackup,
  listStoreBackups,
} from "@/lib/store-backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  if (!canBackupStore()) {
    return NextResponse.json({ error: "ბექაპი მიუწვდომელია" }, { status: 503 });
  }

  const id = req.nextUrl.searchParams.get("id");
  const download = req.nextUrl.searchParams.get("download") === "1";

  if (id) {
    const bak = await getStoreBackup(id);
    if (!bak) return NextResponse.json({ error: "ბექაპი ვერ მოიძებნა" }, { status: 404 });
    if (download) {
      const body = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          backupId: bak.id,
          createdAt: bak.createdAt,
          reason: bak.reason,
          store: bak.payload,
        },
        null,
        2
      );
      const filename = `finance-backup-${bak.createdAt.slice(0, 10)}-${bak.id}.json`;
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(bak);
  }

  const backups = await listStoreBackups(60);
  return NextResponse.json({ ok: true, backups, canBackup: true });
}

export async function POST(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  if (!canBackupStore()) {
    return NextResponse.json({ error: "ბექაპი მიუწვდომელია" }, { status: 503 });
  }

  try {
    const body = (await req.json()) as {
      action?: "create" | "restore";
      backupId?: string;
      pin?: string;
    };

    if (body.action === "create" || !body.action) {
      const store = await readStore();
      const meta = await createStoreBackup(store, "manual", "admin");
      return NextResponse.json({ ok: true, backup: meta });
    }

    if (body.action === "restore") {
      if (!body.backupId) {
        return NextResponse.json({ error: "backupId საჭიროა" }, { status: 400 });
      }
      if (body.pin !== ADMIN_PIN) {
        return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
      }

      const bak = await getStoreBackup(body.backupId);
      if (!bak) return NextResponse.json({ error: "ბექაპი ვერ მოიძებნა" }, { status: 404 });

      // ჯერ მიმდინარე მდგომარეობის ასლი — შემთხვევითი აღდგენისგან დასაცავად
      const current = await readStore();
      await createStoreBackup(current, "pre-restore", "admin");
      await writeStore(bak.payload);

      return NextResponse.json({
        ok: true,
        restoredFrom: bak.id,
        transactions: bak.payload.transactions?.length ?? 0,
        employees: bak.payload.employees?.length ?? 0,
      });
    }

    return NextResponse.json({ error: "უცნობი action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "შეცდომა" },
      { status: 500 }
    );
  }
}
