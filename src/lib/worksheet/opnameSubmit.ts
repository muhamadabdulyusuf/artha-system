import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, IngredientRow } from "@/lib/types/database";
import {
  analyzeOpnameVariances,
  hasPendingApprovalVariances,
  type OpnameVarianceResult,
} from "@/lib/worksheet/opnameVariance";

type Supabase = SupabaseClient<Database>;

type IngredientLineState = {
  inQty: string;
  closingStock: string;
  outQty: string;
  outNote: string;
};

export type OpnameSyncResult = {
  variances: OpnameVarianceResult[];
  hasPendingApproval: boolean;
  autoApprovedIds: string[];
  pendingIds: string[];
};

export async function syncOpnameStockAndPending(params: {
  supabase: Supabase;
  sessionId: string;
  businessDate: string;
  staffId: string;
  ingredients: IngredientRow[];
  lines: Record<string, IngredientLineState>;
}): Promise<OpnameSyncResult> {
  const { supabase, sessionId, businessDate, staffId, ingredients, lines } = params;
  const variances = analyzeOpnameVariances(ingredients, lines);
  const hasPendingApproval = hasPendingApprovalVariances(variances);
  const autoApprovedIds: string[] = [];
  const pendingIds: string[] = [];

  for (const v of variances) {
    if (v.requiresApproval && v.physicalStock !== v.systemStock) {
      pendingIds.push(v.ingredientId);

      const { error: pendingErr } = await supabase.from("worksheet_opname_pending").upsert(
        {
          session_id: sessionId,
          business_date: businessDate,
          ingredient_id: v.ingredientId,
          system_stock: v.systemStock,
          physical_stock: v.physicalStock,
          variance_qty: v.varianceQty,
          variance_pct: v.variancePct,
          status: "PENDING_APPROVAL_ADMIN",
          submitted_by_staff_id: staffId,
        },
        { onConflict: "session_id,ingredient_id" }
      );

      if (pendingErr) {
        throw new Error(`Gagal menyimpan antrian persetujuan opname: ${pendingErr.message}`);
      }
    } else {
      autoApprovedIds.push(v.ingredientId);

      const { error: stockErr } = await supabase
        .from("ingredient")
        .update({ current_stock: v.physicalStock })
        .eq("id", v.ingredientId);

      if (stockErr) {
        throw new Error(`Gagal memperbarui stok ${v.ingredientName}: ${stockErr.message}`);
      }

      await supabase
        .from("worksheet_opname_pending")
        .delete()
        .eq("session_id", sessionId)
        .eq("ingredient_id", v.ingredientId);
    }
  }

  return { variances, hasPendingApproval, autoApprovedIds, pendingIds };
}
