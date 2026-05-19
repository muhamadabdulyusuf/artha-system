import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export type MenuRecipeLineInput = {
  id?: string;
  ingredient_id: string;
  quantity_per_serving: number;
};

export async function saveMenuRecipe(
  supabase: SupabaseClient<Database>,
  menuItemId: string,
  lines: MenuRecipeLineInput[],
  existingVersionId: string | null
): Promise<string> {
  let activeVersionId = existingVersionId;

  if (!activeVersionId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: version, error: versionErr } = await supabase
      .from("menu_recipe_version")
      .insert([
        {
          menu_item_id: menuItemId,
          version: 1,
          valid_from: today,
          is_active: true,
        },
      ])
      .select("id")
      .single();

    if (versionErr) throw new Error(versionErr.message);
    if (!version?.id) throw new Error("Gagal membuat versi resep menu.");
    activeVersionId = version.id;
  }

  const keepIds = new Set(lines.map((l) => l.ingredient_id));

  const { data: existingLines, error: fetchErr } = await supabase
    .from("recipe_line")
    .select("id, ingredient_id")
    .eq("recipe_version_id", activeVersionId);

  if (fetchErr) throw new Error(fetchErr.message);

  for (const line of existingLines ?? []) {
    if (!keepIds.has(line.ingredient_id)) {
      const { error: delErr } = await supabase.from("recipe_line").delete().eq("id", line.id);
      if (delErr) throw new Error(delErr.message);
    }
  }

  for (const line of lines) {
    const payload = {
      recipe_version_id: activeVersionId,
      ingredient_id: line.ingredient_id,
      quantity_per_serving: line.quantity_per_serving,
    };

    if (line.id) {
      const { error: updateErr } = await supabase
        .from("recipe_line")
        .update({
          ingredient_id: line.ingredient_id,
          quantity_per_serving: line.quantity_per_serving,
        })
        .eq("id", line.id);

      if (updateErr) throw new Error(updateErr.message);
    } else {
      const { error: insertErr } = await supabase.from("recipe_line").insert(payload);
      if (insertErr) throw new Error(insertErr.message);
    }
  }

  return activeVersionId;
}
