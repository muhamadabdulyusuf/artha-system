"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit, Loader2, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { IngredientModal, type IngredientDepartment, type IngredientRecord, type IngredientUnit } from "@/components/admin/IngredientModal";
import { Toast } from "@/components/ui/Toast";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { IngredientKind } from "@/lib/types/database";

interface Ingredient {
  id: string;
  name: string;
  unit: IngredientUnit;
  purchase_unit: string | null;
  purchase_to_stock_factor: number;
  default_unit_price: number;
  department: IngredientDepartment;
  kind: IngredientKind;
  minimum_stock: number;
  is_stock_tracked: boolean;
  primary_supplier_id: string | null;
  supplier_name: string | null;
  is_active: boolean;
  created_at?: string;
}

type FormDepartment = Ingredient["department"];
type DeptFilter = "all" | FormDepartment;

const SEARCH_INPUT_CLASS =
  "min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-500";

const TABLE_COL_COUNT = 10;

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function mapRow(row: Record<string, unknown>): Ingredient {
  return {
    id: String(row.id),
    name: String(row.name),
    unit: (row.unit ? String(row.unit) : "gr") as Ingredient["unit"],
    purchase_unit: row.purchase_unit ? String(row.purchase_unit) : null,
    purchase_to_stock_factor: Number(row.purchase_to_stock_factor ?? 1),
    default_unit_price: Number(row.default_unit_price ?? 0),
    department: (row.department as FormDepartment) || "bar",
    kind: (row.kind === "premix" ? "premix" : "raw") as IngredientKind,
    minimum_stock: Number(row.minimum_stock ?? 0),
    is_stock_tracked:
      row.is_stock_tracked !== undefined && row.is_stock_tracked !== null
        ? Boolean(row.is_stock_tracked)
        : true,
    primary_supplier_id: row.primary_supplier_id ? String(row.primary_supplier_id) : null,
    supplier_name:
      row.supplier && typeof row.supplier === "object" && !Array.isArray(row.supplier)
        ? String((row.supplier as Record<string, unknown>).name ?? "")
        : null,
    is_active: row.is_active !== undefined && row.is_active !== null ? Boolean(row.is_active) : true,
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

function toModalRecord(item: Ingredient): IngredientRecord {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    purchase_unit: item.purchase_unit,
    purchase_to_stock_factor: item.purchase_to_stock_factor,
    default_unit_price: item.default_unit_price,
    department: item.department,
    kind: item.kind,
    minimum_stock: item.minimum_stock,
    is_stock_tracked: item.is_stock_tracked,
    primary_supplier_id: item.primary_supplier_id,
    is_active: item.is_active,
  };
}

export function IngredientsTab() {
  const supabase = getSupabaseClient();
  const canEdit = canEditStaffData(getStaffSession()?.role);

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<IngredientRecord | null>(null);
  const [deptFilter, setDeptFilter] = useState<DeptFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null
  );

  const fetchIngredients = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("ingredient")
        .select("*, supplier:primary_supplier_id ( name )")
        .order("name", { ascending: true });

      if (error) throw error;

      setIngredients((data ?? []).map((row) => mapRow(row as Record<string, unknown>)));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal memuat bahan baku.";
      setToast({ message, variant: "error" });
      setIngredients([]);
    }

    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchIngredients();
  }, [fetchIngredients]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredIngredients = useMemo(() => {
    return ingredients.filter((item) => {
      const matchesDept = deptFilter === "all" || item.department === deptFilter;
      const matchesName =
        !normalizedSearch || item.name.toLowerCase().includes(normalizedSearch);
      return matchesDept && matchesName;
    });
  }, [deptFilter, ingredients, normalizedSearch]);

  const openCreateModal = () => {
    setEditingIngredient(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: Ingredient) => {
    setEditingIngredient(toModalRecord(item));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingIngredient(null);
  };

  const handleDeactivate = async (item: Ingredient) => {
    if (!item.is_active) return;

    const confirmed = window.confirm(`Nonaktifkan bahan "${item.name}"?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("ingredient")
        .update({ is_active: false })
        .eq("id", item.id);

      if (error) throw error;

      setToast({ message: `"${item.name}" dinonaktifkan.`, variant: "success" });
      await fetchIngredients();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menonaktifkan bahan.";
      setToast({ message, variant: "error" });
    }
  };

  const handleActivate = async (item: Ingredient) => {
    if (item.is_active) return;

    const confirmed = window.confirm(`Aktifkan lagi bahan "${item.name}"?`);
    if (!confirmed) return;

    try {
      const { error } = await supabase
        .from("ingredient")
        .update({ is_active: true })
        .eq("id", item.id);

      if (error) throw error;

      setToast({ message: `"${item.name}" aktif lagi.`, variant: "success" });
      await fetchIngredients();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Gagal mengaktifkan bahan. Pastikan tidak ada bahan aktif dengan nama dan departemen yang sama.";
      setToast({ message, variant: "error" });
    }
  };

  const departmentLabel = (dept: FormDepartment) => (dept === "bar" ? "Bar" : "Kitchen");

  const emptyTableMessage = normalizedSearch
    ? `Bahan baku dengan kata kunci '${searchTerm.trim()}' tidak ditemukan.`
    : deptFilter === "all"
      ? "Belum ada bahan baku untuk filter ini."
      : `Belum ada bahan baku departemen ${deptFilter === "bar" ? "Bar" : "Kitchen"}.`;

  return (
    <div className="space-y-4">
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? "success"}
        onDismiss={() => setToast(null)}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "bar", "kitchen"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDeptFilter(d)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium transition ${
                deptFilter === d
                  ? "bg-teal-600 text-white shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {d === "all" ? "Semua" : d === "bar" ? "Bar" : "Kitchen"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 lg:max-w-xl lg:flex-1 lg:justify-end">
          <div className="relative min-w-0 flex-1 sm:max-w-xs lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama bahan baku…"
              autoCorrect="off"
              spellCheck={false}
              className={SEARCH_INPUT_CLASS}
              aria-label="Cari bahan baku"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-600 transition hover:text-slate-700"
                aria-label="Hapus pencarian"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {canEdit ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 font-semibold text-white transition hover:bg-teal-600"
            >
              <Plus className="h-4 w-4" />
              Tambah Bahan Baku
            </button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
          Memuat bahan baku dari Supabase…
        </div>
      ) : ingredients.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-16 text-center text-sm text-slate-600">
          Belum ada bahan baku. Klik &quot;Tambah Bahan Baku&quot; untuk mulai.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
              <tr>
                <th className="w-14 px-4 py-3.5 font-semibold">No</th>
                <th className="px-4 py-3.5 font-semibold">Nama Bahan</th>
                <th className="px-4 py-3.5 font-semibold">Satuan Stok</th>
                <th className="px-4 py-3.5 font-semibold">Receive</th>
                <th className="px-4 py-3.5 font-semibold">Harga</th>
                <th className="px-4 py-3.5 font-semibold">Jenis</th>
                <th className="px-4 py-3.5 font-semibold">Tracking</th>
                <th className="px-4 py-3.5 font-semibold">Supplier</th>
                <th className="px-4 py-3.5 font-semibold">Departemen</th>
                <th className="px-4 py-3.5 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredIngredients.length === 0 ? (
                <tr>
                  <td
                    colSpan={TABLE_COL_COUNT}
                    className="px-4 py-12 text-center text-sm text-slate-600"
                  >
                    {emptyTableMessage}
                  </td>
                </tr>
              ) : (
                filteredIngredients.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`bg-white transition-colors hover:bg-slate-50/80 ${!item.is_active ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium tabular-nums text-slate-900">{index + 1}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{item.unit}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {item.purchase_unit ? (
                        <span>
                          1 {item.purchase_unit} = {item.purchase_to_stock_factor} {item.unit}
                        </span>
                      ) : (
                        <span className="text-slate-600">Sama</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">
                      {item.default_unit_price > 0 ? (
                        <span>
                          {formatRupiah(item.default_unit_price)} /{" "}
                          {item.purchase_unit || item.unit}
                        </span>
                      ) : (
                        <span className="text-slate-600">Belum ada</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs capitalize ${
                          item.kind === "premix"
                            ? "bg-amber-500/20 text-amber-900"
                            : "bg-teal-50 text-teal-700"
                        }`}
                      >
                        {item.kind}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                          item.is_stock_tracked
                            ? "border border-sky-200 bg-sky-50 text-sky-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {item.is_stock_tracked ? "Stok" : "Non-stok"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {item.supplier_name ? (
                        item.supplier_name
                      ) : (
                        <span className="text-slate-600">Belum ada</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">{departmentLabel(item.department)}</td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <div className="flex justify-end gap-2">
                          {item.is_active ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditModal(item)}
                                className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-teal-700 ring-1 ring-slate-200 transition hover:bg-teal-50"
                                aria-label={`Edit ${item.name}`}
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeactivate(item)}
                                className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-red-700 ring-1 ring-slate-200 transition hover:bg-red-500/10"
                                aria-label={`Nonaktifkan ${item.name}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleActivate(item)}
                              className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-teal-700 ring-1 ring-slate-200 transition hover:bg-teal-50"
                              aria-label={`Aktifkan ${item.name}`}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="block text-right text-xs text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <IngredientModal
        open={isModalOpen}
        ingredient={editingIngredient}
        onClose={closeModal}
        onSaved={fetchIngredients}
        onSuccess={(message) => setToast({ message, variant: "success" })}
        onError={(message) => setToast({ message, variant: "error" })}
      />
    </div>
  );
}
