"use client";

import { useState } from "react";
import { ADMIN_PIN } from "@/lib/constants";

const inputCls = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm focus:border-emerald-500";

export function usePin() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  function requestPin(onOk: () => void) {
    setPending(() => onOk);
    setOpen(true);
  }

  function confirm(pin: string) {
    if (pin !== ADMIN_PIN) return false;
    pending?.();
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
  onConfirm: (pin: string) => boolean;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-xs rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h3 className="mb-3 font-semibold">შეიყვანეთ კოდი</h3>
        <input
          type="password"
          className={inputCls}
          value={pin}
          onChange={(e) => { setPin(e.target.value); setErr(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (onConfirm(pin)) setPin("");
              else setErr(true);
            }
          }}
          autoFocus
        />
        {err && <p className="mt-2 text-xs text-red-400">არასწორი კოდი</p>}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm hover:bg-emerald-500"
            onClick={() => {
              if (onConfirm(pin)) setPin("");
              else setErr(true);
            }}
          >
            დადასტურება
          </button>
          <button type="button" className="rounded-lg border border-zinc-600 px-4 py-2 text-sm" onClick={onCancel}>
            გაუქმება
          </button>
        </div>
      </div>
    </div>
  );
}
