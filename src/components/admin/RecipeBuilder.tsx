"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Beaker, ChefHat, Loader2, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Toast } from "@/components/ui/Toast";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { formatCycleError } from "@/lib/recipe/premixCycleCheck";
import { saveMenuRecipe } from "@/lib/recipe/saveMenuRecipe";
import { savePremixRecipe } from "@/lib/recipe/savePremixRecipe";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, IngredientRow, MenuItemRow } from "@/lib/types/database";
import { RecipeComponentPicker } from "./RecipeComponentPicker";

export type RecipeTargetType = "menu" | "premix";

export type RecipeBuilderInitialTarget =
  | { type: "menu"; item: MenuItemRow }
  | { type: "premix"; ingredient: IngredientRow };

export type RecipeDraftRow = {
  clientKey: string;
  id?: string;
  ingredient_id: string;
  quantity: string;
  kind?: "raw" | "premix";
};

type RecipeBuilderProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  initialTarget?: RecipeBuilderInitialTarget | null;
};

function newDraftRow(): RecipeDraftRow {
  return {
    clientKey: crypto.randomUUID(),
    ingredient_id: "",
    quantity: "",
  };
}

function parseQuantity(value: string): number {
  const normalized = value.trim().replace(",", ".");
  if (normalized === "") return Number.NaN;
  return parseFloat(normalized);
}

function isValidQuantity(value: string, allowZero: boolean): boolean {
  const qty = parseQuantity(value);
  if (Number.isNaN(qty)) return false;
  return allowZero ? qty >= 0 : qty > 0;
}

const TARGET_TYPE_OPTIONS: { value: RecipeTargetType; label: string; icon: typeof ChefHat }[] = [
  { value: "menu", label: "Menu Utama", icon: ChefHat },
  { value: "premix", label: "Premix (WIP)", icon: Beaker },
];

export function RecipeBuilder({ open, onClose, onSaved, initialTarget }: RecipeBuilderProps) {
  const supabase = getSupabaseClient();
  const canEdit = canEditStaffData(getStaffSession()?.role);

  const [targetType, setTargetType] = useState<RecipeTargetType>("menu");
  const [menuItems, setMenuItems] = useState<MenuItemRow[]>([]);
  const [premixItems, setPremixItems] = useState<IngredientRow[]>([]);
  const [targetMenuId, setTargetMenuId] = useState("");
  const [targetPremixId, setTargetPremixId] = useState("");
  const [premixYieldQty, setPremixYieldQty] = useState("1");
  const [rows, setRows] = useState<RecipeDraftRow[]>([newDraftRow()]);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ingredientKinds, setIngredientKinds] = useState<Map<string, "raw" | "premix">>(new Map());

  const selectedMenu = useMemo(
    () => menuItems.find((m) => m.id === targetMenuId) ?? null,
    [menuItems, targetMenuId]
  );

  const selectedPremix = useMemo(
    () => premixItems.find((p) => p.id === targetPremixId) ?? null,
    [premixItems, targetPremixId]
  );

  const department: Department | null =
    targetType === "menu" ? (selectedMenu?.department ?? null) : (selectedPremix?.department ?? null);

  const targetLabel =
    targetType === "menu" ? selectedMenu?.menu_name : selectedPremix?.name;

  const componentsSectionTitle = targetType === "premix" ? "Bahan Baku" : "Komposisi";
  const quantityLabel = targetType === "premix" ? "Qty / batch" : "Qty / porsi";
  const allowZeroQty = targetType === "menu";

  const resetEditor = useCallback(() => {
    setRows([newDraftRow()]);
    setVersionId(null);
    setRecipeId(null);
    setPremixYieldQty("1");
    setError(null);
  }, []);

  const fetchTargets = useCallback(async () => {
    setLoadingTargets(true);
    try {
      const [menuRes, premixRes] = await Promise.all([
        supabase.from("menu_item").select("*").eq("is_active", true).order("menu_name"),
        supabase
          .from("ingredient")
          .select("*")
          .eq("is_active", true)
          .eq("kind", "premix")
          .order("name"),
      ]);

      if (menuRes.error) throw new Error(menuRes.error.message);
      if (premixRes.error) throw new Error(premixRes.error.message);

      setMenuItems((menuRes.data ?? []) as MenuItemRow[]);
      setPremixItems((premixRes.data ?? []) as IngredientRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar target.");
    }
    setLoadingTargets(false);
  }, [supabase]);

  const loadMenuRecipe = useCallback(
    async (menuId: string) => {
      resetEditor();
      setLoading(true);

      try {
        const { data: activeVersion, error: verErr } = await supabase
          .from("menu_recipe_version")
          .select("id")
          .eq("menu_item_id", menuId)
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
          .select("id, ingredient_id, quantity_per_serving")
          .eq("recipe_version_id", activeVersion.id)
          .order("created_at");

        if (lineErr) throw new Error(lineErr.message);

        const lineRows = (lines ?? []) as {
          id: string;
          ingredient_id: string;
          quantity_per_serving: number;
        }[];

        const kinds = new Map<string, "raw" | "premix">();
        if (lineRows.length > 0) {
          const ingredientIds = lineRows.map((l) => l.ingredient_id);
          const { data: kindRows } = await supabase
            .from("ingredient")
            .select("id, kind")
            .in("id", ingredientIds);

          for (const row of kindRows ?? []) {
            kinds.set(row.id, row.kind);
          }

          setRows(
            lineRows.map((l) => {
              const kind = kinds.get(l.ingredient_id) ?? "raw";
              return {
                clientKey: crypto.randomUUID(),
                id: l.id,
                ingredient_id: l.ingredient_id,
                quantity: String(l.quantity_per_serving),
                kind,
              };
            })
          );
          setIngredientKinds(kinds);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat resep menu.");
      }

      setLoading(false);
    },
    [resetEditor, supabase]
  );

  const loadPremixRecipe = useCallback(
    async (outputId: string) => {
      resetEditor();
      setLoading(true);

      try {
        const { data: recipe, error: recipeErr } = await supabase
          .from("recipes")
          .select("id, yield_quantity")
          .eq("output_ingredient_id", outputId)
          .eq("is_active", true)
          .maybeSingle();

        if (recipeErr) throw new Error(recipeErr.message);
        if (!recipe?.id) {
          setLoading(false);
          return;
        }

        setRecipeId(recipe.id);
        setPremixYieldQty(String(Number(recipe.yield_quantity ?? 1)));

        const { data: components, error: compErr } = await supabase
          .from("recipe_component")
          .select("id, ingredient_id, qty_per_batch")
          .eq("recipe_id", recipe.id)
          .order("created_at");

        if (compErr) throw new Error(compErr.message);

        const componentRows = (components ?? []) as {
          id: string;
          ingredient_id: string;
          qty_per_batch: number;
        }[];

        const kinds = new Map<string, "raw" | "premix">();
        if (componentRows.length > 0) {
          const ingredientIds = componentRows.map((c) => c.ingredient_id);
          const { data: kindRows } = await supabase
            .from("ingredient")
            .select("id, kind")
            .in("id", ingredientIds);

          for (const row of kindRows ?? []) {
            kinds.set(row.id, row.kind);
          }

          setRows(
            componentRows.map((c) => {
              const kind = kinds.get(c.ingredient_id) ?? "raw";
              return {
                clientKey: crypto.randomUUID(),
                id: c.id,
                ingredient_id: c.ingredient_id,
                quantity: String(c.qty_per_batch),
                kind,
              };
            })
          );
          setIngredientKinds(kinds);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal memuat resep premix.");
      }

      setLoading(false);
    },
    [resetEditor, supabase]
  );

  useEffect(() => {
    if (!open) return;
    void fetchTargets();
  }, [open, fetchTargets]);

  useEffect(() => {
    if (!open) return;
    if (!initialTarget) {
      setTargetType("menu");
      setTargetMenuId("");
      setTargetPremixId("");
      return;
    }
    if (initialTarget.type === "menu") {
      setTargetType("menu");
      setTargetMenuId(initialTarget.item.id);
      setTargetPremixId("");
    } else {
      setTargetType("premix");
      setTargetPremixId(initialTarget.ingredient.id);
      setTargetMenuId("");
    }
  }, [open, initialTarget]);

  useEffect(() => {
    if (!open) return;
    if (targetType === "menu" && targetMenuId) {
      void loadMenuRecipe(targetMenuId);
    } else if (targetType === "premix" && targetPremixId) {
      void loadPremixRecipe(targetPremixId);
    } else {
      resetEditor();
    }
  }, [
    open,
    targetType,
    targetMenuId,
    targetPremixId,
    loadMenuRecipe,
    loadPremixRecipe,
    resetEditor,
  ]);

  const addRow = () => setRows((prev) => [...prev, newDraftRow()]);

  const removeRow = async (row: RecipeDraftRow) => {
    setError(null);
    setDeletingKey(row.clientKey);

    try {
      if (row.id) {
        const table = targetType === "menu" ? "recipe_line" : "recipe_component";
        const { error: delErr } = await supabase.from(table).delete().eq("id", row.id);
        if (delErr) throw new Error(delErr.message);
        await onSaved();
      }

      setRows((prev) => {
        const next = prev.filter((r) => r.clientKey !== row.clientKey);
        return next.length > 0 ? next : [newDraftRow()];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus baris.");
    } finally {
      setDeletingKey(null);
    }
  };

  const updateRow = (key: string, patch: Partial<RecipeDraftRow>) => {
    setRows((prev) => prev.map((r) => (r.clientKey === key ? { ...r, ...patch } : r)));
  };

  const handleIngredientPicked = async (rowKey: string, ingredientId: string) => {
    updateRow(rowKey, { ingredient_id: ingredientId });

    if (!ingredientId) return;

    const { data } = await supabase
      .from("ingredient")
      .select("kind")
      .eq("id", ingredientId)
      .maybeSingle();

    if (data?.kind) {
      setIngredientKinds((prev) => new Map(prev).set(ingredientId, data.kind));
      updateRow(rowKey, { kind: data.kind });
    }
  };

  const handleSave = async () => {
    if (!department) {
      setError("Pilih target resep terlebih dahulu.");
      return;
    }

    const parsed = rows
      .filter((r) => r.ingredient_id)
      .map((r) => ({
        id: r.id,
        ingredient_id: r.ingredient_id,
        quantity: parseQuantity(r.quantity),
        kind: ingredientKinds.get(r.ingredient_id) ?? r.kind ?? "raw",
      }));

    if (parsed.length === 0) {
      setError("Tambahkan minimal satu komponen dengan takaran valid.");
      return;
    }

    const seen = new Set<string>();
    for (const row of parsed) {
      if (seen.has(row.ingredient_id)) {
        setError("Komponen tidak boleh duplikat.");
        return;
      }
      seen.add(row.ingredient_id);

      const minQty = allowZeroQty ? 0 : 0.0001;
      if (Number.isNaN(row.quantity) || row.quantity < minQty) {
        setError(
          allowZeroQty
            ? "Takaran harus angka valid (0 atau lebih)."
            : "Takaran harus angka positif."
        );
        return;
      }
    }

    setSaving(true);
    setError(null);

    try {
      if (targetType === "menu") {
        if (!targetMenuId) throw new Error("Menu belum dipilih.");

        await saveMenuRecipe(
          supabase,
          targetMenuId,
          parsed.map((p) => ({
            id: p.id,
            ingredient_id: p.ingredient_id,
            quantity_per_serving: p.quantity,
          })),
          versionId
        );

        setToast("Komposisi menu berhasil disimpan.");
      } else {
        if (!targetPremixId) throw new Error("Premix belum dipilih.");

        const premixComponentIds = parsed
          .filter((p) => p.kind === "premix")
          .map((p) => p.ingredient_id);

        const yieldQty = parseQuantity(premixYieldQty);
        if (!Number.isFinite(yieldQty) || yieldQty <= 0) {
          throw new Error("Yield/output premix per batch harus lebih dari 0.");
        }

        await savePremixRecipe(
          supabase,
          targetPremixId,
          parsed.map((p) => ({
            ingredient_id: p.ingredient_id,
            qty_per_batch: p.quantity,
          })),
          premixComponentIds,
          yieldQty
        );

        setToast("Resep premix (bahan baku) berhasil disimpan.");
      }

      await onSaved();
      onClose();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Gagal menyimpan resep.";
      setError(message.includes("siklus") ? formatCycleError() : message);
    }

    setSaving(false);
  };

  if (!open) return null;

  const modalTitle = targetLabel
    ? `Recipe Builder — ${targetLabel}`
    : "Recipe Builder";

  return (
    <>
      <Toast message={toast} onDismiss={() => setToast(null)} />
      <Modal open={open} title={modalTitle} onClose={onClose}>
        <div className="mb-4 space-y-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Jenis Target
            </p>
            <div className="flex flex-wrap gap-2">
              {TARGET_TYPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={!!initialTarget || saving}
                  onClick={() => {
                    setTargetType(value);
                    setTargetMenuId("");
                    setTargetPremixId("");
                    resetEditor();
                  }}
                  className={`flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition ${
                    targetType === value
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700 hover:text-white"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Target Item
            </span>
            {loadingTargets ? (
              <div className="flex items-center gap-2 py-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Memuat daftar…
              </div>
            ) : targetType === "menu" ? (
              <select
                value={targetMenuId}
                disabled={(initialTarget?.type === "menu") || saving}
                onChange={(e) => setTargetMenuId(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 text-white disabled:opacity-60"
              >
                <option value="">— Pilih menu —</option>
                {menuItems.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.menu_name} ({m.department})
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={targetPremixId}
                disabled={(initialTarget?.type === "premix") || saving}
                onChange={(e) => setTargetPremixId(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-zinc-600 bg-zinc-950 px-3 text-white disabled:opacity-60"
              >
                <option value="">— Pilih premix —</option>
                {premixItems.length === 0 ? (
                  <option disabled value="">
                    Belum ada bahan premix — tandai di tab Ingredients
                  </option>
                ) : (
                  premixItems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.department}) · {p.unit}
                    </option>
                  ))
                )}
              </select>
            )}
          </label>

          {department ? (
            <p className="text-sm text-zinc-400">
              Departemen{" "}
              <span className="font-medium capitalize text-indigo-300">{department}</span>
              {" · "}
              Komponen bisa berupa bahan <span className="text-emerald-300">Raw</span> atau{" "}
              <span className="text-amber-300">Premix</span> lain.
            </p>
          ) : null}

          {targetType === "premix" && premixItems.length === 0 ? (
            <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Buat bahan dengan jenis <strong>Premix</strong> di tab Ingredients, lalu kembali
                ke sini untuk menyusun bahan bakunya.
              </p>
            </div>
          ) : null}

          {targetType === "premix" && department ? (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Output / 1 Batch
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={premixYieldQty}
                  onChange={(e) => setPremixYieldQty(e.target.value)}
                  disabled={saving}
                  className="min-h-11 flex-1 rounded-lg border border-zinc-600 bg-zinc-950 px-3 tabular-nums text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  placeholder="Contoh: 1100"
                />
                <span className="min-w-14 text-sm text-zinc-400">{selectedPremix?.unit ?? ""}</span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Contoh: 1 batch Base Tea menghasilkan 1100 ml.
              </p>
            </label>
          ) : null}
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        {!department ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            Pilih target item untuk mulai menyusun resep.
          </p>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Memuat resep…
          </div>
        ) : (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">{componentsSectionTitle}</h3>

            {rows.map((row, index) => {
              const qtyInvalid =
                row.ingredient_id.length > 0 &&
                row.quantity.trim() !== "" &&
                !isValidQuantity(row.quantity, allowZeroQty);
              const isDeleting = deletingKey === row.clientKey;
              const excludeIngredientIds = rows
                .filter((other) => other.clientKey !== row.clientKey && other.ingredient_id)
                .map((other) => other.ingredient_id);
              const rowKind = ingredientKinds.get(row.ingredient_id) ?? row.kind;

              return (
                <div
                  key={row.clientKey}
                  className="grid gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3 sm:grid-cols-[1fr_120px_40px]"
                >
                  <label className="block">
                    <span className="mb-1 flex items-center gap-2 text-xs text-zinc-500">
                      #{index + 1}
                      {rowKind === "premix" ? (
                        <span className="rounded bg-amber-500/20 px-1 text-[10px] text-amber-300">
                          Premix
                        </span>
                      ) : rowKind === "raw" ? (
                        <span className="rounded bg-emerald-500/15 px-1 text-[10px] text-emerald-300">
                          Raw
                        </span>
                      ) : null}
                    </span>
                    <RecipeComponentPicker
                      department={department}
                      value={row.ingredient_id}
                      excludeIds={excludeIngredientIds}
                      excludeSelfId={targetType === "premix" ? targetPremixId : undefined}
                      disabled={saving || isDeleting}
                      onChange={(id) => void handleIngredientPicked(row.clientKey, id)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-zinc-500">{quantityLabel}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.quantity}
                      onChange={(e) => updateRow(row.clientKey, { quantity: e.target.value })}
                      className={`min-h-11 w-full rounded-lg border bg-zinc-950 px-3 tabular-nums text-white ${
                        qtyInvalid
                          ? "border-red-500 focus:border-red-500 focus:ring-red-500/40"
                          : "border-zinc-600 focus:border-indigo-500 focus:ring-indigo-500/40"
                      } focus:outline-none focus:ring-2`}
                      placeholder="0"
                      aria-invalid={qtyInvalid}
                    />
                  </label>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={isDeleting || saving}
                      onClick={() => void removeRow(row)}
                      className="mt-6 flex h-11 items-center justify-center rounded-lg text-red-400 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label="Hapus baris"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Trash2 className="h-5 w-5" />
                      )}
                    </button>
                  ) : null}
                </div>
              );
            })}

            {canEdit ? (
              <>
                <button
                  type="button"
                  onClick={addRow}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-600 text-sm text-zinc-300 hover:border-indigo-500 hover:text-indigo-300"
                >
                  <Plus className="h-4 w-4" />
                  Tambah {targetType === "premix" ? "Bahan" : "Komponen"}
                </button>

                <button
                  type="button"
                  disabled={saving || deletingKey !== null || !department}
                  onClick={() => void handleSave()}
                  className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  {saving ? "Menyimpan…" : "Simpan Resep"}
                </button>
              </>
            ) : (
              <p className="text-sm text-zinc-500">Mode penonton: resep hanya dapat dilihat.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
