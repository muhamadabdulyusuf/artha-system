"use client";

import { useCallback, useEffect, useState } from "react";
import { Factory, Loader2 } from "lucide-react";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { producePremix } from "@/lib/production/producePremix";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, IngredientRow } from "@/lib/types/database";
import { formatBusinessDateLabel, resolveBusinessDate } from "@/lib/utils/dateHelper";

type ProductionFormProps = {
  department: Department;
};

export function ProductionForm({ department }: ProductionFormProps) {
  const supabase = getSupabaseClient();
  const session = getStaffSession();
  const canEdit = canEditStaffData(session?.role);

  const [premixItems, setPremixItems] = useState<IngredientRow[]>([]);
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const businessDate = resolveBusinessDate();

  const loadPremix = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from("ingredient")
      .select("*")
      .eq("department", department)
      .eq("kind", "premix")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (fetchErr) {
      setError(fetchErr.message);
      setPremixItems([]);
    } else {
      setPremixItems(data ?? []);
    }

    setIsLoading(false);
  }, [department, supabase]);

  useEffect(() => {
    void loadPremix();
  }, [loadPremix]);

  const selected = premixItems.find((i) => i.id === ingredientId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!session || !canEdit) {
      setError("Anda tidak memiliki izin untuk menjalankan produksi.");
      return;
    }

    if (session.role === "bar_staff" && department !== "bar") {
      setError("Staf bar hanya dapat memproduksi di departemen bar.");
      return;
    }
    if (session.role === "kitchen_staff" && department !== "kitchen") {
      setError("Staf kitchen hanya dapat memproduksi di departemen kitchen.");
      return;
    }

    if (!selected) {
      setError("Pilih bahan premix terlebih dahulu.");
      return;
    }

    const batchQty = parseFloat(quantity.replace(",", "."));
    if (!Number.isFinite(batchQty) || batchQty <= 0) {
      setError("Jumlah batch harus angka positif.");
      return;
    }

    setIsSubmitting(true);

    try {
      await producePremix({
        supabase,
        ingredientId: selected.id,
        quantity: batchQty,
        department,
        staffId: session.id,
        businessDate,
      });

      setSuccess(
        `Produksi ${selected.name} (${batchQty} batch) berhasil — ${formatBusinessDateLabel(businessDate)}.`
      );
      setIngredientId("");
      setQuantity("");
      await loadPremix();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Produksi gagal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
        <LoadingState />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-emerald-900/50 bg-emerald-950/20 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600/20 ring-1 ring-emerald-500/40">
          <Factory className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Produksi Premix (WIP)</h2>
          <p className="text-xs text-zinc-500">
            Departemen {department} · {formatBusinessDateLabel(businessDate)}
          </p>
        </div>
      </div>

      {premixItems.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">
          Belum ada bahan premix aktif untuk departemen {department}. Admin dapat menandai
          bahan dengan jenis premix dan menambahkan resep di database.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Bahan premix (WIP)
            </span>
            <select
              value={ingredientId}
              onChange={(e) => setIngredientId(e.target.value)}
              disabled={!canEdit || isSubmitting}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white"
              required
            >
              <option value="">— Pilih bahan —</option>
              {premixItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} (stok: {Number(item.current_stock).toLocaleString("id-ID")}{" "}
                  {item.unit})
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Jumlah batch
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={!canEdit || isSubmitting}
              placeholder="mis. 2"
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white"
              required
            />
          </label>

          {error && (
            <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg border border-emerald-800/50 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-300">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={!canEdit || isSubmitting}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Factory className="h-4 w-4" />
            )}
            {isSubmitting ? "Memproses…" : "Produksi batch"}
          </button>
        </form>
      )}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center gap-2 text-sm text-zinc-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      Memuat daftar premix…
    </div>
  );
}
