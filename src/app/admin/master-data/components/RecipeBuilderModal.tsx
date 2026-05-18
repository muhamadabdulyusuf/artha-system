"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
import type { Department, IngredientRow, MenuItemRow } from "@/lib/types/database";

export type RecipeDraftRow = {
  clientKey: string;
  ingredient_id: string;
  quantity_per_serving: string;
};

type RecipeBuilderModalProps = {
  menu: MenuItemRow | null;
  onClose: () => void;
  onSaved: () => void;
};

function newDraftRow(): RecipeDraftRow {
  return {
    clientKey: crypto.randomUUID(),
    ingredient_id: "",
    quantity_per_serving: "",
  };
}

export function RecipeBuilderModal({ menu, onClose, onSaved }: RecipeBuilderModalProps) {
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [rows, setRows] = useState<RecipeDraftRow[]>([newDraftRow()]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadIngredients = useCallback(async () => {
    if (!supabase || !menu) return;
    const { data, error: err } = await supabase
      .from("ingredient")
      .select("*")
      .eq("department", menu.department)
      .eq("is_active", true)
      .order("name");

    if (err) throw new Error(err.message);
    setIngredients(data ?? []);
  }, [menu, supabase]);

  const loadExistingRecipe = useCallback(async () => {
    if (!supabase || !menu) return;

    setLoading(true);
    setError(null);
    setVersionId(null);
    setRows([newDraftRow()]);

    try {
      await loadIngredients();

      const { data: activeVersion, error: verErr } = await supabase
        .from("menu_recipe_version")
        .select("id")
        .eq("menu_item_id", menu.id)
        .eq("is_active", true)
        .maybeSingle();

      if (verErr) throw new Error(verErr.message);
      if (!activeVersion?.id) {
        setLoading(false);
        return;
      }

      setVersionId(activeVersion.id);

      const { data: lines, error: lineErr } = await supabase
        .from("recipe_line")
        .select("ingredient_id, quantity_per_serving")
        .eq("recipe_version_id", activeVersion.id)
        .order("created_at");

      if (lineErr) throw new Error(lineErr.message);

      if (lines?.length) {
        setRows(
          lines.map((l) => ({
            clientKey: crypto.randomUUID(),
            ingredient_id: l.ingredient_id,
            quantity_per_serving: String(l.quantity_per_serving),
          }))
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat resep.");
    }
    setLoading(false);
  }, [loadIngredients, menu, supabase]);

  useEffect(() => {
    if (menu) void loadExistingRecipe();
  }, [menu, loadExistingRecipe]);

  const addRow = () => setRows((prev) => [...prev, newDraftRow()]);

  const removeRow = (key: string) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.clientKey !== key)));
  };

  const updateRow = (key: string, patch: Partial<RecipeDraftRow>) => {
    setRows((prev) => prev.map((r) => (r.clientKey === key ? { ...r, ...patch } : r)));
  };

  const handleSave = async () => {
    if (!supabase || !menu) return;

    const parsed = rows
      .map((r) => ({
        ingredient_id: r.ingredient_id,
        quantity_per_serving: parseFloat(r.quantity_per_serving.replace(",", ".")),
      }))
      .filter((r) => r.ingredient_id);

    if (parsed.length === 0) {
      setError("Tambahkan minimal satu bahan dengan gramasi valid.");
      return;
    }

    const ids = new Set<string>();
    for (const row of parsed) {
      if (ids.has(row.ingredient_id)) {
        setError("Bahan baku tidak boleh duplikat dalam satu resep.");
        return;
      }
      ids.add(row.ingredient_id);
      if (Number.isNaN(row.quantity_per_serving) || row.quantity_per_serving <= 0) {
        setError("Semua gramasi harus angka lebih dari 0.");
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      let activeVersionId = versionId;

      if (!activeVersionId) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: created, error: createErr } = await supabase
          .from("menu_recipe_version")
          .insert({
            menu_item_id: menu.id,
            version: 1,
            valid_from: today,
            is_active: true,
          })
          .select("id")
          .single();

        if (createErr) throw new Error(createErr.message);
        activeVersionId = created.id;
        setVersionId(activeVersionId);
      }

      for (const row of parsed) {
        const { error: upsertErr } = await supabase.from("recipe_line").upsert(
          {
            recipe_version_id: activeVersionId,
            ingredient_id: row.ingredient_id,
            quantity_per_serving: row.quantity_per_serving,
          },
          { onConflict: "recipe_version_id,ingredient_id" }
        );
        if (upsertErr) throw new Error(upsertErr.message);
      }

      const { data: existingLines, error: fetchErr } = await supabase
        .from("recipe_line")
        .select("id, ingredient_id")
        .eq("recipe_version_id", activeVersionId);

      if (fetchErr) throw new Error(fetchErr.message);

      const keepIds = new Set(parsed.map((p) => p.ingredient_id));
      for (const line of existingLines ?? []) {
        if (!keepIds.has(line.ingredient_id)) {
          const { error: delErr } = await supabase.from("recipe_line").delete().eq("id", line.id);
          if (delErr) throw new Error(delErr.message);
        }
      }

      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan resep.");
    }
    setSaving(false);
  };

  if (!menu) return null;

  return (
    <Modal
      open={!!menu}
      title={`Kelola Resep — ${menu.menu_name}`}
      onClose={onClose}
    >
      <p className="mb-4 text-sm text-zinc-400">
        Departemen <span className="font-medium capitalize text-indigo-300">{menu.department}</span>
        {" · "}
        Hanya bahan {menu.department} yang bisa dipilih.
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat resep…
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div
              key={row.clientKey}
              className="grid gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3 sm:grid-cols-[1fr_120px_40px]"
            >
              <label className="block sm:col-span-1">
                <span className="mb-1 block text-xs text-zinc-500">Bahan #{index + 1}</span>
                <select
                  value={row.ingredient_id}
                  onChange={(e) => updateRow(row.clientKey, { ingredient_id: e.target.value })}
                  className="min-h-11 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 text-white"
                >
                  <option value="">— Pilih bahan —</option>
                  {ingredients.map((ing) => (
                    <option key={ing.id} value={ing.id}>
                      {ing.name} ({ing.unit})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-zinc-500">Qty / porsi</span>
                <input
                  inputMode="decimal"
                  value={row.quantity_per_serving}
                  onChange={(e) =>
                    updateRow(row.clientKey, { quantity_per_serving: e.target.value })
                  }
                  className="min-h-11 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 tabular-nums text-white"
                  placeholder="0"
                />
              </label>
              <button
                type="button"
                onClick={() => removeRow(row.clientKey)}
                className="mt-6 flex h-11 items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10"
                aria-label="Hapus baris"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-600 text-sm text-zinc-300 hover:border-indigo-500 hover:text-indigo-300"
          >
            <Plus className="h-4 w-4" />
            Tambah Bahan
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {saving ? "Menyimpan…" : "Simpan Resep"}
          </button>
        </div>
      )}
    </Modal>
  );
}
