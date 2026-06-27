"use client";

import { Banknote, CreditCard, Loader2, QrCode, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { PaymentMethod } from "../types";

type PaymentModalProps = {
  open: boolean;
  grandTotal: number;
  isProcessing: boolean;
  onClose: () => void;
  onConfirm: (payment: { method: PaymentMethod; paidAmount: number; changeAmount: number }) => Promise<void>;
};

const PAYMENT_METHODS: { id: PaymentMethod; label: string; description: string; icon: typeof Banknote }[] = [
  { id: "CASH", label: "Cash", description: "Uang tunai", icon: Banknote },
  { id: "QRIS", label: "QRIS", description: "BRImo / QR", icon: QrCode },
  { id: "DEBIT", label: "Debit", description: "Kartu debit", icon: CreditCard },
];

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function parseCurrencyInput(value: string): number {
  const normalized = value.replace(/[^\d]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function PaymentModal({ open, grandTotal, isProcessing, onClose, onConfirm }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [cashReceivedInput, setCashReceivedInput] = useState("");
  const cashReceived = parseCurrencyInput(cashReceivedInput);
  const paidAmount = method === "CASH" ? cashReceived : grandTotal;
  const changeAmount = useMemo(() => Math.max(0, paidAmount - grandTotal), [grandTotal, paidAmount]);
  const paymentInsufficient = method === "CASH" && paidAmount < grandTotal;

  useEffect(() => {
    if (!open) return;
    setMethod("CASH");
    setCashReceivedInput("");
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (paymentInsufficient) return;
    await onConfirm({ method, paidAmount, changeAmount });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Payment</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Selesaikan Transaksi</h2>
            <p className="mt-1 text-sm text-slate-600">Pilih metode pembayaran dan validasi total.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 transition-all duration-200 hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50"
            aria-label="Tutup payment modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div className="rounded-lg border border-slate-200/80 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Grand Total</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">{formatRupiah(grandTotal)}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {PAYMENT_METHODS.map((item) => {
              const Icon = item.icon;
              const active = method === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMethod(item.id)}
                  disabled={isProcessing}
                  className={`rounded-lg border p-3 text-left transition-all duration-200 ${
                    active
                      ? "border-teal-200 bg-teal-50/70 text-teal-800 ring-2 ring-teal-100"
                      : "border-slate-200/80 bg-white text-slate-600 hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <p className="mt-2 text-sm font-semibold">{item.label}</p>
                  <p className="mt-0.5 text-xs opacity-75">{item.description}</p>
                </button>
              );
            })}
          </div>

          {method === "CASH" ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Uang Tunai Diterima</span>
              <input
                inputMode="numeric"
                value={cashReceivedInput}
                onChange={(event) => setCashReceivedInput(event.target.value)}
                disabled={isProcessing}
                placeholder="Contoh: 100000"
                className="min-h-12 w-full rounded-md border border-slate-200/80 bg-white px-3 text-lg font-semibold tabular-nums text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
          ) : (
            <div className="rounded-md border border-teal-100 bg-teal-50 px-4 py-3 text-sm font-medium text-teal-700">
              {method === "QRIS" ? "Pastikan QRIS BRImo sudah berhasil dibayar." : "Pastikan pembayaran debit approved."}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200/80 bg-white px-4 py-3">
              <p className="text-xs font-medium text-slate-600">Diterima</p>
              <p className="mt-1 text-xl font-semibold text-slate-950">{formatRupiah(paidAmount)}</p>
            </div>
            <div className="rounded-md border border-slate-200/80 bg-white px-4 py-3">
              <p className="text-xs font-medium text-slate-600">Uang Kembalian</p>
              <p className="mt-1 text-xl font-semibold text-teal-700">{formatRupiah(changeAmount)}</p>
            </div>
          </div>

          {paymentInsufficient ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Uang diterima masih kurang dari grand total.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200/80 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200/80 bg-white px-4 text-sm font-semibold text-slate-600 transition-all duration-200 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={isProcessing || paymentInsufficient}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Confirm Payment
          </button>
        </div>
      </section>
    </div>
  );
}
