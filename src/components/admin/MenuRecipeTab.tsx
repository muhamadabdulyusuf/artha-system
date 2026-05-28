"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Beaker, ChefHat, Loader2, Pencil, Plus, Search, Trash2, Wand2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, IngredientRow, MenuItemRow } from "@/lib/types/database";
import { RecipeBuilder, type RecipeBuilderInitialTarget } from "./RecipeBuilder";

const DEPARTMENTS: { value: Department; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "kitchen", label: "Kitchen" },
];

type MenuForm = {
  menu_name: string;
  department: Department;
  price: string;
};

const emptyMenuForm = (): MenuForm => ({
  menu_name: "",
  department: "bar",
  price: "0",
});

const SEARCH_INPUT_CLASS =
  "min-h-11 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 pl-10 pr-10 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

type ViewMode = "menu" | "recipe" | "premix";

type RecipeIngredientSummary = {
  id: string;
  name: string;
  unit: string;
  quantity_per_serving: number;
};

type MenuRecipeSummary = MenuItemRow & {
  recipeIngredients: RecipeIngredientSummary[];
  hasRecipe: boolean;
};

type PremixRecipeSummary = IngredientRow & {
  components: RecipeIngredientSummary[];
  hasRecipe: boolean;
  yieldQuantity: number;
};

export function MenuRecipeTab() {
  const supabase = getSupabaseClient();
  const canEdit = canEditStaffData(getStaffSession()?.role);

  const [menus, setMenus] = useState<MenuItemRow[]>([]);
  const [recipeSummaries, setRecipeSummaries] = useState<MenuRecipeSummary[]>([]);
  const [premixSummaries, setPremixSummaries] = useState<PremixRecipeSummary[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("menu");
  const [filter, setFilter] = useState<"all" | Department>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRecipes, setIsLoadingRecipes] = useState(false);
  const [isLoadingPremix, setIsLoadingPremix] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItemRow | null>(null);
  const [menuForm, setMenuForm] = useState<MenuForm>(emptyMenuForm);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [recipeTarget, setRecipeTarget] = useState<RecipeBuilderInitialTarget | null>(null);

  const fetchMenus = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from("menu_item")
        .select("*")
        .order("menu_name", { ascending: true });

      if (fetchError) throw fetchError;

      setMenus(data ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal memuat menu dari Supabase.";
      setError(message);
      setMenus([]);
    }

    setIsLoading(false);
  }, [supabase]);

  const fetchRecipeSummaries = useCallback(async () => {
    setIsLoadingRecipes(true);

    try {
      const { data, error: fetchError } = await supabase
        .from("menu_item")
        .select(
          `
            *,
            menu_recipe_version (
              id,
              is_active,
              recipe_line (
                quantity_per_serving,
                ingredient:ingredient_id (
                  id,
                  name,
                  unit
                )
              )
            )
          `
        )
        .order("menu_name", { ascending: true });

      if (fetchError) throw fetchError;

      const summaries: MenuRecipeSummary[] = (data ?? []).map((row) => {
        const menu = row as unknown as MenuItemRow & {
          menu_recipe_version?: {
            is_active: boolean;
            recipe_line?: {
              quantity_per_serving: number;
              ingredient: { id: string; name: string; unit: string } | null;
            }[];
          }[];
        };

        const activeVersion = menu.menu_recipe_version?.find((version) => version.is_active);
        const recipeIngredients: RecipeIngredientSummary[] = [];

        for (const line of activeVersion?.recipe_line ?? []) {
          if (!line.ingredient) continue;
          recipeIngredients.push({
            id: line.ingredient.id,
            name: line.ingredient.name,
            unit: line.ingredient.unit,
            quantity_per_serving: Number(line.quantity_per_serving),
          });
        }

        const { menu_recipe_version: _versions, ...menuRow } = menu;

        return {
          ...(menuRow as MenuItemRow),
          recipeIngredients,
          hasRecipe: recipeIngredients.length > 0,
        };
      });

      setRecipeSummaries(summaries);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal memuat daftar resep dari Supabase.";
      setError(message);
      setRecipeSummaries([]);
    }

    setIsLoadingRecipes(false);
  }, [supabase]);

  const fetchPremixSummaries = useCallback(async () => {
    setIsLoadingPremix(true);

    try {
      const { data: premixRows, error: premixErr } = await supabase
        .from("ingredient")
        .select("*")
        .eq("kind", "premix")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (premixErr) throw premixErr;

      const premixList = (premixRows ?? []) as IngredientRow[];
      if (premixList.length === 0) {
        setPremixSummaries([]);
        setIsLoadingPremix(false);
        return;
      }

      const outputIds = premixList.map((p) => p.id);
      const { data: recipeRows, error: recipeErr } = await supabase
        .from("recipes")
        .select("id, output_ingredient_id, yield_quantity")
        .in("output_ingredient_id", outputIds)
        .eq("is_active", true);

      if (recipeErr) throw recipeErr;

      const recipeByOutput = new Map(
        (recipeRows ?? []).map((r) => [r.output_ingredient_id, r] as const)
      );

      const recipeIds = [...recipeByOutput.values()].map((recipe) => recipe.id);
      const componentsByRecipe = new Map<string, RecipeIngredientSummary[]>();

      if (recipeIds.length > 0) {
        const { data: componentRows, error: compErr } = await supabase
          .from("recipe_component")
          .select("recipe_id, qty_per_batch, ingredient_id")
          .in("recipe_id", recipeIds);

        if (compErr) throw compErr;

        const ingredientIds = [
          ...new Set((componentRows ?? []).map((c) => c.ingredient_id)),
        ];

        const { data: ingredientMeta, error: metaErr } = await supabase
          .from("ingredient")
          .select("id, name, unit")
          .in("id", ingredientIds);

        if (metaErr) throw metaErr;

        const metaById = new Map((ingredientMeta ?? []).map((i) => [i.id, i]));

        for (const comp of componentRows ?? []) {
          const meta = metaById.get(comp.ingredient_id);
          if (!meta) continue;
          const list = componentsByRecipe.get(comp.recipe_id) ?? [];
          list.push({
            id: meta.id,
            name: meta.name,
            unit: meta.unit,
            quantity_per_serving: Number(comp.qty_per_batch),
          });
          componentsByRecipe.set(comp.recipe_id, list);
        }
      }

      const summaries: PremixRecipeSummary[] = premixList.map((premix) => {
        const recipe = recipeByOutput.get(premix.id);
        const recipeId = recipe?.id;
        const components = recipeId ? (componentsByRecipe.get(recipeId) ?? []) : [];
        return {
          ...premix,
          components,
          yieldQuantity: Number(recipe?.yield_quantity ?? 1),
          hasRecipe: components.length > 0,
        };
      });

      setPremixSummaries(summaries);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal memuat daftar premix dari Supabase.";
      setError(message);
      setPremixSummaries([]);
    }

    setIsLoadingPremix(false);
  }, [supabase]);

  useEffect(() => {
    void fetchMenus();
    void fetchRecipeSummaries();
    void fetchPremixSummaries();
  }, [fetchMenus, fetchRecipeSummaries, fetchPremixSummaries]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredMenus = useMemo(() => {
    return menus.filter((menu) => {
      const matchesDept = filter === "all" || menu.department === filter;
      const matchesSearch =
        !normalizedSearch || menu.menu_name.toLowerCase().includes(normalizedSearch);
      return matchesDept && matchesSearch;
    });
  }, [filter, menus, normalizedSearch]);

  const filteredPremixSummaries = useMemo(() => {
    return premixSummaries.filter((item) => {
      const matchesDept = filter === "all" || item.department === filter;
      if (!matchesDept) return false;
      if (!normalizedSearch) return true;
      if (item.name.toLowerCase().includes(normalizedSearch)) return true;
      return item.components.some((c) => c.name.toLowerCase().includes(normalizedSearch));
    });
  }, [filter, normalizedSearch, premixSummaries]);

  const filteredRecipeSummaries = useMemo(() => {
    return recipeSummaries.filter((menu) => {
      const matchesDept = filter === "all" || menu.department === filter;
      if (!matchesDept) return false;
      if (!normalizedSearch) return true;

      if (menu.menu_name.toLowerCase().includes(normalizedSearch)) return true;

      return menu.recipeIngredients.some((ingredient) =>
        ingredient.name.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [filter, normalizedSearch, recipeSummaries]);

  const emptyListMessage =
    viewMode === "menu"
      ? normalizedSearch
        ? `Menu dengan kata kunci "${searchTerm.trim()}" tidak ditemukan.`
        : filter === "all"
          ? "Belum ada menu jualan."
          : `Belum ada menu departemen ${filter === "bar" ? "Bar" : "Kitchen"}.`
      : viewMode === "premix"
        ? normalizedSearch
          ? `Premix dengan kata kunci "${searchTerm.trim()}" tidak ditemukan.`
          : filter === "all"
            ? "Belum ada bahan premix. Tandai bahan di tab Ingredients."
            : `Belum ada premix departemen ${filter === "bar" ? "Bar" : "Kitchen"}.`
        : normalizedSearch
          ? `Resep dengan kata kunci "${searchTerm.trim()}" tidak ditemukan.`
          : filter === "all"
            ? "Belum ada resep terdaftar."
            : `Belum ada resep departemen ${filter === "bar" ? "Bar" : "Kitchen"}.`;

  const openCreateModal = () => {
    setEditingMenu(null);
    setMenuForm(emptyMenuForm());
    setIsModalOpen(true);
  };

  const openEditModal = (menu: MenuItemRow) => {
    setEditingMenu(menu);
    setMenuForm({
      menu_name: menu.menu_name,
      department: menu.department,
      price: String(menu.price),
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMenu(null);
    setMenuForm(emptyMenuForm());
  };

  const handleDeleteMenu = async (menu: MenuItemRow) => {
    const confirmed = window.confirm(
      `Hapus menu "${menu.menu_name}"? Kalau menu sudah punya history sold, menu akan dinonaktifkan agar laporan lama tetap aman.`
    );
    if (!confirmed) return;

    setError(null);

    try {
      const { count, error: soldCheckError } = await supabase
        .from("worksheet_sold_line")
        .select("id", { count: "exact", head: true })
        .eq("menu_item_id", menu.id);

      if (soldCheckError) throw soldCheckError;

      if ((count ?? 0) > 0) {
        if (!menu.is_active) {
          setToast(`"${menu.menu_name}" sudah nonaktif dan tetap disimpan untuk history laporan.`);
          return;
        }

        const { error: updateError } = await supabase
          .from("menu_item")
          .update({ is_active: false })
          .eq("id", menu.id);

        if (updateError) throw updateError;

        setToast(`"${menu.menu_name}" sudah pernah dipakai, jadi dinonaktifkan.`);
        await Promise.all([fetchMenus(), fetchRecipeSummaries()]);
        return;
      }

      const { error: recipeDeleteError } = await supabase
        .from("menu_recipe_version")
        .delete()
        .eq("menu_item_id", menu.id);

      if (recipeDeleteError) throw recipeDeleteError;

      const { error: deleteError } = await supabase.from("menu_item").delete().eq("id", menu.id);

      if (deleteError) throw deleteError;

      setToast(`"${menu.menu_name}" berhasil dihapus.`);
      await Promise.all([fetchMenus(), fetchRecipeSummaries()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menghapus menu.";
      setError(message);
      setToast(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const menu_name = menuForm.menu_name.trim();
    const price = parseFloat(menuForm.price);
    const department = menuForm.department;

    if (!menu_name) {
      setError("Nama menu wajib diisi.");
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      setError("Harga tidak valid.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (editingMenu) {
        const { error: updateError } = await supabase
          .from("menu_item")
          .update({ menu_name, price })
          .eq("id", editingMenu.id);

        if (updateError) throw updateError;
        setToast("Menu berhasil diperbarui.");
      } else {
        const { error: insertError } = await supabase.from("menu_item").insert([
          {
            menu_name,
            price,
            department,
            is_active: true,
          },
        ]);

        if (insertError) throw insertError;
        setToast("Menu baru berhasil ditambahkan.");
      }

      closeModal();
      await Promise.all([fetchMenus(), fetchRecipeSummaries()]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan menu.";
      setError(message);
      setToast(null);
    }

    setIsSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <Toast message={toast} onDismiss={() => setToast(null)} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setViewMode("menu")}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
              viewMode === "menu"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/30"
                : "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700 hover:text-white"
            }`}
          >
            Daftar Menu
          </button>
          <button
            type="button"
            onClick={() => setViewMode("recipe")}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
              viewMode === "recipe"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/30"
                : "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700 hover:text-white"
            }`}
          >
            Resep Menu
          </button>
          <button
            type="button"
            onClick={() => setViewMode("premix")}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold transition ${
              viewMode === "premix"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/30"
                : "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700 hover:text-white"
            }`}
          >
            Resep Premix
          </button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {(["all", "bar", "kitchen"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setFilter(d)}
                className={`min-h-10 rounded-full px-4 text-sm font-medium transition ${
                  filter === d
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
                placeholder={
                  viewMode === "menu"
                    ? "Cari nama menu…"
                    : viewMode === "premix"
                      ? "Cari premix atau bahan…"
                      : "Cari menu atau bahan resep…"
                }
                autoCorrect="off"
                spellCheck={false}
                className={SEARCH_INPUT_CLASS}
                aria-label={viewMode === "menu" ? "Cari menu" : "Cari resep"}
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

            {viewMode === "menu" && canEdit ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-semibold text-white transition hover:bg-indigo-500"
              >
                <Plus className="h-4 w-4" />
                Tambah Menu Baru
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                onClick={() => {
                  setRecipeTarget(null);
                  setBuilderOpen(true);
                }}
                className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-indigo-500/50 bg-indigo-600/15 px-4 font-semibold text-indigo-200 transition hover:bg-indigo-600/25"
              >
                <Wand2 className="h-4 w-4" />
                Recipe Builder
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {viewMode === "menu" ? (
        isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            Memuat menu dari Supabase…
          </div>
        ) : filteredMenus.length === 0 ? (
          <p className="py-12 text-center text-zinc-500">{emptyListMessage}</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-zinc-700">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-zinc-800 text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Menu</th>
                  <th className="px-4 py-3 font-medium">Departemen</th>
                  <th className="px-4 py-3 font-medium">Harga</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-700/80">
                {filteredMenus.map((menu) => (
                  <tr key={menu.id} className="bg-zinc-900/40">
                    <td className="px-4 py-3 font-medium text-white">{menu.menu_name}</td>
                    <td className="px-4 py-3 capitalize text-zinc-300">{menu.department}</td>
                    <td className="px-4 py-3 tabular-nums text-zinc-300">
                      Rp {Number(menu.price).toLocaleString("id-ID")}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                          menu.is_active
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-zinc-600/30 text-zinc-400"
                        }`}
                      >
                        {menu.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setRecipeTarget({ type: "menu", item: menu });
                              setBuilderOpen(true);
                            }}
                            disabled={!menu.is_active}
                            className="flex min-h-9 items-center gap-1 rounded-lg bg-indigo-600/20 px-3 text-indigo-300 ring-1 ring-indigo-500/40 hover:bg-indigo-600/30 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <ChefHat className="h-4 w-4" />
                            Kelola Resep
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(menu)}
                            disabled={!menu.is_active}
                            className="flex min-h-9 items-center gap-1 rounded-lg px-3 text-zinc-400 ring-1 ring-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Pencil className="h-4 w-4" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteMenu(menu)}
                            className="flex min-h-9 items-center gap-1 rounded-lg px-3 text-red-400 ring-1 ring-zinc-600 hover:bg-red-500/10"
                          >
                            <Trash2 className="h-4 w-4" />
                            Hapus
                          </button>
                        </div>
                      ) : (
                        <span className="block text-right text-xs text-zinc-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : viewMode === "premix" ? (
        isLoadingPremix ? (
          <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            Memuat resep premix…
          </div>
        ) : filteredPremixSummaries.length === 0 ? (
          <p className="py-12 text-center text-zinc-500">{emptyListMessage}</p>
        ) : (
          <div className="space-y-3">
            {filteredPremixSummaries.map((premix) => (
              <article
                key={premix.id}
                className="rounded-xl border border-amber-500/20 bg-zinc-900/50 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold text-white">
                      <Beaker className="h-4 w-4 text-amber-400" />
                      {premix.name}
                    </h3>
                    <p className="mt-1 text-xs capitalize text-zinc-500">
                      {premix.department} · {premix.unit} ·{" "}
                      {premix.hasRecipe
                        ? `${premix.components.length} bahan baku · 1 batch = ${premix.yieldQuantity} ${premix.unit}`
                        : "Belum ada resep produksi"}
                    </p>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRecipeTarget({ type: "premix", ingredient: premix });
                        setBuilderOpen(true);
                      }}
                      className="flex min-h-9 shrink-0 items-center gap-1 self-start rounded-lg bg-amber-600/20 px-3 text-sm text-amber-200 ring-1 ring-amber-500/40 hover:bg-amber-600/30"
                    >
                      <Beaker className="h-4 w-4" />
                      Kelola Bahan Baku
                    </button>
                  ) : null}
                </div>
                {premix.components.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-zinc-800 pt-3 text-sm text-zinc-300">
                    {premix.components.map((component) => (
                      <li key={component.id} className="flex justify-between gap-3">
                        <span>{component.name}</span>
                        <span className="tabular-nums text-zinc-500">
                          {component.quantity_per_serving} {component.unit} / batch
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 border-t border-zinc-800 pt-3 text-sm text-zinc-500">
                    Resep produksi belum disusun. Contoh: Mont Blanc Cream dari bahan raw.
                  </p>
                )}
              </article>
            ))}
          </div>
        )
      ) : isLoadingRecipes ? (
        <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          Memuat daftar resep dari Supabase…
        </div>
      ) : filteredRecipeSummaries.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">{emptyListMessage}</p>
      ) : (
        <div className="space-y-3">
          {filteredRecipeSummaries.map((menu) => (
            <article
              key={menu.id}
              className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold text-white">{menu.menu_name}</h3>
                  <p className="mt-1 text-xs capitalize text-zinc-500">
                    {menu.department} · {menu.hasRecipe ? `${menu.recipeIngredients.length} bahan` : "Belum ada resep"}
                  </p>
                </div>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRecipeTarget({ type: "menu", item: menu });
                      setBuilderOpen(true);
                    }}
                    className="flex min-h-9 shrink-0 items-center gap-1 self-start rounded-lg bg-indigo-600/20 px-3 text-sm text-indigo-300 ring-1 ring-indigo-500/40 hover:bg-indigo-600/30"
                  >
                    <ChefHat className="h-4 w-4" />
                    Kelola Resep
                  </button>
                ) : null}
              </div>
              {menu.recipeIngredients.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-zinc-800 pt-3 text-sm text-zinc-300">
                  {menu.recipeIngredients.map((ingredient) => (
                    <li key={ingredient.id} className="flex justify-between gap-3">
                      <span>{ingredient.name}</span>
                      <span className="tabular-nums text-zinc-500">
                        {ingredient.quantity_per_serving} {ingredient.unit} / porsi
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 border-t border-zinc-800 pt-3 text-sm text-zinc-500">
                  Resep belum disusun. Klik Kelola Resep untuk menambahkan bahan baku.
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      <Modal
        open={isModalOpen}
        title={editingMenu ? "Edit Menu" : "Tambah Menu Baru"}
        onClose={closeModal}
      >
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-400">Nama Menu</span>
            <input
              type="text"
              required
              value={menuForm.menu_name}
              onChange={(e) => setMenuForm((f) => ({ ...f, menu_name: e.target.value }))}
              placeholder="Contoh: Espresso, Nasi Goreng Spesial…"
              className="min-h-12 w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-400">Departemen</span>
            <select
              value={menuForm.department}
              disabled={!!editingMenu}
              onChange={(e) =>
                setMenuForm((f) => ({ ...f, department: e.target.value as Department }))
              }
              className="min-h-12 w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-400">Harga (Rp)</span>
            <input
              type="text"
              required
              inputMode="decimal"
              value={menuForm.price}
              onChange={(e) => setMenuForm((f) => ({ ...f, price: e.target.value }))}
              className="min-h-12 w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 text-white tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Menyimpan ke Supabase…
              </>
            ) : editingMenu ? (
              "Simpan Perubahan"
            ) : (
              "Simpan Menu"
            )}
          </button>
        </form>
      </Modal>

      <RecipeBuilder
        open={builderOpen}
        initialTarget={recipeTarget}
        onClose={() => {
          setBuilderOpen(false);
          setRecipeTarget(null);
        }}
        onSaved={async () => {
          await Promise.all([fetchMenus(), fetchRecipeSummaries(), fetchPremixSummaries()]);
        }}
      />
    </div>
  );
}
