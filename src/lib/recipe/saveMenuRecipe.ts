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
    const { data: activeVersion, error: activeVersionErr } = await supabase
      .from("menu_recipe_version")
      .select("id")
      .eq("menu_item_id", menuItemId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeVersionErr) throw new Error(activeVersionErr.message);
    activeVersionId = activeVersion?.id ?? null;
  }

  if (!activeVersionId) {
    const today = new Date().toISOString().slice(0, 10);
    const { data: latestVersion, error: latestVersionErr } = await supabase
      .from("menu_recipe_version")
      .select("version")
      .eq("menu_item_id", menuItemId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersionErr) throw new Error(latestVersionErr.message);
    const nextVersion = Number(latestVersion?.version ?? 0) + 1;

    const { data: version, error: versionErr } = await supabase
      .from("menu_recipe_version")
      .insert([
        {
          menu_item_id: menuItemId,
          version: nextVersion,
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

  const { error: deleteErr } = await supabase
    .from("recipe_line")
    .delete()
    .eq("recipe_version_id", activeVersionId);

  if (deleteErr) throw new Error(deleteErr.message);

  if (lines.length > 0) {
    const { error: insertErr } = await supabase.from("recipe_line").insert(
      lines.map((line) => ({
        recipe_version_id: activeVersionId,
        ingredient_id: line.ingredient_id,
        quantity_per_serving: line.quantity_per_serving,
      }))
    );

    if (insertErr) throw new Error(insertErr.message);
  }

  return activeVersionId;
}
