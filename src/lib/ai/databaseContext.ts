import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveBusinessDate } from "@/lib/utils/dateHelper";
import type { Database, Department, MenuItemRow, WorksheetSessionRow } from "@/lib/types/database";

type DbClient = SupabaseClient<Database>;

type IngredientContextRow = {
  id: string;
  name: string;
  department: Department;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  default_unit_price: number;
  kind: string;
  is_active: boolean;
  is_stock_tracked: boolean;
  primary_supplier_id: string | null;
};

type MenuSalesRow = {
  menu_id: string;
  menu_name: string;
  department: Department;
  price: number;
  is_active: boolean;
  quantity_sold: number;
  revenue: number;
};

type QueryIntent =
  | "stock"
  | "po"
  | "sales"
  | "menu"
  | "supplier"
  | "ledger"
  | "issue"
  | "event";

export type DatabaseAssistantContext = {
  generatedAt: string;
  businessDate: string;
  question: string;
  intents: QueryIntent[];
  searchTerms: string[];
  dateWindows: {
    today: string;
    last7Start: string;
    last30Start: string;
  };
  database: {
    counts: Record<string, number>;
    lowStockIngredients: unknown[];
    matchedIngredients: unknown[];
    matchedMenus: unknown[];
    salesLast30Days: unknown[];
    openPurchaseRequests: unknown[];
    matchedPurchaseRequests: unknown[];
    suppliers: unknown[];
    matchedSuppliers: unknown[];
    recentLedger: unknown[];
    pendingOpname: unknown[];
    recentIssues: unknown[];
    activeDemandEvents: unknown[];
  };
};

const STOP_WORDS = new Set([
  "apa",
  "yang",
  "gue",
  "gua",
  "aku",
  "saya",
  "bro",
  "dong",
  "coba",
  "tolong",
  "dari",
  "untuk",
  "dengan",
  "dan",
  "atau",
  "ini",
  "itu",
  "mana",
  "berapa",
  "ada",
  "cari",
  "search",
  "database",
  "data",
  "menu",
  "bahan",
]);

function addIsoDays(isoDate: string, days: number): string {
  const [year, month, date] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + days, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}

function limitRows<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, limit);
}

function normalize(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

function rowMatchesTerms(row: Record<string, unknown>, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const haystack = Object.values(row).map(normalize).join(" ");
  return terms.some((term) => haystack.includes(term));
}

function extractSearchTerms(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\u00c0-\u024f]+/gi, " ")
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 3 && !STOP_WORDS.has(term)),
    ),
  ).slice(0, 8);
}

function detectIntents(question: string): QueryIntent[] {
  const q = question.toLowerCase();
  const intents = new Set<QueryIntent>();

  if (/stok|stock|bahan|ingredient|minimum|low|habis|kurang|opname|adjust/.test(q)) intents.add("stock");
  if (/po|purchase|order|supplier|vendor|belanja|datang|dibeli|beli/.test(q)) intents.add("po");
  if (/sales|jual|terjual|sold|revenue|omzet|best|slow|grade|ranking|rank/.test(q)) intents.add("sales");
  if (/menu|resep|recipe|food|beverage|bar|kitchen/.test(q)) intents.add("menu");
  if (/supplier|vendor|kontak|phone|wa|whatsapp/.test(q)) intents.add("supplier");
  if (/ledger|closing|opening|variance|selisih|pemakaian|usage/.test(q)) intents.add("ledger");
  if (/remake|complaint|komplain|issue|rusak|gosong|asin|rambut/.test(q)) intents.add("issue");
  if (/event|promo|kol|holiday|libur|demand/.test(q)) intents.add("event");

  if (intents.size === 0) {
    intents.add("stock");
    intents.add("po");
    intents.add("sales");
    intents.add("menu");
  }

  return Array.from(intents);
}

function aggregateSales(
  menus: MenuItemRow[],
  sessions: Pick<WorksheetSessionRow, "id" | "business_date" | "department">[],
  soldLines: { session_id?: string; menu_item_id: string; quantity_sold: number }[],
): MenuSalesRow[] {
  const menuMap = new Map(menus.map((menu) => [menu.id, menu]));
  const sessionIds = new Set(sessions.map((session) => session.id));
  const qtyByMenuId = new Map<string, number>();

  for (const line of soldLines) {
    if (line.session_id && !sessionIds.has(line.session_id)) continue;
    const qty = Number(line.quantity_sold ?? 0);
    if (qty <= 0) continue;
    qtyByMenuId.set(line.menu_item_id, (qtyByMenuId.get(line.menu_item_id) ?? 0) + qty);
  }

  return menus
    .map((menu) => {
      const quantity = qtyByMenuId.get(menu.id) ?? 0;
      const price = Number(menu.price ?? 0);
      return {
        menu_id: menu.id,
        menu_name: menu.menu_name,
        department: menu.department,
        price,
        is_active: menu.is_active,
        quantity_sold: quantity,
        revenue: quantity * price,
      };
    })
    .sort((a, b) => {
      const qtyCmp = b.quantity_sold - a.quantity_sold;
      if (qtyCmp !== 0) return qtyCmp;
      return b.revenue - a.revenue;
    });
}

export async function buildDatabaseAssistantContext(
  supabase: DbClient,
  question: string,
): Promise<DatabaseAssistantContext> {
  const businessDate = resolveBusinessDate();
  const last7Start = addIsoDays(businessDate, -6);
  const last30Start = addIsoDays(businessDate, -29);
  const terms = extractSearchTerms(question);
  const intents = detectIntents(question);
  const wantsStock = intents.includes("stock");
  const wantsPo = intents.includes("po");
  const wantsSales = intents.includes("sales") || intents.includes("menu");
  const wantsSupplier = intents.includes("supplier") || wantsPo;
  const wantsLedger = intents.includes("ledger") || wantsStock;
  const wantsIssue = intents.includes("issue");
  const wantsEvent = intents.includes("event");

  const [
    ingredientResult,
    menuResult,
    supplierResult,
    poResult,
    sessionResult,
    ledgerResult,
    opnameResult,
    issueResult,
    eventResult,
  ] = await Promise.all([
    supabase
      .from("ingredient")
      .select(
        "id, name, department, unit, current_stock, minimum_stock, default_unit_price, kind, is_active, is_stock_tracked, primary_supplier_id",
      )
      .order("name", { ascending: true })
      .limit(300),
    supabase.from("menu_item").select("*").order("menu_name", { ascending: true }).limit(300),
    supabase
      .from("supplier")
      .select("id, name, category, pic_name, min_order_amount, phone_number, link_url, is_active")
      .order("name", { ascending: true })
      .limit(200),
    supabase
      .from("purchase_request_tracker")
      .select(
        "id, request_date, item_name, department, qty, unit, supplier_name, supplier_contact, total_price, po_status, purchase_status, estimated_arrival_date, arrival_date, note, stock_applied_at",
      )
      .order("request_date", { ascending: false })
      .limit(180),
    supabase
      .from("worksheet_session")
      .select("id, business_date, department, status")
      .gte("business_date", last30Start)
      .lte("business_date", businessDate)
      .limit(120),
    supabase
      .from("stock_ledger")
      .select("business_date, ingredient_id, opening_stock, in_qty, theoretical_usage, adjustment_qty, closing_stock")
      .order("business_date", { ascending: false })
      .limit(450),
    supabase
      .from("worksheet_opname_pending")
      .select("business_date, ingredient_id, system_stock, physical_stock, variance_qty, variance_pct, status")
      .order("business_date", { ascending: false })
      .limit(120),
    supabase
      .from("worksheet_menu_issue_line")
      .select("menu_item_id, quantity, reason, note, created_at")
      .order("created_at", { ascending: false })
      .limit(120),
    supabase
      .from("demand_event")
      .select("title, event_type, department, start_date, end_date, expected_uplift_pct, notes")
      .lte("start_date", businessDate)
      .gte("end_date", last30Start)
      .order("start_date", { ascending: false })
      .limit(80),
  ]);

  const ingredients = ((ingredientResult.data ?? []) as IngredientContextRow[]).map((row) => ({
    ...row,
    current_stock: Number(row.current_stock ?? 0),
    minimum_stock: Number(row.minimum_stock ?? 0),
    default_unit_price: Number(row.default_unit_price ?? 0),
  }));
  const menus = (menuResult.data ?? []) as MenuItemRow[];
  const sessions = (sessionResult.data ?? []) as Pick<WorksheetSessionRow, "id" | "business_date" | "department">[];
  const sessionIds = sessions.map((session) => session.id);

  const soldResult =
    sessionIds.length > 0
      ? await supabase
          .from("worksheet_sold_line")
          .select("session_id, menu_item_id, quantity_sold")
          .in("session_id", sessionIds)
          .limit(900)
      : { data: [], error: null };

  const salesRows = aggregateSales(
    menus,
    sessions,
    (soldResult.data ?? []) as { session_id?: string; menu_item_id: string; quantity_sold: number }[],
  );

  const purchaseRequests = poResult.data ?? [];
  const suppliers = supplierResult.data ?? [];
  const ledgerRows = ledgerResult.data ?? [];
  const pendingOpname = opnameResult.data ?? [];
  const issueRows = issueResult.data ?? [];
  const demandEvents = eventResult.data ?? [];
  const ingredientNameById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name]));
  const menuNameById = new Map(menus.map((menu) => [menu.id, menu.menu_name]));

  const lowStockIngredients = ingredients
    .filter(
      (row) =>
        row.is_active &&
        row.is_stock_tracked &&
        Number(row.minimum_stock) > 0 &&
        Number(row.current_stock) <= Number(row.minimum_stock),
    )
    .sort((a, b) => a.current_stock - b.current_stock);

  const compactIngredient = (row: IngredientContextRow) => ({
    name: row.name,
    department: row.department,
    stock: row.current_stock,
    minimum: row.minimum_stock,
    unit: row.unit,
    kind: row.kind,
    active: row.is_active,
    tracked: row.is_stock_tracked,
  });
  const compactMenu = (row: MenuSalesRow) => ({
    menu: row.menu_name,
    department: row.department,
    active: row.is_active,
    sold: row.quantity_sold,
    revenue: row.revenue,
    price: row.price,
  });
  const compactPurchaseRequest = (row: Record<string, unknown>) => ({
    requestDate: row.request_date,
    item: row.item_name,
    department: row.department,
    qty: row.qty,
    unit: row.unit,
    supplier: row.supplier_name,
    total: row.total_price,
    poStatus: row.po_status,
    purchaseStatus: row.purchase_status,
    eta: row.estimated_arrival_date,
    arrival: row.arrival_date,
    note: String(row.note ?? "").slice(0, 80),
  });
  const compactSupplier = (row: Record<string, unknown>) => ({
    name: row.name,
    category: row.category,
    pic: row.pic_name,
    minOrder: row.min_order_amount,
    active: row.is_active,
  });
  const compactLedger = (row: Record<string, unknown>) => ({
    date: row.business_date,
    ingredient: ingredientNameById.get(String(row.ingredient_id)) ?? row.ingredient_id,
    opening: row.opening_stock,
    in: row.in_qty,
    usage: row.theoretical_usage,
    adjustment: row.adjustment_qty,
    closing: row.closing_stock,
  });
  const compactOpname = (row: Record<string, unknown>) => ({
    date: row.business_date,
    ingredient: ingredientNameById.get(String(row.ingredient_id)) ?? row.ingredient_id,
    system: row.system_stock,
    physical: row.physical_stock,
    variance: row.variance_qty,
    variancePct: row.variance_pct,
    status: row.status,
  });
  const compactIssue = (row: Record<string, unknown>) => ({
    createdAt: row.created_at,
    menu: menuNameById.get(String(row.menu_item_id)) ?? row.menu_item_id,
    qty: row.quantity,
    reason: row.reason,
    note: String(row.note ?? "").slice(0, 80),
  });

  const openPurchaseRequests = purchaseRequests.filter((row) => {
    const status = normalize((row as { purchase_status?: string }).purchase_status);
    return status !== "arrived" && status !== "cancelled";
  });

  return {
    generatedAt: new Date().toISOString(),
    businessDate,
    question,
    intents,
    searchTerms: terms,
    dateWindows: {
      today: businessDate,
      last7Start,
      last30Start,
    },
    database: {
      counts: {
        ingredients: ingredients.length,
        menus: menus.length,
        suppliers: suppliers.length,
        purchaseRequests: purchaseRequests.length,
        worksheetSessionsLast30Days: sessions.length,
        stockLedgerRows: ledgerRows.length,
        pendingOpnameRows: pendingOpname.length,
        menuIssueRows: issueRows.length,
        demandEvents: demandEvents.length,
      },
      lowStockIngredients: limitRows(lowStockIngredients, wantsStock ? 18 : 6).map(compactIngredient),
      matchedIngredients: limitRows(
        ingredients.filter((row) => rowMatchesTerms(row as unknown as Record<string, unknown>, terms)),
        wantsStock ? 12 : 5,
      ).map(compactIngredient),
      matchedMenus: limitRows(
        salesRows.filter((row) => rowMatchesTerms(row as unknown as Record<string, unknown>, terms)),
        wantsSales ? 12 : 5,
      ).map(compactMenu),
      salesLast30Days: limitRows(salesRows, wantsSales ? 25 : 5).map(compactMenu),
      openPurchaseRequests: limitRows(openPurchaseRequests, wantsPo ? 25 : 5).map((row) =>
        compactPurchaseRequest(row as Record<string, unknown>),
      ),
      matchedPurchaseRequests: limitRows(
        purchaseRequests.filter((row) => rowMatchesTerms(row as Record<string, unknown>, terms)),
        wantsPo ? 12 : 5,
      ).map((row) => compactPurchaseRequest(row as Record<string, unknown>)),
      suppliers: limitRows(suppliers, wantsSupplier ? 15 : 4).map((row) =>
        compactSupplier(row as Record<string, unknown>),
      ),
      matchedSuppliers: limitRows(
        suppliers.filter((row) => rowMatchesTerms(row as Record<string, unknown>, terms)),
        wantsSupplier ? 10 : 4,
      ).map((row) => compactSupplier(row as Record<string, unknown>)),
      recentLedger: limitRows(ledgerRows, wantsLedger ? 25 : 4).map((row) =>
        compactLedger(row as Record<string, unknown>),
      ),
      pendingOpname: limitRows(pendingOpname, wantsStock ? 15 : 3).map((row) =>
        compactOpname(row as Record<string, unknown>),
      ),
      recentIssues: limitRows(issueRows, wantsIssue ? 20 : 3).map((row) =>
        compactIssue(row as Record<string, unknown>),
      ),
      activeDemandEvents: limitRows(demandEvents, wantsEvent ? 25 : 5),
    },
  };
}
