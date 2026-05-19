"use client";

import type { MenuItemRow } from "@/lib/types/database";
import { RecipeBuilder } from "./RecipeBuilder";

type RecipeBuilderModalProps = {
  menu: MenuItemRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

/** @deprecated Use RecipeBuilder directly — kept for backward compatibility. */
export function RecipeBuilderModal({ menu, onClose, onSaved }: RecipeBuilderModalProps) {
  return (
    <RecipeBuilder
      open={!!menu}
      onClose={onClose}
      onSaved={onSaved}
      initialTarget={menu ? { type: "menu", item: menu } : null}
    />
  );
}

export type { RecipeDraftRow } from "./RecipeBuilder";
