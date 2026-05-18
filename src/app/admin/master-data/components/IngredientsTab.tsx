"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
import type { Department, IngredientRow, IngredientUnit } from "@/lib/types/database";

const UNITS: IngredientUnit[] = ["ml", "gram", "pcs"];
const DEPARTMENTS: { value: Department; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "kitchen", label: "Kitchen" },
];

type FilterDept = "all" | Department;

type IngredientForm = {
  name: string;
  department: Department;
  unit: IngredientUnit;
  slow_moving_threshold_days: string;
};

const emptyForm = (): IngredientForm => ({
  name: "",
  department: "bar",
  unit: "gram",
  slow_moving_threshold_days: "30",
});

export function IngredientsTab() {
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const [items, setItems] = useState<IngredientRow[]>([]);
  const [filter, setFilter] = useState<FilterDept>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IngredientRow | null>(null);
  const [form, setForm] = useState<IngredientForm>(emptyForm);

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase belum dikonfigurasi. Isi .env.local lalu refresh.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("ingredient")
      .select("*")
      .order("department")
      .order("name");

    if (err) {
      setError(err.message);
      setItems([]);
    } else {
      setItems(data ?? []);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    return items.filter((i) => i.department === filter);
  }, [items, filter]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (row: IngredientRow) => {
    setEditing(row);
    setForm({
      name: row.name,
      department: row.department,
      unit: row.unit as IngredientUnit,
      slow_moving_threshold_days: String(row.slow_moving_threshold_days),
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const name = form.name.trim();
    const threshold = parseInt(form.slow_moving_threshold_days, 10);

    if (!name) {
      setError("Nama bahan wajib diisi.");
      return;
    }
    if (Number.isNaN(threshold) || threshold < 0) {
      setError("Slow moving threshold harus angka ≥ 0.");
      return;
    }

    setSaving(true);
    setError(null);

    if (editing) {
      const { error: err } = await supabase
        .from("ingredient")
        .update({
          name,
          department: form.department,
          unit: form.unit,
          slow_moving_threshold_days: threshold,
        })
        .eq("id", editing.id);

      if (err) setError(err.message);
      else closeModal();
    } else {
      const { error: err } = await supabase.from("ingredient").insert({
        name,
        department: form.department,
        unit: form.unit,
        slow_moving_threshold_days: threshold,
      });

      if (err) setError(err.message);
      else closeModal();
    }

    setSaving(false);
    await load();
  };

  const toggleActive = async (row: IngredientRow) => {
    if (!supabase) return;
    setError(null);
    const { error: err } = await supabase
      .from("ingredient")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (err) setError(err.message);
    else await load();
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
              className={`min-h-11 rounded-full px-4 text-sm font-medium transition ${
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
          onClick={openCreate}
          className="min-h-12 w-full rounded-xl bg-artha-accent px-4 font-semibold text-artha-bg sm:w-auto"
        >
          + Tambah Bahan
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-8 text-center text-zinc-500">Memuat bahan baku…</p>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-zinc-500">Belum ada bahan untuk filter ini.</p>
      ) : (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-700 text-zinc-500">
                <th className="px-2 py-3 font-medium">Nama</th>
                <th className="px-2 py-3 font-medium">Dept</th>
                <th className="px-2 py-3 font-medium">Unit</th>
                <th className="px-2 py-3 font-medium">Slow (hari)</th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="px-2 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-zinc-700/60">
                  <td className="px-2 py-3 font-medium text-white">{row.name}</td>
                  <td className="px-2 py-3 capitalize">{row.department}</td>
                  <td className="px-2 py-3">{row.unit}</td>
                  <td className="px-2 py-3 tabular-nums">{row.slow_moving_threshold_days}</td>
                  <td className="px-2 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                        row.is_active ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-500/20 text-zinc-400"
                      }`}
                    >
                      {row.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="min-h-10 rounded-lg px-3 text-indigo-400 ring-1 ring-artha-border"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(row)}
                        className="min-h-10 rounded-lg px-3 text-zinc-500 ring-1 ring-artha-border"
                      >
                        {row.is_active ? "Off" : "On"}
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
        open={modalOpen}
        title={editing ? "Edit Bahan Baku" : "Tambah Bahan Baku"}
        onClose={closeModal}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500">Nama Bahan</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Contoh: Lemon"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500">Departemen</span>
            <select
              value={form.department}
              onChange={(e) =>
                setForm((f) => ({ ...f, department: e.target.value as Department }))
              }
              className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500">Unit</span>
            <select
              value={form.unit}
              onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as IngredientUnit }))}
              className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white"
            >
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-500">Slow Moving Threshold (hari)</span>
            <input
              required
              inputMode="numeric"
              value={form.slow_moving_threshold_days}
              onChange={(e) =>
                setForm((f) => ({ ...f, slow_moving_threshold_days: e.target.value }))
              }
              className="min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-white tabular-nums"
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="min-h-12 w-full rounded-xl bg-artha-accent font-semibold text-artha-bg disabled:opacity-50"
          >
            {saving ? "Menyimpan…" : editing ? "Simpan Perubahan" : "Tambah Bahan"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

