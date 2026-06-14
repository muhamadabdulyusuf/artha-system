import type { DatabaseAssistantContext } from "@/lib/ai/databaseContext";

type AnyRow = Record<string, unknown>;

export type LocalAnswerResult = {
  answer: string;
  confidence: "high" | "medium" | "low";
  sources: string[];
  actionHints: string[];
};

function localResult(
  answer: string | null,
  options: Omit<LocalAnswerResult, "answer">,
): LocalAnswerResult | null {
  return answer ? { answer, ...options } : null;
}

function asRows(value: unknown): AnyRow[] {
  return Array.isArray(value) ? (value.filter((row) => row && typeof row === "object") as AnyRow[]) : [];
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function numberText(value: unknown): string {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? String(number) : "0";
}

function isMenuCatalogQuestion(question: string): boolean {
  return /menu apa|apa aja.*menu|menu.*apa aja|daftar menu|list menu|semua menu/i.test(question);
}

function isRecipeQuestion(question: string): boolean {
  return /bahan|ingredient|resep|recipe|pakai|pake|pakek|dipakai|dipake|menggunakan/i.test(question);
}

function isIngredientUsageQuestion(question: string): boolean {
  return /apa.*(pakai|pake|pakek|dipakai|dipake|menggunakan)|menu.*(pakai|pake|pakek|dipakai|dipake|menggunakan)|yang.*(pakai|pake|pakek|dipakai|dipake|menggunakan)/i.test(
    question,
  );
}

function isAverageSalesQuestion(question: string): boolean {
  return /average|rata|jual|sales|terjual|sold|omzet|revenue/i.test(question);
}

function isLowStockQuestion(question: string): boolean {
  return /low\s*stock|stok.*(low|kurang|habis|minim)|stock.*(low|kurang|habis|minim)|bahan.*(kurang|habis|minim)/i.test(
    question,
  );
}

function isPurchaseRequestQuestion(question: string): boolean {
  return /\bpo\b|purchase|order|belanja|datang|arrival|supplier|vendor|belum datang|pending/i.test(question);
}

function answerMenuCatalog(rows: AnyRow[]): string | null {
  if (rows.length === 0) return null;
  const menuNames = rows.map((row, index) => `${index + 1}. ${text(row.menu)} (${text(row.department)})`);
  return [`Ada ${rows.length} menu di database Artha:`, "", ...menuNames].join("\n");
}

function answerAverageSales(rows: AnyRow[]): string | null {
  if (rows.length === 0) return null;
  const lines = rows.slice(0, 12).map((row) => {
    const menu = text(row.menu);
    const sold = numberText(row.sold);
    const avgSold = numberText(row.avgDailySold30d);
    const activeDays = numberText(row.activeSalesDays);
    return `- ${menu}: ${sold} pcs dalam 30 hari, average ${avgSold} pcs/hari, aktif terjual ${activeDays} hari.`;
  });
  return ["Ini average penjualan dari data 30 hari terakhir:", "", ...lines].join("\n");
}

function answerLowStock(rows: AnyRow[]): string | null {
  if (rows.length === 0) return "Untuk range data ini, belum ada bahan aktif yang masuk low stock.";
  const lines = rows.slice(0, 18).map((row) => {
    const name = text(row.name);
    const stock = numberText(row.stock);
    const minimum = numberText(row.minimum);
    const unit = text(row.unit);
    const department = text(row.department);
    return `- ${name} (${department}): stok ${stock} ${unit}, minimum ${minimum} ${unit}.`;
  });
  return ["Bahan yang perlu dicek/order:", "", ...lines].join("\n");
}

function answerPurchaseRequests(openRows: AnyRow[], matchedRows: AnyRow[]): string | null {
  const rows = matchedRows.length > 0 ? matchedRows : openRows;
  if (rows.length === 0) return "Belum ada PO/request pembelian terbuka dari data yang kebaca.";
  const lines = rows.slice(0, 18).map((row) => {
    const item = text(row.item);
    const supplier = text(row.supplier) || "supplier belum diisi";
    const qty = numberText(row.qty);
    const unit = text(row.unit);
    const poStatus = text(row.poStatus) || "-";
    const purchaseStatus = text(row.purchaseStatus) || "-";
    const eta = text(row.eta);
    const arrival = text(row.arrival);
    const dateInfo = arrival ? `arrival ${arrival}` : eta ? `ETA ${eta}` : "ETA belum ada";
    return `- ${item}: ${qty} ${unit}, ${supplier}, PO ${poStatus}, pembelian ${purchaseStatus}, ${dateInfo}.`;
  });
  return ["Ini PO/request pembelian yang relevan:", "", ...lines].join("\n");
}

function answerRecipeMatches(recipeRows: AnyRow[], ingredientRows: AnyRow[]): string | null {
  if (recipeRows.length > 0) {
    if (recipeRows.length === 1) {
      const row = recipeRows[0];
      const ingredients = asRows(row.ingredients)
        .map((ingredient) => {
          const qty = numberText(ingredient.qtyPerServing);
          const unit = text(ingredient.unit);
          return `- ${text(ingredient.name)}: ${qty} ${unit}/porsi`;
        })
        .join("\n");
      return [`${text(row.menu)} pakai bahan ini di resep aktif:`, "", ingredients].join("\n");
    }

    const lines = recipeRows.slice(0, 20).map((row) => {
      const ingredientList = asRows(row.ingredients)
        .map((ingredient) => {
          const qty = numberText(ingredient.qtyPerServing);
          const unit = text(ingredient.unit);
          return `${text(ingredient.name)} ${qty} ${unit}/porsi`;
        })
        .join(", ");
      return `- ${text(row.menu)}: ${ingredientList}`;
    });
    return ["Ketemu di resep aktif menu ini:", "", ...lines].join("\n");
  }

  if (ingredientRows.length > 0) {
    const ingredientName = text(ingredientRows[0].ingredient);
    const lines = ingredientRows.slice(0, 24).map((row) => {
      const qty = numberText(row.qtyPerServing);
      const unit = text(row.unit);
      return `- ${text(row.menu)}: ${qty} ${unit}/porsi`;
    });
    return [`${ingredientName} dipakai di menu ini:`, "", ...lines].join("\n");
  }

  return null;
}

function answerIngredientUsageMatches(ingredientRows: AnyRow[]): string | null {
  if (ingredientRows.length === 0) return null;
  const ingredientNames = Array.from(new Set(ingredientRows.map((row) => text(row.ingredient)).filter(Boolean)));
  const title = ingredientNames.length === 1 ? ingredientNames[0] : ingredientNames.join(", ");
  const lines = ingredientRows.slice(0, 30).map((row) => {
    const qty = numberText(row.qtyPerServing);
    const unit = text(row.unit);
    const sold30d = numberText(row.sold30d);
    return `- ${text(row.menu)} (${text(row.department)}): ${qty} ${unit}/porsi, sold 30 hari ${sold30d} pcs.`;
  });
  return [`${title} dipakai di menu ini berdasarkan resep aktif:`, "", ...lines].join("\n");
}

function answerIngredientUsageEmpty(question: string, matchedIngredients: AnyRow[]): string {
  if (matchedIngredients.length > 0) {
    const names = matchedIngredients.map((row) => text(row.name)).filter(Boolean).join(", ");
    return `${names} ada di master bahan, tapi belum ketemu di resep aktif menu mana pun. Cek apakah recipe version menu sudah aktif atau bahan di resep memakai nama lain.`;
  }

  const terms = contextTermsFromQuestion(question);
  return `Gue belum nemu bahan yang cocok untuk "${terms || question.trim()}". Cek ejaan/nama bahan di master data, lalu tanya lagi dengan nama bahan persis.`;
}

function contextTermsFromQuestion(question: string): string {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/gi, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !["apa", "aja", "yang", "pake", "pakai", "pakek", "menu"].includes(term))
    .join(" ")
    .trim();
}

export function answerFromDatabaseContext(question: string, context: DatabaseAssistantContext): LocalAnswerResult | null {
  const database = context.database as Record<string, unknown>;
  const menuCatalog = asRows(database.menuCatalog);
  const menuRecipeMatches = asRows(database.menuRecipeMatches);
  const menuIngredientMatches = asRows(database.menuIngredientMatches);
  const matchedMenus = asRows(database.matchedMenus);
  const matchedIngredients = asRows(database.matchedIngredients);
  const lowStockIngredients = asRows(database.lowStockIngredients);
  const openPurchaseRequests = asRows(database.openPurchaseRequests);
  const matchedPurchaseRequests = asRows(database.matchedPurchaseRequests);

  if (isLowStockQuestion(question)) {
    const stockAnswer = answerLowStock(lowStockIngredients);
    const result = localResult(stockAnswer, {
      confidence: "high",
      sources: ["ingredient.current_stock", "ingredient.minimum_stock"],
      actionHints: lowStockIngredients.length > 0 ? ["Buat PO untuk bahan low stock", "Cek supplier utama"] : [],
    });
    if (result) return result;
  }

  if (isPurchaseRequestQuestion(question)) {
    const poAnswer = answerPurchaseRequests(openPurchaseRequests, matchedPurchaseRequests);
    const result = localResult(poAnswer, {
      confidence: "high",
      sources: ["purchase_request_tracker"],
      actionHints: ["Filter PO pending", "Cek ETA dan arrival date"],
    });
    if (result) return result;
  }

  if (isRecipeQuestion(question)) {
    if (isIngredientUsageQuestion(question)) {
      const usageAnswer = answerIngredientUsageMatches(menuIngredientMatches);
      const result = localResult(usageAnswer, {
        confidence: "high",
        sources: ["menu_recipe_version aktif", "recipe_line", "ingredient", "menu_item"],
        actionHints: ["Buka Menu & Resep", "Audit bahan di recipe aktif"],
      });
      if (result) return result;

      const emptyAnswer = answerIngredientUsageEmpty(question, matchedIngredients);
      return {
        answer: emptyAnswer,
        confidence: matchedIngredients.length > 0 ? "medium" : "low",
        sources: ["ingredient", "recipe_line", "menu_recipe_version aktif"],
        actionHints: ["Cek master ingredient", "Cek recipe version aktif"],
      };
    }

    const recipeAnswer = answerRecipeMatches(menuRecipeMatches, menuIngredientMatches);
    const result = localResult(recipeAnswer, {
      confidence: "high",
      sources: ["menu_recipe_version aktif", "recipe_line", "ingredient", "menu_item"],
      actionHints: ["Buka Menu & Resep", "Cek qty per porsi"],
    });
    if (result) return result;
  }

  if (isAverageSalesQuestion(question)) {
    const salesAnswer = answerAverageSales(matchedMenus);
    const result = localResult(salesAnswer, {
      confidence: "high",
      sources: ["worksheet_session 30 hari", "worksheet_sold_line", "menu_item"],
      actionHints: ["Buka Monitoring Sales", "Bandingkan week/month"],
    });
    if (result) return result;
  }

  if (isMenuCatalogQuestion(question)) {
    const catalogAnswer = answerMenuCatalog(menuCatalog);
    const result = localResult(catalogAnswer, {
      confidence: "high",
      sources: ["menu_item"],
      actionHints: ["Filter menu aktif", "Buka Menu & Resep"],
    });
    if (result) return result;
  }

  return null;
}
