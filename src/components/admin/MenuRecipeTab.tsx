"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChefHat, Loader2, Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, MenuItemRow } from "@/lib/types/database";
import { RecipeBuilderModal } from "./RecipeBuilderModal";

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

export function MenuRecipeTab() {
  const supabase = getSupabaseClient();

  const [menus, setMenus] = useState<MenuItemRow[]>([]);
  const [filter, setFilter] = useState<"all" | Department>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItemRow | null>(null);
  const [menuForm, setMenuForm] = useState<MenuForm>(emptyMenuForm);
  const [recipeMenu, setRecipeMenu] = useState<MenuItemRow | null>(null);

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

  useEffect(() => {
    void fetchMenus();
  }, [fetchMenus]);

  const filteredMenus = useMemo(() => {
    if (filter === "all") return menus;
    return menus.filter((m) => m.department === filter);
  }, [filter, menus]);

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
      await fetchMenus();
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        <button
          type="button"
          onClick={openCreateModal}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-semibold text-white transition hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          Tambah Menu Baru
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          Memuat menu dari Supabase…
        </div>
      ) : filteredMenus.length === 0 ? (
        <p className="py-12 text-center text-zinc-500">Belum ada menu jualan.</p>
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
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setRecipeMenu(menu)}
                        className="flex min-h-9 items-center gap-1 rounded-lg bg-indigo-600/20 px-3 text-indigo-300 ring-1 ring-indigo-500/40 hover:bg-indigo-600/30"
                      >
                        <ChefHat className="h-4 w-4" />
                        Kelola Resep
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(menu)}
                        className="flex min-h-9 items-center gap-1 rounded-lg px-3 text-zinc-400 ring-1 ring-zinc-600 hover:text-white"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

      <RecipeBuilderModal
        menu={recipeMenu}
        onClose={() => setRecipeMenu(null)}
        onSaved={() => void fetchMenus()}
      />
    </div>
  );
}
