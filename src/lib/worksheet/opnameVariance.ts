import type { IngredientRow } from "@/lib/types/database";
import { parseWorksheetQty } from "@/lib/worksheet/outstockValidation";
import {
  ledgerRowToSnapshot,
  resolveSystemStockForVariance,
  type StockLedgerSnapshot,
} from "@/lib/worksheet/stockLedgerSnapshot";

/** Variance above this ratio of system stock — penanda prioritas di dashboard Admin */
export const OPNAME_VARIANCE_APPROVAL_THRESHOLD = 0.15;

/** Selisih di bawah ini dianggap nol (floating point) */
export const OPNAME_VARIANCE_EPSILON = 0.0001;

export type OpnameVarianceResult = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  systemStock: number;
  physicalStock: number;
  varianceQty: number;
  variancePct: number;
  requiresApproval: boolean;
};

export function formatSystemStockGuide(
  ingredient: Pick<IngredientRow, "name" | "current_stock" | "unit">
): string {
  const stock = Number(ingredient.current_stock);
  const formatted = Number.isFinite(stock)
    ? stock.toLocaleString("id-ID", { maximumFractionDigits: 4 })
    : "0";
  return `${ingredient.name}: ${formatted} ${ingredient.unit} (Stok Buku/Sistem)`;
}

export function computeOpnameVariance(
  ingredient: Pick<IngredientRow, "id" | "name" | "unit" | "current_stock">,
  physicalStockRaw: string,
  ledgerSnapshot?: StockLedgerSnapshot | null
): OpnameVarianceResult {
  const systemStock = resolveSystemStockForVariance(
    ingredient.current_stock,
    ledgerSnapshot ?? null
  );
  const physicalStock = parseWorksheetQty(physicalStockRaw);
  const varianceQty = physicalStock - systemStock;
  const variancePct =
    systemStock > 0
      ? Math.abs(varianceQty) / systemStock
      : physicalStock > 0
        ? 1
        : 0;

  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    unit: ingredient.unit,
    systemStock,
    physicalStock,
    varianceQty,
    variancePct,
    requiresApproval: variancePct > OPNAME_VARIANCE_APPROVAL_THRESHOLD,
  };
}

export function analyzeOpnameVariances(
  ingredients: IngredientRow[],
  lines: Record<string, { closingStock: string }>,
  ledgerByIngredientId?: Map<string, StockLedgerSnapshot | null>
): OpnameVarianceResult[] {
  return ingredients.flatMap((ing) => {
    const physicalStockRaw = lines[ing.id]?.closingStock ?? "";
    if (String(physicalStockRaw).trim() === "") return [];

    const rawLedger = ledgerByIngredientId?.get(ing.id);
    const snapshot =
      rawLedger === undefined ? null : rawLedger === null ? null : rawLedger;
    return [computeOpnameVariance(ing, physicalStockRaw, snapshot)];
  });
}

export function hasOpnameVarianceRequiringAdmin(results: OpnameVarianceResult[]): boolean {
  return results.some((r) => Math.abs(r.varianceQty) > OPNAME_VARIANCE_EPSILON);
}

/** @deprecated Gunakan hasOpnameVarianceRequiringAdmin */
export function hasPendingApprovalVariances(results: OpnameVarianceResult[]): boolean {
  return hasOpnameVarianceRequiringAdmin(results);
}

export function variancesNeedingAdminQueue(
  results: OpnameVarianceResult[]
): OpnameVarianceResult[] {
  return results.filter((r) => Math.abs(r.varianceQty) > OPNAME_VARIANCE_EPSILON);
}

export function buildLedgerMapFromRows(
  rows: Array<{
    ingredient_id: string;
    opening_stock?: unknown;
    in_qty?: unknown;
    theoretical_usage?: unknown;
    adjustment_qty?: unknown;
    closing_stock?: unknown;
  }> | null
): Map<string, StockLedgerSnapshot | null> {
  const map = new Map<string, StockLedgerSnapshot | null>();
  for (const row of rows ?? []) {
    map.set(row.ingredient_id, ledgerRowToSnapshot(row));
  }
  return map;
}
