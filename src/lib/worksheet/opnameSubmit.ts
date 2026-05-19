import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, IngredientRow } from "@/lib/types/database";
import {
  analyzeOpnameVariances,
  buildLedgerMapFromRows,
  hasOpnameVarianceRequiringAdmin,
  variancesNeedingAdminQueue,
  type OpnameVarianceResult,
} from "@/lib/worksheet/opnameVariance";

type Supabase = SupabaseClient<Database>;

type IngredientLineState = {
  inQty: string;
  closingStock: string;
  outQty: string;
  outNote: string;
};

export type OpnameEvaluation = {
  variances: OpnameVarianceResult[];
  hasPendingApproval: boolean;
  pendingVariances: OpnameVarianceResult[];
};

export function evaluateOpnameSubmission(params: {
  ingredients: IngredientRow[];
  lines: Record<string, IngredientLineState>;
  ledgerRows?: Array<{
    ingredient_id: string;
    opening_stock?: unknown;
    in_qty?: unknown;
    theoretical_usage?: unknown;
    adjustment_qty?: unknown;
    closing_stock?: unknown;
  }> | null;
}): OpnameEvaluation {
  const ledgerMap = buildLedgerMapFromRows(params.ledgerRows ?? null);
  const variances = analyzeOpnameVariances(
    params.ingredients,
    params.lines,
    ledgerMap
  );
  const pendingVariances = variancesNeedingAdminQueue(variances);
  return {
    variances,
    hasPendingApproval: hasOpnameVarianceRequiringAdmin(variances),
    pendingVariances,
  };
}

/**
 * Menulis antrian worksheet_opname_pending — hanya untuk review Admin.
 * Tidak mengubah ingredient.current_stock (stok utama tetap di meja Admin).
 */
export async function persistOpnamePendingRecords(params: {
  supabase: Supabase;
  sessionId: string;
  businessDate: string;
  staffId: string;
  pendingVariances: OpnameVarianceResult[];
  matchedIngredientIds: string[];
}): Promise<void> {
  const {
    supabase,
    sessionId,
    businessDate,
    staffId,
    pendingVariances,
    matchedIngredientIds,
  } = params;

  if (pendingVariances.length > 0) {
    const { error: pendingErr } = await supabase.from("worksheet_opname_pending").upsert(
      pendingVariances.map((v) => ({
        session_id: sessionId,
        business_date: businessDate,
        ingredient_id: v.ingredientId,
        system_stock: v.systemStock,
        physical_stock: v.physicalStock,
        variance_qty: v.varianceQty,
        variance_pct: v.variancePct,
        status: "PENDING_APPROVAL_ADMIN" as const,
        submitted_by_staff_id: staffId,
      })),
      { onConflict: "session_id,ingredient_id" }
    );

    if (pendingErr) {
      throw new Error(`Gagal menyimpan antrian persetujuan opname: ${pendingErr.message}`);
    }
  }

  if (matchedIngredientIds.length > 0) {
    const { error: clearErr } = await supabase
      .from("worksheet_opname_pending")
      .delete()
      .eq("session_id", sessionId)
      .in("ingredient_id", matchedIngredientIds);

    if (clearErr) {
      throw new Error(`Gagal membersihkan antrian opname: ${clearErr.message}`);
    }
  }
}

/**
 * Jalankan penulisan antrian opname di belakang layar — tidak menahan UI staff.
 */
export function enqueueOpnamePendingRecords(params: {
  supabase: Supabase;
  sessionId: string;
  businessDate: string;
  staffId: string;
  evaluation: OpnameEvaluation;
}): void {
  const { evaluation, ...rest } = params;
  const matchedIngredientIds = evaluation.variances
    .filter((v) => Math.abs(v.varianceQty) <= 0.0001)
    .map((v) => v.ingredientId);

  void persistOpnamePendingRecords({
    ...rest,
    pendingVariances: evaluation.pendingVariances,
    matchedIngredientIds,
  }).catch((err) => {
    console.error("[worksheet] Gagal menulis antrian opname admin (async):", err);
  });
}
