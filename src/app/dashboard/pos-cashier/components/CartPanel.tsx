"use client";

import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import type { CartItem, FinanceSummary, ProductMenu } from "../types";
import { AiSuggest } from "./AiSuggest";

type CartPanelProps = {
  items: CartItem[];
  products: ProductMenu[];
  finance: FinanceSummary;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdateNotes: (id: string, notes: string) => void;
  onProcessPayment: () => void;
};

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "text-sm font-semibold text-slate-900" : "text-sm font-medium text-slate-600"}>{label}</span>
      <span className={strong ? "text-lg font-semibold tabular-nums text-slate-900" : "text-sm font-semibold tabular-nums text-slate-900"}>
        {value}
      </span>
    </div>
  );
}

export function CartPanel({
  items,
  products,
  finance,
  onIncrement,
  onDecrement,
  onRemove,
  onUpdateNotes,
  onProcessPayment,
}: CartPanelProps) {
  const cartEmpty = items.length === 0;

  return (
    <aside className="flex min-h-[640px] flex-col justify-between rounded-xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] lg:sticky lg:top-6 lg:h-[calc(100vh-6rem)] lg:min-h-0">
      <div className="border-b border-slate-200/80 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-700">Cashier Cart</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">Keranjang</h2>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-slate-700 ring-1 ring-slate-200/80">
            <ShoppingCart className="h-5 w-5" />
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-4 scrollbar-thin">
        {cartEmpty ? (
          <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200/80 bg-slate-50 px-4 text-center">
            <ShoppingCart className="h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm font-semibold text-slate-700">Belum ada item.</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Tap menu di kiri untuk mulai transaksi.</p>
          </div>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.id} className="mb-3 border-b border-slate-200/80 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold tracking-tight text-slate-900">{item.name}</p>
                    <p className="mt-0.5 text-xs font-medium tabular-nums text-slate-900">{formatRupiah(item.price)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Hapus ${item.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="inline-flex items-center rounded-md border border-slate-200/80 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => onDecrement(item.id)}
                      className="flex h-8 w-8 items-center justify-center text-slate-600 transition hover:bg-white"
                      aria-label={`Kurangi ${item.name}`}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-9 text-center text-sm font-semibold tabular-nums text-slate-900">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onIncrement(item.id)}
                      className="flex h-8 w-8 items-center justify-center text-slate-600 transition hover:bg-white"
                      aria-label={`Tambah ${item.name}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-right text-sm font-semibold tabular-nums text-slate-900">
                    {formatRupiah(item.price * item.quantity)}
                  </p>
                </div>

                <input
                  value={item.customNotes}
                  onChange={(event) => onUpdateNotes(item.id, event.target.value)}
                  placeholder="Catatan: less ice, no sugar..."
                  className="mt-3 min-h-9 w-full rounded-md border border-slate-200/80 bg-slate-50 px-3 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:ring-2 focus:ring-teal-100"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-4 border-t border-slate-200/80 pt-4">
        <AiSuggest cartItems={items} products={products} />

        <div className="space-y-2.5 rounded-lg bg-slate-50 p-4">
          <SummaryRow label="Subtotal" value={formatRupiah(finance.subtotal)} />
          <SummaryRow
            label={`Service Charge (${finance.servicePercent.toLocaleString("id-ID")}%)`}
            value={formatRupiah(finance.serviceAmount)}
          />
          <SummaryRow label="Subtotal + Service" value={formatRupiah(finance.subtotalAfterService)} />
          <SummaryRow label={`Tax (${finance.taxPercent.toLocaleString("id-ID")}%)`} value={formatRupiah(finance.taxAmount)} />
          <div className="my-2 border-t border-slate-200/80" />
          <SummaryRow label="Grand Total" value={formatRupiah(finance.grandTotal)} strong />
        </div>

        <button
          type="button"
          onClick={onProcessPayment}
          disabled={cartEmpty}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-teal-600 px-4 text-sm font-medium text-white transition-all duration-200 hover:bg-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Proses Pembayaran (F4)
        </button>
      </div>
    </aside>
  );
}
