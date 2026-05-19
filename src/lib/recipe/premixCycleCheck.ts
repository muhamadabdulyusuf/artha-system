import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

type PremixRecipeMap = Map<string, string[]>;

/**
 * Loads premix → premix-component edges from active recipes.
 * `overrideOutputId` replaces that recipe's premix components (draft save).
 */
export async function loadPremixRecipeMap(
  supabase: SupabaseClient<Database>,
  overrideOutputId?: string,
  overridePremixComponentIds?: string[]
): Promise<PremixRecipeMap> {
  const { data: recipes, error: recipeErr } = await supabase
    .from("recipes")
    .select("id, output_ingredient_id")
    .eq("is_active", true);

  if (recipeErr) throw new Error(recipeErr.message);

  const recipeIds = (recipes ?? []).map((r) => r.id);
  if (recipeIds.length === 0) return new Map();

  const { data: components, error: compErr } = await supabase
    .from("recipe_component")
    .select("recipe_id, ingredient_id")
    .in("recipe_id", recipeIds);

  if (compErr) throw new Error(compErr.message);

  const componentRows = (components ?? []) as { recipe_id: string; ingredient_id: string }[];

  const ingredientIds = [...new Set(componentRows.map((c) => c.ingredient_id))];
  const { data: ingredients, error: ingErr } = await supabase
    .from("ingredient")
    .select("id, kind")
    .in("id", ingredientIds);

  if (ingErr) throw new Error(ingErr.message);

  const kindById = new Map((ingredients ?? []).map((i) => [i.id, i.kind] as const));

  const outputByRecipeId = new Map(
    (recipes ?? []).map((r) => [r.id, r.output_ingredient_id] as const)
  );

  const map: PremixRecipeMap = new Map();

  for (const recipe of recipes ?? []) {
    const outputId = recipe.output_ingredient_id;
    if (overrideOutputId && outputId === overrideOutputId) {
      map.set(outputId, overridePremixComponentIds ?? []);
      continue;
    }

    const premixChildren = componentRows
      .filter(
        (c) =>
          c.recipe_id === recipe.id && kindById.get(c.ingredient_id) === "premix"
      )
      .map((c) => c.ingredient_id);

    map.set(outputId, premixChildren);
  }

  if (overrideOutputId && !map.has(overrideOutputId)) {
    map.set(overrideOutputId, overridePremixComponentIds ?? []);
  }

  return map;
}

/** Returns true if adding `premixComponentIds` to `targetOutputId` would create a cycle. */
export function wouldCreatePremixCycle(
  targetOutputId: string,
  premixComponentIds: string[],
  recipeMap: PremixRecipeMap
): boolean {
  const uniqueComponents = [...new Set(premixComponentIds)];

  for (const componentId of uniqueComponents) {
    if (componentId === targetOutputId) return true;

    const visited = new Set<string>();
    const stack = [componentId];

    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node === targetOutputId) return true;
      if (visited.has(node)) continue;
      visited.add(node);

      const children = recipeMap.get(node) ?? [];
      for (const child of children) {
        if (!visited.has(child)) stack.push(child);
      }
    }
  }

  return false;
}

export function formatCycleError(componentName?: string): string {
  if (componentName) {
    return `"${componentName}" akan membuat siklus resep premix (A memakai B yang memakai A). Pilih komponen lain.`;
  }
  return "Resep premix tidak boleh memuat siklus (premix A memakai B yang memakai A). Periksa kembali komponen premix.";
}

