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
                  ? "bg-indigo-600 text-white"
                  : "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700"
              }`}
            >
              {d === "all" ? "Semua" : d === "bar" ? "Bar" : "Kitchen"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={openMenuCreate}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-semibold text-white hover:bg-indigo-500"
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

      {loading ? (
        <p className="py-8 text-center text-zinc-500">Memuat daftar menu…</p>
      ) : filteredMenus.length === 0 ? (
        <p className="py-8 text-center text-zinc-500">Belum ada menu jualan.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto rounded-xl border border-zinc-700">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-800/80 text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Menu</th>
                <th className="px-4 py-3 font-medium">Dept</th>
                <th className="px-4 py-3 font-medium">Harga</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700/80">
              {filteredMenus.map((menu) => (
                <tr key={menu.id} className="bg-zinc-900/40 hover:bg-zinc-800/40">
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
                        onClick={() => openMenuEdit(menu)}
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
        open={menuModalOpen}
        title={editingMenu ? "Edit Menu" : "Tambah Menu Baru"}
        onClose={() => setMenuModalOpen(false)}
      >
        <form onSubmit={saveMenu} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-400">Nama Menu</span>
            <input
              required
              value={menuForm.menu_name}
              onChange={(e) => setMenuForm((f) => ({ ...f, menu_name: e.target.value }))}
              className="min-h-12 w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 text-white"
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
              className="min-h-12 w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 text-white disabled:opacity-60"
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
              required
              inputMode="decimal"
              value={menuForm.price}
              onChange={(e) => setMenuForm((f) => ({ ...f, price: e.target.value }))}
              className="min-h-12 w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 text-white tabular-nums"
            />
          </label>
          <button
            type="submit"
            disabled={menuSaving}
            className="min-h-12 w-full rounded-xl bg-indigo-600 font-semibold text-white disabled:opacity-50"
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
