"use client";

import { useState } from "react";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";

export function usePin() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<((pin: string) => void) | null>(null);

  function requestPin(onOk: (pin: string) => void) {
    setPending(() => onOk);
    setOpen(true);
  }

  async function confirm(pin: string, verify: (pin: string) => Promise<boolean>) {
    const ok = await verify(pin);
    if (!ok) return false;
    pending?.(pin);
    setOpen(false);
    setPending(null);
    return true;
  }

  function cancel() {
    setOpen(false);
    setPending(null);
  }

  return { open, requestPin, confirm, cancel };
}

export function PinModal({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: (pin: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  async function submit() {
    setBusy(true);
    setErr(false);
    const ok = await onConfirm(pin);
    setBusy(false);
    if (ok) setPin("");
    else setErr(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xs rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h3 className="mb-3 font-semibold">შეიყვანეთ კოდი</h3>
        <input
          type="password"
          className={inputCls}
          value={pin}
          onChange={(e) => { setPin(e.target.value); setErr(false); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) submit(); }}
          autoFocus
          disabled={busy}
        />
        {err && <p className="mt-2 text-xs text-red-400">არასწორი კოდი</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm hover:bg-emerald-500 disabled:opacity-40"
            onClick={submit}
            disabled={busy}
          >
            {busy ? "..." : "დადასტურება"}
          </button>
          <button type="button" className="rounded-lg border border-zinc-600 px-4 py-2 text-sm" onClick={onCancel} disabled={busy}>
            გაუქმება
          </button>
        </div>
      </div>
    </div>
  );
}
