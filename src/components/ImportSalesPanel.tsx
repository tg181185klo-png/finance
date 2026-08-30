"use client";

import { useMemo, useState } from "react";
import type { Branch, Employee, Transaction } from "@/lib/types";
import { BRANCHES } from "@/lib/dashboard-data";
import { formatMoney } from "@/lib/utils";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";
const labelCls = "mb-1 block text-xs text-zinc-400";
const btnCls = "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500 disabled:opacity-40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

type Preview = {
  lines: number;
  total: number;
  quantity: number;
  sample: { productCode: string; productName: string; quantity: number; unitPrice: number; amount: number }[];
};

type Props = {
  employees: Employee[];
  unlocked: boolean;
  getAdminPin: () => string;
  onImported: (transactions: Transaction[]) => void;
  onHistoryRefresh: () => void;
};

export default function ImportSalesPanel({
  employees,
  unlocked,
  getAdminPin,
  onImported,
  onHistoryRefresh,
}: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [branch, setBranch] = useState<Branch>("დისტრიბუცია");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [employeeId, setEmployeeId] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const branchEmployees = useMemo(
    () => employees.filter((e) => e.branch === branch),
    [employees, branch]
  );

  const selectedEmployee = branchEmployees.find((e) => e.id === employeeId);

  async function runImport(previewOnly: boolean) {
    if (!file) {
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
      form.append("file", file);
      form.append("branch", branch);
      form.append("month", month);
      form.append("replaceExisting", String(replaceExisting));
      if (selectedEmployee) form.append("employeeName", selectedEmployee.name);
      if (previewOnly) {
        form.append("preview", "true");
      } else {
        form.append("pin", getAdminPin());
      }
      const res = await fetch("/api/import/sales", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "შეცდომა");
      if (previewOnly) {
        setPreview({
          lines: data.lines,
          total: data.total,
          quantity: data.quantity,
          sample: data.sample ?? [],
        });
        setMsg(`პრევიუ: ${data.lines} ხაზი · ${formatMoney(data.total)}`);
      } else {
        setPreview(null);
        onImported(data.transactions ?? []);
        onHistoryRefresh();
        setMsg(
          `იმპორტი დასრულდა ✓ ${data.imported} გაყიდვა · ${formatMoney(data.total)}${data.replaced ? ` (ჩანაცვლდა ${data.replaced})` : ""}`
        );
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-5">
      <h2 className="mb-1 font-semibold text-sky-200">Excel იმპორტი — გაყიდვები</h2>
      <p className="mb-4 text-xs text-zinc-500">
        ატვირთეთ distribucia marti.xlsx ფორმატის ფაილი (ბარკოდი, დასახელება, რაოდენობა, გასაყიდი/ჯამური ფასი).
        მარაგი არ იცვლება — მხოლოდ შემოსავლის ისტორია.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Excel ფაილი">
          <input
            type="file"
            accept=".xlsx,.xls"
            className={`${inputCls} file:mr-2 file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-xs`}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setMsg("");
            }}
          />
        </Field>
        <Field label="თვე (YYYY-MM)">
          <input type="month" className={inputCls} value={month} onChange={(e) => setMonth(e.target.value)} />
        </Field>
        <Field label="ფილიალი">
          <select className={inputCls} value={branch} onChange={(e) => { setBranch(e.target.value as Branch); setEmployeeId(""); }}>
            {BRANCHES.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </Field>
        <Field label="თანამშრომელი (არასავალდებულო)">
          <select className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">—</option>
            {branchEmployees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-sky-200">
        <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} />
        ამ ფილიალისა და თვის წინა Excel იმპორტის ჩანაწერების ჩანაცვლება
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btnCls} disabled={!file || busy} onClick={() => runImport(true)}>
          პრევიუ
        </button>
        <button
          type="button"
          className={`${btnCls} bg-sky-600 hover:bg-sky-500`}
          disabled={!file || busy || !unlocked}
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
            {preview.lines} პოზიცია · {preview.quantity} ც · ჯამი {formatMoney(preview.total)}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-zinc-500">
                  <th className="pb-1 pr-2">კოდი</th>
                  <th className="pb-1 pr-2">დასახელება</th>
                  <th className="pb-1 pr-2 text-right">რაოდ.</th>
                  <th className="pb-1 pr-2 text-right">ფასი</th>
                  <th className="pb-1 text-right">ჯამი</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((r) => (
                  <tr key={r.productCode + r.amount} className="border-b border-zinc-800/40">
                    <td className="py-1 pr-2 text-emerald-400">{r.productCode}</td>
                    <td className="py-1 pr-2">{r.productName}</td>
                    <td className="py-1 pr-2 text-right">{r.quantity}</td>
                    <td className="py-1 pr-2 text-right">{formatMoney(r.unitPrice)}</td>
                    <td className="py-1 text-right">{formatMoney(r.amount)}</td>
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
