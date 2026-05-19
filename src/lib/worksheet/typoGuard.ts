import type { IngredientRow } from "@/lib/types/database";
import { parseWorksheetQty } from "@/lib/worksheet/outstockValidation";

export const TYPO_ABSOLUTE_THRESHOLD = 5000;
/** Value exceeds system stock × this ratio (e.g. 6 = lebih dari +500% dari stok sistem) */
export const TYPO_SPIKE_RATIO = 6;

export type TypoGuardWarning = {
  ingredientId: string;
  ingredientName: string;
  field: "inQty" | "closingStock" | "outQty";
  value: number;
  unit: string;
  systemStock: number;
  reason: "absolute" | "spike";
};

type LineFields = {
  inQty: string;
  closingStock: string;
  outQty: string;
};

function isExtremeAbsolute(value: number): boolean {
  return value > TYPO_ABSOLUTE_THRESHOLD;
}

function isExtremeSpike(value: number, systemStock: number): boolean {
  if (value <= 0) return false;
  const baseline = Math.max(systemStock, 1);
  return value > baseline * TYPO_SPIKE_RATIO;
}

export function findTypoGuardWarnings(
  ingredients: IngredientRow[],
  lines: Record<string, LineFields>,
  fields: Array<keyof LineFields>
): TypoGuardWarning[] {
  const warnings: TypoGuardWarning[] = [];

  for (const ing of ingredients) {
    const line = lines[ing.id];
    if (!line) continue;

    const systemStock = Number(ing.current_stock);
    const safeSystem = Number.isFinite(systemStock) ? systemStock : 0;

    for (const field of fields) {
      const value = parseWorksheetQty(line[field]);
      if (value <= 0) continue;

      if (isExtremeAbsolute(value)) {
        warnings.push({
          ingredientId: ing.id,
          ingredientName: ing.name,
          field,
          value,
          unit: ing.unit,
          systemStock: safeSystem,
          reason: "absolute",
        });
        continue;
      }

      if (isExtremeSpike(value, safeSystem)) {
        warnings.push({
          ingredientId: ing.id,
          ingredientName: ing.name,
          field,
          value,
          unit: ing.unit,
          systemStock: safeSystem,
          reason: "spike",
        });
      }
    }
  }

  return warnings;
}

export function formatTypoGuardMessage(warnings: TypoGuardWarning[]): string {
  if (warnings.length === 0) return "";
  const first = warnings[0];
  const formatted = first.value.toLocaleString("id-ID", { maximumFractionDigits: 4 });
  const extra =
    warnings.length > 1 ? ` (+${warnings.length - 1} entri lain)` : "";
  return `⚠️ Angka yang Anda masukkan cukup besar (${formatted} ${first.unit})${extra}. Apakah Anda yakin tidak salah ketik/typo?`;
}
