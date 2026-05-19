import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Department } from "@/lib/types/database";
import { resolveBusinessDate } from "@/lib/utils/dateHelper";

type Supabase = SupabaseClient<Database>;

export type ProducePremixParams = {
  supabase: Supabase;
  ingredientId: string;
  quantity: number;
  department: Department;
  staffId: string;
  businessDate?: string;
};

export type ProducePremixResult = {
  ok: boolean;
  output_ingredient_id: string;
  batch_quantity: number;
  business_date: string;
};

export async function producePremix(
  params: ProducePremixParams
): Promise<ProducePremixResult> {
  const {
    supabase,
    ingredientId,
    quantity,
    department,
    staffId,
    businessDate = resolveBusinessDate(),
  } = params;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Jumlah batch harus angka positif.");
  }

  const { data, error } = await supabase.rpc("produce_premix", {
    p_ingredient_id: ingredientId,
    p_quantity: quantity,
    p_department: department,
    p_staff_id: staffId,
    p_business_date: businessDate,
  });

  if (error) {
    throw new Error(translateProduceError(error.message));
  }

  if (!data || typeof data !== "object" || !("ok" in data)) {
    throw new Error("Respons produksi tidak valid.");
  }

  const result = data as ProducePremixResult;
  if (!result.ok) {
    throw new Error("Produksi premix gagal.");
  }

  return result;
}

function translateProduceError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("insufficient stock")) {
    return "Stok bahan baku tidak mencukupi untuk batch ini.";
  }
  if (lower.includes("no active recipe")) {
    return "Resep premix belum dikonfigurasi untuk bahan ini.";
  }
  if (lower.includes("not a premix")) {
    return "Bahan yang dipilih bukan kategori premix (WIP).";
  }
  if (lower.includes("department")) {
    return "Bahan tidak sesuai departemen operasional Anda.";
  }
  if (lower.includes("viewer")) {
    return "Akun viewer tidak dapat menjalankan produksi.";
  }
  return message;
}
