"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { IngredientModal, type IngredientDepartment, type IngredientRecord, type IngredientUnit } from "@/components/admin/IngredientModal";
import { Toast } from "@/components/ui/Toast";
import { getSupabaseClient } from "@/lib/supabase/client";

interface Ingredient {
  id: string;
  name: string;
  unit: IngredientUnit;
  department: IngredientDepartment;
  minimum_stock: number;
  is_active: boolean;
  created_at?: string;
}

type FormDepartment = Ingredient["department"];
type DeptFilter = "all" | FormDepartment;

const SEARCH_INPUT_CLASS =
  "min-h-11 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 pl-10 pr-10 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

const TABLE_COL_COUNT = 5;

function mapRow(row: Record<string, unknown>): Ingredient {
  return {
    id: String(row.id),
    name: String(row.name),
    unit: (row.unit ? String(row.unit) : "gr") as Ingredient["unit"],
    department: (row.department as FormDepartment) || "bar",
    minimum_stock: Number(row.minimum_stock ?? 0),
    is_active: row.is_active !== undefined && row.is_active !== null ? Boolean(row.is_active) : true,
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

function toModalRecord(item: Ingredient): IngredientRecord {
  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    department: item.department,
    minimum_stock: item.minimum_stock,
    is_active: item.is_active,
  };
}

export function IngredientsTab() {
  const supabase = getSupabaseClient();

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
        .select("*")
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
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/30"
                  : "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700 hover:text-white"
              }`}
            >
              {d === "all" ? "Semua" : d === "bar" ? "Bar" : "Kitchen"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 lg:max-w-xl lg:flex-1 lg:justify-end">
          <div className="relative min-w-0 flex-1 sm:max-w-xs lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
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
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 transition hover:text-zinc-200"
                aria-label="Hapus pencarian"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-semibold text-white transition hover:bg-indigo-500"
          >
            <Plus className="h-4 w-4" />
            Tambah Bahan Baku
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          Memuat bahan baku dari Supabase…
        </div>
      ) : ingredients.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-700 py-16 text-center text-sm text-zinc-500">
          Belum ada bahan baku. Klik &quot;Tambah Bahan Baku&quot; untuk mulai.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-700">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-zinc-800 text-zinc-400">
              <tr>
                <th className="w-14 px-4 py-3 font-medium">No</th>
                <th className="px-4 py-3 font-medium">Nama Bahan</th>
                <th className="px-4 py-3 font-medium">Satuan Unit</th>
                <th className="px-4 py-3 font-medium">Departemen</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700/80">
              {filteredIngredients.length === 0 ? (
                <tr>
                  <td
                    colSpan={TABLE_COL_COUNT}
                    className="px-4 py-12 text-center text-sm text-zinc-500"
                  >
                    {emptyTableMessage}
                  </td>
                </tr>
              ) : (
                filteredIngredients.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`bg-zinc-900/40 ${!item.is_active ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3 tabular-nums text-zinc-500">{index + 1}</td>
                    <td className="px-4 py-3 font-medium text-white">{item.name}</td>
                    <td className="px-4 py-3 text-zinc-300">{item.unit}</td>
                    <td className="px-4 py-3 text-zinc-300">{departmentLabel(item.department)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          disabled={!item.is_active}
                          className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-indigo-400 ring-1 ring-zinc-600 transition hover:bg-indigo-600/10 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Edit ${item.name}`}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeactivate(item)}
                          disabled={!item.is_active}
                          className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-red-400 ring-1 ring-zinc-600 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Nonaktifkan ${item.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
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
