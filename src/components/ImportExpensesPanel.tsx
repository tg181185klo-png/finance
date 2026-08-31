"use client";

import { useMemo, useState } from "react";
import type { Branch, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import { formatMoney } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-amber-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls = "rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium hover:bg-amber-500 disabled:opacity-40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

type PreviewRow = {
  date: string;
  branch: Branch;
  category: string;
  amount: number;
  comment: string;
  label: string;
};

type Preview = {
  lines: number;
  total: number;
  byBranch: Record<string, { count: number; total: number }>;
  sample: PreviewRow[];
  skipped: number;
  outOfMonth: number;
};

type Props = {
  unlocked: boolean;
  getAdminPin: () => string;
  onImported: (transactions: Transaction[]) => void;
  onHistoryRefresh: () => void;
};

function guessBranchFromFileName(name: string): Branch | null {
  const n = name.toLowerCase();
  if (/დისტრიბუც|distrib/.test(n)) return "დისტრიბუცია";
  if (/ქუთაის|kutais|kut/.test(n)) return "ქუთაისი";
  if (/ლილო|lilo/.test(n)) return "ლილო";
  if (/დიღომ|digom|dig/.test(n)) return "დიღომი";
  return null;
}

export default function ImportExpensesPanel({ unlocked, getAdminPin, onImported, onHistoryRefresh }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [branch, setBranch] = useState<Branch>("ქუთაისი");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const detectedBranch = useMemo(() => {
    if (files.length !== 1) return null;
    return guessBranchFromFileName(files[0].name);
  }, [files]);

  async function runImport(previewOnly: boolean) {
    if (!files.length) {
      setErr("აირჩიეთ Excel ფაილი");
      return;
    }
    if (!previewOnly && !unlocked) {
      setErr("იმპორტისთვის შეიყვანეთ ადმინ კოდი");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      form.append("branch", detectedBranch ?? branch);
      form.append("month", month);
      form.append("replaceExisting", String(replaceExisting));
      if (previewOnly) {
        form.append("preview", "true");
      } else {
        form.append("pin", getAdminPin());
      }
      const res = await fetch("/api/import/expenses", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      if (previewOnly) {
        setPreview({
          lines: data.lines,
          total: data.total,
          byBranch: data.byBranch ?? {},
          sample: data.sample ?? [],
          skipped: data.skipped ?? 0,
          outOfMonth: data.outOfMonth ?? 0,
        });
        const branchParts = Object.entries(data.byBranch ?? {})
          .map(([b, v]) => `${b}: ${formatMoney((v as { total: number }).total)}`)
          .join(" · ");
        setMsg(
          `პრევიუ: ${data.lines} ხარჯი · ${formatMoney(data.total)}` +
            (branchParts ? ` · ${branchParts}` : "") +
            (data.replaceMode ? " · ჩაანაცვლებს" : " · დაემატება")
        );
      } else {
        setPreview(null);
        onImported(data.transactions ?? []);
        onHistoryRefresh();
        const branchParts = Object.entries(data.byBranch ?? {})
          .map(([b, v]) => `${b}: ${formatMoney((v as { total: number }).total)}`)
          .join(" · ");
        setMsg(
          `ხარჯის იმპორტი ✓ ${data.imported} ხაზი · ${formatMoney(data.total)}` +
            (branchParts ? ` · ${branchParts}` : "") +
            (data.replaced ? ` (${data.replaced} ძველი ჩანაწერი)` : "")
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-5">
      <h2 className="mb-1 font-semibold text-amber-200">Excel იმპორტი — ხარჯები</h2>
      <p className="mb-4 text-xs text-zinc-500">
        ფორმატი: სახელი, ტიპი, კომენტარი, თანხა, თარიღი, სახელი (კატეგორია).
        ფილიალი ირჩევა ფაილის სახელიდან (მაგ. kuTaisi) — თუ კატეგორიის ან კომენტარის ველში წერია{" "}
        <span className="text-zinc-400">დისტრიბუცია</span>, <span className="text-zinc-400">ლილო</span> ან{" "}
        <span className="text-zinc-400">დიღომი</span>, ხარჯი შესაბამის ფილიალზე გადაეწერება.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Excel ფაილი">
          <input
            type="file"
            accept=".xlsx,.xls"
            multiple
            className={`${inputCls} file:mr-2 file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs`}
            onChange={(e) => {
              setFiles([...(e.target.files ?? [])]);
              setPreview(null);
              setMsg("");
            }}
          />
        </Field>
        <Field label="თვე (YYYY-MM)">
          <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label={`ძირითადი ფილიალი${detectedBranch ? " (ავტო)" : ""}`}>
          <select
            className={inputCls}
            value={detectedBranch ?? branch}
            disabled={!!detectedBranch}
            onChange={(e) => setBranch(e.target.value as Branch)}
          >
            {BRANCHES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </Field>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-amber-200">
        <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
        იმავე ფაილის წინა იმპორტის ჩანაცვლება
      </label>

      {files.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500">არჩეული: {files.map((f) => f.name).join(", ")}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btnCls} disabled={!files.length || busy} onClick={() => runImport(true)}>
          პრევიუ
        </button>
        <button
          type="button"
          className={`${btnCls} bg-orange-600 hover:bg-orange-500`}
          disabled={!files.length || busy || !unlocked}
          onClick={() => runImport(false)}
        >
          იმპორტი
        </button>
      </div>

      {!unlocked && <p className="mt-2 text-xs text-amber-400">იმპორტისთვის საჭიროა ადმინ კოდი.</p>}
      {err && <p className="mt-2 text-sm text-red-400">{err}</p>}
      {msg && <p className="mt-2 text-sm text-emerald-400">{msg}</p>}

      {preview && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
          <p className="mb-2 text-xs text-zinc-400">
            {preview.lines} ხარჯი · ჯამი {formatMoney(preview.total)}
            {preview.skipped > 0 && ` · გამოტოვებული ${preview.skipped}`}
            {preview.outOfMonth > 0 && ` · სხვა თვეში ${preview.outOfMonth}`}
          </p>
          {Object.keys(preview.byBranch).length > 0 && (
            <p className="mb-2 text-xs text-amber-300/80">
              {Object.entries(preview.byBranch)
                .map(([b, v]) => `${b}: ${v.count} ხაზი · ${formatMoney(v.total)}`)
                .join(" · ")}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-500">
                  <th className="pb-1 pr-2">თარიღი</th>
                  <th className="pb-1 pr-2">ფილიალი</th>
                  <th className="pb-1 pr-2">კატეგორია</th>
                  <th className="pb-1 pr-2">კომენტარი</th>
                  <th className="pb-1 text-right">თანხა</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((r, i) => (
                  <tr key={`${r.date}-${i}`} className="border-b border-zinc-800/40">
                    <td className="py-1 pr-2 text-zinc-400">{r.date.slice(0, 10)}</td>
                    <td className="py-1 pr-2 text-amber-300">{r.branch}</td>
                    <td className="py-1 pr-2">{r.category}</td>
                    <td className="py-1 pr-2">{r.comment}</td>
                    <td className="py-1 text-right text-red-400">{formatMoney(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.lines > preview.sample.length && (
            <p className="mt-1 text-xs text-zinc-600">+ კიდევ {preview.lines - preview.sample.length} ხაზი</p>
          )}
        </div>
      )}
    </div>
  );
}
