"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, PenLine, Search, X } from "lucide-react";
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
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [ingredientPickerOpen, setIngredientPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const ingredientPickerRef = useRef<HTMLDivElement | null>(null);
  const ingredientSearchInputRef = useRef<HTMLInputElement | null>(null);

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

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!ingredientPickerRef.current?.contains(event.target as Node)) {
        setIngredientPickerOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!ingredientPickerOpen) return;
    window.requestAnimationFrame(() => ingredientSearchInputRef.current?.focus());
  }, [ingredientPickerOpen]);

  const filteredIngredients = useMemo(() => {
    const query = ingredientSearch.trim().toLowerCase();
    return ingredients.filter((ingredient) => {
      const matchesDepartment =
        departmentFilter === "all" || ingredient.department === departmentFilter;
      const matchesSearch =
        !query ||
        [
          ingredient.name,
          ingredient.department,
          ingredient.unit,
          String(ingredient.current_stock),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesDepartment && matchesSearch;
    });
  }, [departmentFilter, ingredientSearch, ingredients]);

  const selected = ingredients.find((i) => i.id === selectedId);

  const selectIngredient = (ingredient: IngredientRow) => {
    setSelectedId(ingredient.id);
    setNewQty(String(ingredient.current_stock));
    setIngredientSearch("");
    setIngredientPickerOpen(false);
  };

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
      <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat data koreksi stok…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-teal-700">
          Jurnal Koreksi Stok (Admin)
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Setiap koreksi menambah record baru di stock_log berstatus ADJUSTMENT — data lama tidak
          dihapus.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {toast ? (
        <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-700">
          {toast}
        </p>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["all", "bar", "kitchen"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDepartmentFilter(d)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase ${
                departmentFilter === d
                  ? "bg-teal-600 text-white"
                  : "bg-slate-50 text-slate-600"
              }`}
            >
              {d === "all" ? "Semua" : d}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-600">
          <p>Pilih bahan</p>
          <div
            ref={ingredientPickerRef}
            className="relative mt-1"
            role="combobox"
            aria-expanded={ingredientPickerOpen}
            aria-controls="stock-adjustment-ingredient-list"
          >
            <button
              type="button"
              onClick={() => setIngredientPickerOpen((open) => !open)}
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 pr-12 text-left text-sm text-slate-900 hover:border-slate-200 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-100"
              aria-label="Buka pilihan bahan"
            >
              <span className="min-w-0">
                {selected ? (
                  <>
                    <span className="block truncate font-medium">{selected.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-600">
                      {selected.department} · stok {Number(selected.current_stock).toLocaleString("id-ID")} {selected.unit}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-600">Klik pilih bahan...</span>
                )}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-600 transition ${ingredientPickerOpen ? "rotate-180" : ""}`}
              />
            </button>
            {selected ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedId("");
                  setNewQty("");
                  setIngredientSearch("");
                  setIngredientPickerOpen(true);
                }}
                className="absolute right-9 top-2 flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-700"
                aria-label="Hapus pilihan bahan"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
            {ingredientPickerOpen ? (
              <div
                id="stock-adjustment-ingredient-list"
                role="listbox"
                className="absolute z-20 mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-xl shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              >
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input
                    ref={ingredientSearchInputRef}
                    type="search"
                    value={ingredientSearch}
                    onChange={(e) => setIngredientSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setIngredientPickerOpen(false);
                      if (e.key === "Enter" && filteredIngredients[0]) {
                        e.preventDefault();
                        selectIngredient(filteredIngredients[0]);
                      }
                    }}
                    placeholder="Search bahan..."
                    autoCorrect="off"
                    spellCheck={false}
                    className="min-h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-100"
                    aria-label="Cari bahan untuk koreksi stok"
                  />
                  {ingredientSearch ? (
                    <button
                      type="button"
                      onClick={() => setIngredientSearch("")}
                      className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-600 hover:bg-slate-50 hover:text-slate-700"
                      aria-label="Hapus pencarian bahan"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className="max-h-64 overflow-y-auto scrollbar-thin">
                  {filteredIngredients.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-slate-600">Bahan tidak ditemukan.</p>
                  ) : (
                    filteredIngredients.map((ing) => (
                      <button
                        key={ing.id}
                        type="button"
                        role="option"
                        aria-selected={selectedId === ing.id}
                        onClick={() => selectIngredient(ing)}
                        className={`flex w-full items-start justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
                          selectedId === ing.id
                            ? "bg-teal-600 text-white"
                            : "text-slate-700 hover:bg-slate-50/80"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{ing.name}</span>
                          <span className="mt-0.5 block text-xs opacity-70">
                            {ing.department} · {ing.unit}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs tabular-nums opacity-80">
                          {Number(ing.current_stock).toLocaleString("id-ID")}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {selected && canEdit ? (
          <>
            <label className="block text-xs text-slate-600">
              Stok baru
              <input
                type="number"
                min={0}
                step="any"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm tabular-nums text-slate-900"
              />
            </label>
            <label className="block text-xs text-slate-600">
              Alasan koreksi <span className="text-red-700">*</span>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Contoh: Koreksi typo opname staff, barang ditemukan di gudang"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <button
              type="button"
              disabled={isSaving || !reason.trim()}
              onClick={() => void handleAdjust()}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 text-sm font-bold text-white disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
              Simpan Koreksi & Catat Audit
            </button>
          </>
        ) : selected && !canEdit ? (
          <p className="text-sm text-slate-600">Mode penonton: koreksi stok tidak tersedia.</p>
        ) : null}
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-600">
          Riwayat audit terbaru
        </h4>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-600">Belum ada entri stock_log.</p>
        ) : (
          <ul className="max-h-64 space-y-2 overflow-y-auto text-xs text-slate-600 scrollbar-thin">
            {logs.map((log) => (
              <li key={log.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <p className="text-slate-700">{log.message}</p>
                <p className="mt-1 text-slate-600">
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
