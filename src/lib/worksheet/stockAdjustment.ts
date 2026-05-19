import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, StockLogEventType } from "@/lib/types/database";

type Supabase = SupabaseClient<Database>;

export function buildAdjustmentLogMessage(
  adminName: string,
  ingredientName: string,
  qtyBefore: number,
  qtyAfter: number,
  reason: string
): string {
  const before = qtyBefore.toLocaleString("id-ID", { maximumFractionDigits: 4 });
  const after = qtyAfter.toLocaleString("id-ID", { maximumFractionDigits: 4 });
  return `${adminName} mengubah data ${ingredientName} dari ${before} menjadi ${after} dengan Alasan Koreksi: ${reason.trim()}`;
}

export async function applyAdminStockAdjustment(params: {
  supabase: Supabase;
  ingredientId: string;
  ingredientName: string;
  qtyBefore: number;
  qtyAfter: number;
  reason: string;
  adminStaffId: string;
  adminName: string;
  businessDate?: string;
}): Promise<void> {
  const {
    supabase,
    ingredientId,
    ingredientName,
    qtyBefore,
    qtyAfter,
    reason,
    adminStaffId,
    adminName,
    businessDate,
  } = params;

  if (!reason.trim()) {
    throw new Error("Alasan koreksi wajib diisi.");
  }

  if (qtyAfter < 0) {
    throw new Error("Stok baru tidak boleh negatif.");
  }

  const { error: stockErr } = await supabase
    .from("ingredient")
    .update({ current_stock: qtyAfter })
    .eq("id", ingredientId);

  if (stockErr) {
    throw new Error(`Gagal memperbarui stok: ${stockErr.message}`);
  }

  const message = buildAdjustmentLogMessage(
    adminName,
    ingredientName,
    qtyBefore,
    qtyAfter,
    reason
  );

  const eventType: StockLogEventType = "ADJUSTMENT";

  const { error: logErr } = await supabase.from("stock_log").insert({
    ingredient_id: ingredientId,
    business_date: businessDate ?? null,
    event_type: eventType,
    qty_before: qtyBefore,
    qty_after: qtyAfter,
    reason: reason.trim(),
    message,
    created_by_staff_id: adminStaffId,
  });

  if (logErr) {
    throw new Error(`Stok diperbarui tetapi log audit gagal: ${logErr.message}`);
  }
}
