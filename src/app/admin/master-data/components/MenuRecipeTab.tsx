"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChefHat, Pencil, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
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
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const [menus, setMenus] = useState<MenuItemRow[]>([]);
  const [filter, setFilter] = useState<"all" | Department>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<MenuItemRow | null>(null);
  const [menuForm, setMenuForm] = useState<MenuForm>(emptyMenuForm);
  const [menuSaving, setMenuSaving] = useState(false);

  const [recipeMenu, setRecipeMenu] = useState<MenuItemRow | null>(null);

  const loadMenus = useCallback(async () => {
    if (!supabase) return;
    const { data, error: err } = await supabase
      .from("menu_item")
      .select("*")
      .order("department")
      .order("menu_name");

    if (err) throw new Error(err.message);
    setMenus(data ?? []);
  }, [supabase]);

  const loadAll = useCallback(async () => {
    if (!supabase) {
      setError("Supabase belum dikonfigurasi.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await loadMenus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat menu.");
    }
    setLoading(false);
  }, [loadMenus, supabase]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredMenus = useMemo(() => {
    if (filter === "all") return menus;
    return menus.filter((m) => m.department === filter);
  }, [menus, filter]);

  const openMenuCreate = () => {
    setEditingMenu(null);
    setMenuForm(emptyMenuForm());
    setMenuModalOpen(true);
  };

  const openMenuEdit = (m: MenuItemRow) => {
    setEditingMenu(m);
    setMenuForm({
      menu_name: m.menu_name,
      department: m.department,
      price: String(m.price),
    });
    setMenuModalOpen(true);
  };

  const saveMenu = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const name = menuForm.menu_name.trim();
    const price = parseFloat(menuForm.price);

    if (!name) {
      setError("Nama menu wajib diisi.");
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      setError("Harga tidak valid.");
      return;
    }

    setMenuSaving(true);
    setError(null);

    if (editingMenu) {
      const { error: err } = await supabase
        .from("menu_item")
        .update({ menu_name: name, price })
        .eq("id", editingMenu.id);
      if (err) setError(err.message);
      else setMenuModalOpen(false);
    } else {
      const { error: err } = await supabase.from("menu_item").insert({
        menu_name: name,
        department: menuForm.department,
        price,
      });
      if (err) setError(err.message);
      else setMenuModalOpen(false);
    }

    setMenuSaving(false);
    await loadMenus();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "bar", "kitchen"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setFilter(d)}
              className={`min-h-10 rounded-full px-4 text-sm font-medium ${
                filter === d
                  ? "bg-teal-600 text-white font-medium"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {d === "all" ? "Semua" : d === "bar" ? "Bar" : "Kitchen"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={openMenuCreate}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-medium text-white transition-all hover:bg-teal-700 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Tambah Menu Baru
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-sm text-slate-500">Memuat daftar menu…</p>
      ) : filteredMenus.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-8 text-center text-sm text-slate-500">Belum ada menu jualan.</p>
      ) : (
        <div className="-mx-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Menu</th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Dept</th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Harga</th>
                <th className="px-4 py-3.5 text-xs font-semibold uppercase tracking-wider text-slate-600">Status</th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {filteredMenus.map((menu) => (
                <tr key={menu.id} className="border-b border-slate-100 bg-white transition-colors last:border-b-0 hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-medium text-slate-900">{menu.menu_name}</td>
                  <td className="px-4 py-3 font-medium capitalize text-slate-900">{menu.department}</td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">
                    Rp {Number(menu.price).toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                        menu.is_active
                          ? "border border-teal-200 bg-teal-50 text-teal-700"
                          : "border border-slate-200 bg-slate-100 text-slate-700"
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
                        className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <ChefHat className="h-4 w-4" />
                        Kelola Resep
                      </button>
                      <button
                        type="button"
                        onClick={() => openMenuEdit(menu)}
                        className="flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
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
        </div>
      )}

      <Modal
        open={menuModalOpen}
        title={editingMenu ? "Edit Menu" : "Tambah Menu Baru"}
        onClose={() => setMenuModalOpen(false)}
      >
        <form onSubmit={saveMenu} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Nama Menu</span>
            <input
              required
              value={menuForm.menu_name}
              onChange={(e) => setMenuForm((f) => ({ ...f, menu_name: e.target.value }))}
              className="min-h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Departemen</span>
            <select
              value={menuForm.department}
              disabled={!!editingMenu}
              onChange={(e) =>
                setMenuForm((f) => ({ ...f, department: e.target.value as Department }))
              }
              className="min-h-12 w-full rounded-lg border border-slate-200 bg-white px-4 text-slate-900 outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Harga (Rp)</span>
            <input
              required
              inputMode="decimal"
              value={menuForm.price}
              onChange={(e) => setMenuForm((f) => ({ ...f, price: e.target.value }))}
              className="min-h-12 w-full rounded-lg border border-slate-200 bg-white px-4 tabular-nums text-slate-900 outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />
          </label>
          <button
            type="submit"
            disabled={menuSaving}
            className="min-h-12 w-full rounded-lg bg-teal-600 font-medium text-white transition-all hover:bg-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {menuSaving ? "Menyimpan…" : "Simpan Menu"}
          </button>
        </form>
      </Modal>

      <RecipeBuilderModal
        menu={recipeMenu}
        onClose={() => setRecipeMenu(null)}
        onSaved={() => void loadMenus()}
      />
    </div>
  );
}
