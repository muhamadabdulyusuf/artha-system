import type { DatabaseAssistantContext } from "@/lib/ai/databaseContext";

type AnyRow = Record<string, unknown>;

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

export function answerFromDatabaseContext(question: string, context: DatabaseAssistantContext): string | null {
  const database = context.database as Record<string, unknown>;
  const menuCatalog = asRows(database.menuCatalog);
  const menuRecipeMatches = asRows(database.menuRecipeMatches);
  const menuIngredientMatches = asRows(database.menuIngredientMatches);
  const matchedMenus = asRows(database.matchedMenus);
  const lowStockIngredients = asRows(database.lowStockIngredients);
  const openPurchaseRequests = asRows(database.openPurchaseRequests);
  const matchedPurchaseRequests = asRows(database.matchedPurchaseRequests);

  if (isLowStockQuestion(question)) {
    const stockAnswer = answerLowStock(lowStockIngredients);
    if (stockAnswer) return stockAnswer;
  }

  if (isPurchaseRequestQuestion(question)) {
    const poAnswer = answerPurchaseRequests(openPurchaseRequests, matchedPurchaseRequests);
    if (poAnswer) return poAnswer;
  }

  if (isRecipeQuestion(question)) {
    if (isIngredientUsageQuestion(question)) {
      const usageAnswer = answerIngredientUsageMatches(menuIngredientMatches);
      if (usageAnswer) return usageAnswer;
    }

    const recipeAnswer = answerRecipeMatches(menuRecipeMatches, menuIngredientMatches);
    if (recipeAnswer) return recipeAnswer;
  }

  if (isAverageSalesQuestion(question)) {
    const salesAnswer = answerAverageSales(matchedMenus);
    if (salesAnswer) return salesAnswer;
  }

  if (isMenuCatalogQuestion(question)) {
    const catalogAnswer = answerMenuCatalog(menuCatalog);
    if (catalogAnswer) return catalogAnswer;
  }

  return null;
}
