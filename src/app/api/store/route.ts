import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { readStore, readStoreRevision } from "@/lib/server-store";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  try {
    if (req.nextUrl.searchParams.get("rev") === "1") {
      const updatedAt = await readStoreRevision();
      return NextResponse.json({ updatedAt }, { headers: noStore });
    }
    const store = await readStore();
    const updatedAt = await readStoreRevision();
    return NextResponse.json(store, {
      headers: {
        ...noStore,
        ...(updatedAt ? { "X-Store-Updated-At": updatedAt } : {}),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    // ცარიელ store-ს აღარ ვაბრუნებთ წარმატებულ პასუხად — UI არ უნდა იფიქროს რომ ბაზა ცარიელია
    return NextResponse.json(
      { error: msg },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
