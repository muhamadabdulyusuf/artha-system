/** Nilai numerik aman dari kolom stock_ledger (null/undefined → 0). */
export function safeLedgerQty(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type StockLedgerSnapshot = {
  opening_stock: number;
  in_qty: number;
  theoretical_usage: number;
  adjustment_qty: number;
  closing_stock: number;
};

export function ledgerRowToSnapshot(
  row: Partial<Record<keyof StockLedgerSnapshot, unknown>> | null | undefined
): StockLedgerSnapshot | null {
  if (!row) return null;

  return {
    opening_stock: safeLedgerQty(row.opening_stock),
    in_qty: safeLedgerQty(row.in_qty),
    theoretical_usage: safeLedgerQty(row.theoretical_usage),
    adjustment_qty: safeLedgerQty(row.adjustment_qty),
    closing_stock: safeLedgerQty(row.closing_stock),
  };
}

/** Stok buku untuk perbandingan opname: current_stock bahan, dengan fallback ledger (0 jika kosong). */
export function resolveSystemStockForVariance(
  ingredientCurrentStock: unknown,
  ledger: StockLedgerSnapshot | null | undefined
): number {
  const book = safeLedgerQty(ingredientCurrentStock);
  if (ledger) {
    const fromLedger =
      ledger.opening_stock +
      ledger.in_qty +
      ledger.theoretical_usage +
      ledger.adjustment_qty;
    if (Number.isFinite(fromLedger)) {
      return fromLedger;
    }
  }
  return book;
}
