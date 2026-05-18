import type { IngredientRow } from "@/lib/types/database";

export const OUTSTOCK_LOGICAL_FALLACY_MESSAGE =
  "Logical Fallacy: Jumlah pengeluaran barang mustahil melebihi persediaan yang ada.";

export type OutstockLineInput = {
  outQty: string;
  outNote: string;
};

export type OutstockLineValidation = {
  outQty: number;
  exceedsStock: boolean;
  noteRequired: boolean;
  noteMissing: boolean;
  isInvalid: boolean;
};

export function parseWorksheetQty(value: string): number {
  const n = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function formatStockAvailability(ingredient: Pick<IngredientRow, "name" | "current_stock" | "unit">): string {
  const stock = Number(ingredient.current_stock);
  const formatted = Number.isFinite(stock)
    ? stock.toLocaleString("id-ID", { maximumFractionDigits: 4 })
    : "0";
  return `${ingredient.name}: ${formatted} ${ingredient.unit} (sesuai dengan persediaan)`;
}

export function validateOutstockLine(
  ingredient: Pick<IngredientRow, "current_stock">,
  line: OutstockLineInput
): OutstockLineValidation {
  const outQty = parseWorksheetQty(line.outQty);
  const availableStock = Number(ingredient.current_stock);
  const safeStock = Number.isFinite(availableStock) ? availableStock : 0;
  const exceedsStock = outQty > safeStock;
  const noteRequired = outQty > 0;
  const noteMissing = noteRequired && line.outNote.trim().length === 0;

  return {
    outQty,
    exceedsStock,
    noteRequired,
    noteMissing,
    isInvalid: exceedsStock || noteMissing,
  };
}

export function findOutstockValidationErrors(
  ingredients: IngredientRow[],
  lines: Record<string, OutstockLineInput>
): { ingredientId: string; ingredientName: string; exceedsStock: boolean; noteMissing: boolean }[] {
  const errors: {
    ingredientId: string;
    ingredientName: string;
    exceedsStock: boolean;
    noteMissing: boolean;
  }[] = [];

  for (const ing of ingredients) {
    const line = lines[ing.id];
    if (!line) continue;

    const result = validateOutstockLine(ing, line);
    if (!result.isInvalid) continue;

    errors.push({
      ingredientId: ing.id,
      ingredientName: ing.name,
      exceedsStock: result.exceedsStock,
      noteMissing: result.noteMissing,
    });
  }

  return errors;
}

export function hasOutstockValidationErrors(
  ingredients: IngredientRow[],
  lines: Record<string, OutstockLineInput>
): boolean {
  return findOutstockValidationErrors(ingredients, lines).length > 0;
}
