"use client";

import { Modal } from "@/components/ui/Modal";
import type {
  TypoGuardPreviewEntry,
  TypoGuardPreviewField,
  TypoGuardWarning,
} from "@/lib/worksheet/typoGuard";
import { formatTypoGuardMessage } from "@/lib/worksheet/typoGuard";

type TypoConfirmModalProps = {
  open: boolean;
  warnings: TypoGuardWarning[];
  previewEntries: TypoGuardPreviewEntry[];
  onConfirm: () => void;
  onCancel: () => void;
};

const FIELD_LABEL: Record<TypoGuardPreviewField, string> = {
  inQty: "Receive",
  closingStock: "Sisa fisik (opname)",
  outQty: "Qty keluar",
  premix: "Premix",
  issue: "Remake",
  sold: "Menu",
};

export function TypoConfirmModal({
  open,
  warnings,
  previewEntries,
  onConfirm,
  onCancel,
}: TypoConfirmModalProps) {
  const warningKeySet = new Set(warnings.map((w) => `${w.ingredientId}-${w.field}`));
  const title = warnings.length > 0 ? "Konfirmasi angka besar" : "Preview data tersimpan";

  return (
    <Modal open={open} title={title} onClose={onCancel}>
      {warnings.length > 0 ? (
        <p className="text-sm text-slate-700">{formatTypoGuardMessage(warnings)}</p>
      ) : (
        <p className="text-sm text-slate-700">
          Cek ulang semua item yang sudah diisi sebelum disimpan.
        </p>
      )}

      <div className="mt-4 rounded-lg border border-slate-200/80 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Data terisi
          </span>
          <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            {previewEntries.length} item
          </span>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto p-2 text-xs text-slate-600">
          {previewEntries.length === 0 ? (
            <li className="px-2 py-3 text-center text-slate-500">Belum ada data terisi.</li>
          ) : (
            previewEntries.map((entry) => {
              const warning = warningKeySet.has(`${entry.ingredientId}-${entry.field}`);
              return (
                <li
                  key={`${entry.ingredientId}-${entry.field}`}
                  className={`rounded-lg px-3 py-2 ${
                    warning
                      ? "border border-amber-200 bg-amber-50"
                      : "bg-white"
                  }`}
                >
                  <span className="font-medium text-slate-800">{entry.ingredientName}</span>
                  {" · "}
                  {FIELD_LABEL[entry.field]}:{" "}
                  <span className={warning ? "tabular-nums text-amber-900" : "tabular-nums text-slate-900"}>
                    {entry.value.toLocaleString("id-ID", { maximumFractionDigits: 4 })} {entry.unit}
                  </span>
                  {entry.note ? (
                    <span className="block pt-1 text-[11px] text-slate-500">{entry.note}</span>
                  ) : null}
                  {warning ? (
                    <span className="ml-1 text-amber-900">Periksa angka besar</span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>

      {warnings.length > 0 ? (
        <ul className="mt-3 max-h-36 space-y-2 overflow-y-auto text-xs text-slate-600">
          {warnings.map((w) => (
            <li key={`${w.ingredientId}-${w.field}`} className="rounded-lg bg-white px-3 py-2">
              <span className="font-medium text-slate-800">{w.ingredientName}</span>
              {" · "}
              {FIELD_LABEL[w.field]}:{" "}
              <span className="tabular-nums text-amber-900">
                {w.value.toLocaleString("id-ID", { maximumFractionDigits: 4 })} {w.unit}
              </span>
              {w.reason === "spike" ? (
                <span className="block text-slate-500">
                  Stok sistem: {w.systemStock.toLocaleString("id-ID", { maximumFractionDigits: 4 })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-12 flex-1 rounded-xl border border-slate-200/80 bg-white px-4 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98]"
        >
          Periksa lagi
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="min-h-12 flex-1 rounded-xl bg-teal-600 px-4 text-sm font-medium text-white transition-all hover:bg-teal-700 active:scale-[0.98]"
        >
          Simpan data ini
        </button>
      </div>
    </Modal>
  );
}
