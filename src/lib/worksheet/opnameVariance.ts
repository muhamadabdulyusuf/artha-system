import type { IngredientRow } from "@/lib/types/database";
import { parseWorksheetQty } from "@/lib/worksheet/outstockValidation";

/** Variance above this ratio of system stock requires admin approval */
export const OPNAME_VARIANCE_APPROVAL_THRESHOLD = 0.15;

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
  physicalStockRaw: string
): OpnameVarianceResult {
  const systemStock = Number(ingredient.current_stock);
  const safeSystem = Number.isFinite(systemStock) ? systemStock : 0;
  const physicalStock = parseWorksheetQty(physicalStockRaw);
  const varianceQty = physicalStock - safeSystem;
  const variancePct =
    safeSystem > 0
      ? Math.abs(varianceQty) / safeSystem
      : physicalStock > 0
        ? 1
        : 0;

  return {
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    unit: ingredient.unit,
    systemStock: safeSystem,
    physicalStock,
    varianceQty,
    variancePct,
    requiresApproval: variancePct > OPNAME_VARIANCE_APPROVAL_THRESHOLD,
  };
}

export function analyzeOpnameVariances(
  ingredients: IngredientRow[],
  lines: Record<string, { closingStock: string }>
): OpnameVarianceResult[] {
  return ingredients.map((ing) =>
    computeOpnameVariance(ing, lines[ing.id]?.closingStock ?? "0")
  );
}

export function hasPendingApprovalVariances(results: OpnameVarianceResult[]): boolean {
  return results.some((r) => r.requiresApproval && r.physicalStock !== r.systemStock);
}
