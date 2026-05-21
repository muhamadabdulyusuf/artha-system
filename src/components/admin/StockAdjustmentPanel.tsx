"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, PenLine } from "lucide-react";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, IngredientRow, StockLogRow } from "@/lib/types/database";
import { applyAdminStockAdjustment } from "@/lib/worksheet/stockAdjustment";
import { resolveBusinessDate } from "@/lib/utils/dateHelper";

export function StockAdjustmentPanel() {
  const supabase = getSupabaseClient();
  const canEdit = canEditStaffData(getStaffSession()?.role);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [logs, setLogs] = useState<StockLogRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [newQty, setNewQty] = useState("");
  const [reason, setReason] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<Department | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: ingData, error: ingErr } = await supabase
      .from("ingredient")
      .select("*")
      .eq("is_active", true)
      .eq("is_stock_tracked", true)
      .order("name", { ascending: true });

    if (ingErr) {
      setError(ingErr.message);
      setIsLoading(false);
      return;
    }

    setIngredients(ingData ?? []);

    const { data: logData, error: logErr } = await supabase
      .from("stock_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (logErr) {
      setError(logErr.message);
    } else {
      setLogs(logData ?? []);
    }

    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredIngredients =
    departmentFilter === "all"
      ? ingredients
      : ingredients.filter((i) => i.department === departmentFilter);

  const selected = ingredients.find((i) => i.id === selectedId);

  const handleAdjust = async () => {
    const session = getStaffSession();
    if (!session || !selected) return;

    const qtyAfter = parseFloat(newQty.replace(",", "."));
    if (!Number.isFinite(qtyAfter) || qtyAfter < 0) {
      setError("Stok baru harus angka valid ≥ 0.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await applyAdminStockAdjustment({
        supabase,
        ingredientId: selected.id,
        ingredientName: selected.name,
        qtyBefore: Number(selected.current_stock),
        qtyAfter,
        reason,
        adminStaffId: session.id,
        adminName: session.name,
        businessDate: resolveBusinessDate(),
      });

      setToast(`Koreksi stok ${selected.name} berhasil dicatat di jurnal audit.`);
      setNewQty("");
      setReason("");
      setSelectedId("");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan koreksi.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat data koreksi stok…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-indigo-400">
          Jurnal Koreksi Stok (Admin)
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          Setiap koreksi menambah record baru di stock_log berstatus ADJUSTMENT — data lama tidak
          dihapus.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {toast ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {toast}
        </p>
      ) : null}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["all", "bar", "kitchen"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDepartmentFilter(d)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase ${
                departmentFilter === d
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {d === "all" ? "Semua" : d}
            </button>
          ))}
        </div>

        <label className="block text-xs text-zinc-400">
          Pilih bahan
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              const ing = ingredients.find((i) => i.id === e.target.value);
              setNewQty(ing ? String(ing.current_stock) : "");
            }}
            className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-50"
          >
            <option value="">— Pilih bahan —</option>
            {filteredIngredients.map((ing) => (
              <option key={ing.id} value={ing.id}>
                {ing.name} ({ing.department}) — stok: {Number(ing.current_stock).toLocaleString("id-ID")}{" "}
                {ing.unit}
              </option>
            ))}
          </select>
        </label>

        {selected && canEdit ? (
          <>
            <label className="block text-xs text-zinc-400">
              Stok baru
              <input
                type="number"
                min={0}
                step="any"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm tabular-nums text-zinc-50"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Alasan koreksi <span className="text-red-400">*</span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Koreksi typo opname staff, barang ditemukan di gudang"
                className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50"
              />
            </label>
            <button
              type="button"
              disabled={isSaving || !reason.trim()}
              onClick={() => void handleAdjust()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 text-sm font-bold text-white disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
              Simpan Koreksi & Catat Audit
            </button>
          </>
        ) : selected && !canEdit ? (
          <p className="text-sm text-zinc-500">Mode penonton: koreksi stok tidak tersedia.</p>
        ) : null}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Riwayat audit terbaru
        </h4>
        {logs.length === 0 ? (
          <p className="text-sm text-zinc-500">Belum ada entri stock_log.</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto text-xs text-zinc-400">
            {logs.map((log) => (
              <li key={log.id} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <p className="text-zinc-200">{log.message}</p>
                <p className="mt-1 text-zinc-600">
                  {log.event_type} · {new Date(log.created_at).toLocaleString("id-ID")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
