import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  formatCycleError,
  loadPremixRecipeMap,
  wouldCreatePremixCycle,
} from "./premixCycleCheck";

export type PremixComponentInput = {
  ingredient_id: string;
  qty_per_batch: number;
};

export async function savePremixRecipe(
  supabase: SupabaseClient<Database>,
  outputIngredientId: string,
  components: PremixComponentInput[],
  premixComponentIds: string[]
): Promise<void> {
  const recipeMap = await loadPremixRecipeMap(
    supabase,
    outputIngredientId,
    premixComponentIds
  );

  if (wouldCreatePremixCycle(outputIngredientId, premixComponentIds, recipeMap)) {
    throw new Error(formatCycleError());
  }

  const { data: existingRecipe, error: fetchErr } = await supabase
    .from("recipes")
    .select("id")
    .eq("output_ingredient_id", outputIngredientId)
    .eq("is_active", true)
    .maybeSingle();

  if (fetchErr) throw new Error(fetchErr.message);

  let recipeId = existingRecipe?.id ?? null;

  if (!recipeId) {
    const { data: created, error: createErr } = await supabase
      .from("recipes")
      .insert({ output_ingredient_id: outputIngredientId, is_active: true })
      .select("id")
      .single();

    if (createErr) throw new Error(createErr.message);
    if (!created?.id) throw new Error("Gagal membuat resep premix.");
    recipeId = created.id;
  }

  const { error: deleteErr } = await supabase
    .from("recipe_component")
    .delete()
    .eq("recipe_id", recipeId);

  if (deleteErr) throw new Error(deleteErr.message);

  if (components.length === 0) return;

  const { error: insertErr } = await supabase.from("recipe_component").insert(
    components.map((c) => ({
      recipe_id: recipeId,
      ingredient_id: c.ingredient_id,
      qty_per_batch: c.qty_per_batch,
    }))
  );

  if (insertErr) throw new Error(insertErr.message);
}
