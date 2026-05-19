"use client";

import { Modal } from "@/components/ui/Modal";
import type { TypoGuardWarning } from "@/lib/worksheet/typoGuard";
import { formatTypoGuardMessage } from "@/lib/worksheet/typoGuard";

type TypoConfirmModalProps = {
  open: boolean;
  warnings: TypoGuardWarning[];
  onConfirm: () => void;
  onCancel: () => void;
};

const FIELD_LABEL: Record<TypoGuardWarning["field"], string> = {
  inQty: "Pasokan masuk",
  closingStock: "Sisa fisik (opname)",
  outQty: "Qty keluar",
};

export function TypoConfirmModal({
  open,
  warnings,
  onConfirm,
  onCancel,
}: TypoConfirmModalProps) {
  return (
    <Modal open={open} title="Konfirmasi angka besar" onClose={onCancel}>
      <p className="text-sm text-zinc-300">{formatTypoGuardMessage(warnings)}</p>
      <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto text-xs text-zinc-400">
        {warnings.slice(0, 8).map((w) => (
          <li key={`${w.ingredientId}-${w.field}`} className="rounded-lg bg-zinc-900/80 px-3 py-2">
            <span className="font-medium text-zinc-200">{w.ingredientName}</span>
            {" · "}
            {FIELD_LABEL[w.field]}:{" "}
            <span className="tabular-nums text-amber-200">
              {w.value.toLocaleString("id-ID", { maximumFractionDigits: 4 })} {w.unit}
            </span>
            {w.reason === "spike" ? (
              <span className="block text-zinc-500">
                Stok sistem: {w.systemStock.toLocaleString("id-ID", { maximumFractionDigits: 4 })}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-12 flex-1 rounded-xl border border-zinc-600 bg-zinc-800 px-4 text-sm font-semibold text-zinc-200"
        >
          Periksa lagi
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-12 flex-1 rounded-xl bg-amber-600 px-4 text-sm font-bold text-white"
        >
          Ya, angka sudah benar
        </button>
      </div>
    </Modal>
  );
}
