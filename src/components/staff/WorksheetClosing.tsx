"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Lock,
  Minus,
  Package,
  PackageMinus,
  ClipboardList,
  UtensilsCrossed,
  Plus,
  Search,
  Unlock,
  X,
  CalendarDays,
  Camera,
  Image as ImageIcon,
  Beaker,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Toast, type ToastVariant } from "@/components/ui/Toast";
import { translateWorksheetSubmitError } from "@/lib/worksheet/errorTranslator";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession, type StaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ClosingStatus,
  Department,
  IngredientRow,
  MenuItemRow,
  RecipeLineForCalc,
} from "@/lib/types/database";
import { canAccessWorksheet } from "@/lib/worksheet/access";
import {
  OUTSTOCK_LOGICAL_FALLACY_MESSAGE,
  findOutstockValidationErrors,
  formatStockAvailability,
  getClosingSubmitBlocker,
  hasOutstockValidationErrors,
  validateOutstockLine,
} from "@/lib/worksheet/outstockValidation";
import { formatBusinessDateLabel, resolveBusinessDate } from "@/lib/utils/dateHelper";
import { clearWorksheetDraft } from "@/lib/worksheet/draftStorage";
import { finalizeWorksheetSession } from "@/lib/worksheet/finalizeSession";
import {
  enqueueOpnamePendingRecords,
  evaluateOpnameSubmission,
} from "@/lib/worksheet/opnameSubmit";
import { formatSystemStockGuide } from "@/lib/worksheet/opnameVariance";
import { ledgerRowToSnapshot } from "@/lib/worksheet/stockLedgerSnapshot";
import {
  findTypoGuardWarnings,
  type TypoGuardWarning,
} from "@/lib/worksheet/typoGuard";
import { useWorksheetDraft } from "@/hooks/useWorksheetDraft";
import { TypoConfirmModal } from "@/components/worksheet/TypoConfirmModal";
import { WorksheetStickyActionBar } from "@/components/worksheet/WorksheetStickyActionBar";

const SUBMITTED_LOCK_STATUSES: ClosingStatus[] = [
  "SUBMITTED",
  "ADJUSTED",
  "LOCKED",
  "PENDING_APPROVAL_ADMIN",
];
const OUTLET_TIMEZONE = "Asia/Jakarta";
const CLOSING_SUBMIT_UNLOCK_HOUR = 0;
const BUSINESS_DATE_CUTOFF_HOUR = 5;

type WorksheetTab = "receive" | "outstock" | "opname" | "premix" | "issue" | "sold";

type IngredientLineState = {
  inQty: string;
  inUnitPrice: string;
  closingStock: string;
  outQty: string;
  outNote: string;
  outPhotoUrl: string;
  outPhotoPublicId: string;
};

type RecipeVersionNested = {
  id: string;
  is_active: boolean;
  recipe_line: RecipeLineForCalc[];
};

type MenuItemWithRecipe = MenuItemRow & {
  menu_recipe_version: RecipeVersionNested[];
};

type MenuIssueLineState = {
  quantity: string;
  reason: MenuIssueReason;
  note: string;
  photoUrl: string;
  photoPublicId: string;
};

type SoldEntrySummary = {
  staffId: string | null;
  staffName: string;
  quantity: number;
};

type SoldEntryJoined = {
  menu_item_id: string;
  staff_id: string | null;
  quantity_sold: number;
  staff: { name: string } | { name: string }[] | null;
};

type PremixRecipeComponent = {
  ingredient_id: string;
  qty_per_batch: number;
  ingredient: Pick<
    IngredientRow,
    "id" | "name" | "unit" | "purchase_to_stock_factor" | "current_stock" | "is_stock_tracked"
  > | null;
};

type PremixRecipeNested = {
  id: string;
  is_active: boolean;
  yield_quantity: number;
  recipe_component: PremixRecipeComponent[];
};

type PremixItemWithRecipe = IngredientRow & {
  recipes: PremixRecipeNested[] | PremixRecipeNested | null;
};

type StockLedgerInsert = {
  business_date: string;
  ingredient_id: string;
  opening_stock: number;
  in_qty: number;
  theoretical_usage: number;
  adjustment_qty: number;
  closing_stock: number;
};

type LedgerSnapshotForCalc = Omit<StockLedgerInsert, "business_date">;

type WorksheetClosingProps = {
  department: Department;
  title: string;
};

const DEFAULT_LINE: IngredientLineState = {
  inQty: "",
  inUnitPrice: "",
  closingStock: "",
  outQty: "",
  outNote: "",
  outPhotoUrl: "",
  outPhotoPublicId: "",
};

const TAB_CONFIG: { id: WorksheetTab; label: string; icon: typeof Package }[] = [
  { id: "receive", label: "Receive", icon: Package },
  { id: "outstock", label: "Out Stock", icon: PackageMinus },
  { id: "opname", label: "Opname", icon: ClipboardList },
  { id: "premix", label: "Premix", icon: Beaker },
  { id: "issue", label: "Remake", icon: AlertTriangle },
  { id: "sold", label: "Menu", icon: UtensilsCrossed },
];

const MENU_ISSUE_REASONS = [
  { id: "too_salty", label: "Terlalu asin" },
  { id: "undercooked", label: "Kurang matang" },
  { id: "burnt", label: "Gosong" },
  { id: "hair", label: "Ada rambut" },
  { id: "wrong_order", label: "Salah order" },
  { id: "spilled", label: "Jatuh / tumpah" },
  { id: "guest_complaint", label: "Complaint tamu" },
  { id: "staff_error", label: "Staff error" },
  { id: "other", label: "Lainnya" },
] as const;

type MenuIssueReason = (typeof MENU_ISSUE_REASONS)[number]["id"];

const INPUT_CLASS =
  "min-h-12 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-lg font-semibold tabular-nums text-zinc-50 placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50";

const SEARCH_INPUT_CLASS =
  "min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2.5 pl-10 pr-10 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

const TEST_BUSINESS_DATE_STORAGE_KEY = "artha_test_business_date";

function parseQty(value: string): number {
  const n = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function isBlankQty(value: string | null | undefined): boolean {
  return String(value ?? "").trim() === "";
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}

function getPurchaseUnit(ingredient: Pick<IngredientRow, "unit" | "purchase_unit">): string {
  return ingredient.purchase_unit?.trim() || ingredient.unit;
}

function getPurchaseToStockFactor(
  ingredient: Pick<IngredientRow, "purchase_to_stock_factor">
): number {
  const factor = Number(ingredient.purchase_to_stock_factor);
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
}

function receiveInputToStockQty(
  ingredient: Pick<IngredientRow, "purchase_to_stock_factor">,
  receiveInputQty: string
): number {
  return parseQty(receiveInputQty) * getPurchaseToStockFactor(ingredient);
}

function stockQtyToReceiveInput(
  ingredient: Pick<IngredientRow, "purchase_to_stock_factor"> | undefined,
  stockQty: number
): string {
  if (!ingredient || stockQty === 0) return "";
  const factor = getPurchaseToStockFactor(ingredient);
  return formatQty(stockQty / factor);
}

function blankZero(value: string | undefined): string {
  return parseQty(value ?? "") === 0 ? "" : String(value ?? "");
}

function normalizeRestoredLines(
  restoredLines: Record<
    string,
    Omit<IngredientLineState, "inUnitPrice" | "outPhotoUrl" | "outPhotoPublicId"> &
      Partial<Pick<IngredientLineState, "inUnitPrice" | "outPhotoUrl" | "outPhotoPublicId">>
  >
): Record<string, IngredientLineState> {
  return Object.fromEntries(
    Object.entries(restoredLines).map(([ingredientId, line]) => [
      ingredientId,
      {
        inQty: blankZero(line.inQty),
        inUnitPrice: blankZero(line.inUnitPrice),
        closingStock: blankZero(line.closingStock),
        outQty: blankZero(line.outQty),
        outNote: line.outNote ?? "",
        outPhotoUrl: line.outPhotoUrl ?? "",
        outPhotoPublicId: line.outPhotoPublicId ?? "",
      },
    ])
  );
}

function normalizeRestoredSoldItems(restoredSoldItems: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(restoredSoldItems).map(([menuId, value]) => [menuId, blankZero(value)])
  );
}

function createDefaultMenuIssue(): MenuIssueLineState {
  return { quantity: "", reason: "guest_complaint", note: "", photoUrl: "", photoPublicId: "" };
}

function normalizeIssueReason(value: string | null | undefined): MenuIssueReason {
  return MENU_ISSUE_REASONS.some((reason) => reason.id === value)
    ? (value as MenuIssueReason)
    : "other";
}

function isWorksheetLocked(status: ClosingStatus | null | undefined): boolean {
  return status !== null && status !== undefined && SUBMITTED_LOCK_STATUSES.includes(status);
}

function canRequestResubmit(status: ClosingStatus | null | undefined): boolean {
  return status === "SUBMITTED" || status === "PENDING_APPROVAL_ADMIN";
}

function getHourInOutletTimeZone(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: OUTLET_TIMEZONE,
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const hourPart = parts.find((part) => part.type === "hour");
  return hourPart ? Number(hourPart.value) : 0;
}

function isClosingSubmitWindowOpen(date: Date = new Date()): boolean {
  const hour = getHourInOutletTimeZone(date);
  return hour >= CLOSING_SUBMIT_UNLOCK_HOUR && hour < BUSINESS_DATE_CUTOFF_HOUR;
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function canUseTestBusinessDate(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.search.includes("test_date=1")
  );
}

function resolveWorksheetBusinessDate(): string {
  if (canUseTestBusinessDate()) {
    const stored = window.localStorage.getItem(TEST_BUSINESS_DATE_STORAGE_KEY);
    if (stored && isIsoDate(stored)) return stored;
  }
  return resolveBusinessDate();
}

function getActiveRecipeLines(menu: MenuItemWithRecipe): RecipeLineForCalc[] {
  const active = menu.menu_recipe_version?.find((v) => v.is_active);
  return active?.recipe_line ?? [];
}

function getActivePremixRecipe(premix: PremixItemWithRecipe): PremixRecipeNested | null {
  const recipes = Array.isArray(premix.recipes)
    ? premix.recipes
    : premix.recipes
      ? [premix.recipes]
      : [];
  return recipes.find((recipe) => recipe.is_active) ?? null;
}

function computePremixEffects(
  premixItems: PremixItemWithRecipe[],
  premixQuantities: Record<string, string>
): {
  outputMap: Map<string, number>;
  usageMap: Map<string, number>;
} {
  const outputMap = new Map<string, number>();
  const usageMap = new Map<string, number>();

  for (const premix of premixItems) {
    const qty = parseQty(premixQuantities[premix.id] ?? "");
    if (qty <= 0) continue;
    const recipe = getActivePremixRecipe(premix);
    if (!recipe) continue;

    const outputQty = qty * Number(recipe.yield_quantity ?? 1);
    outputMap.set(premix.id, (outputMap.get(premix.id) ?? 0) + outputQty);
    for (const component of recipe.recipe_component ?? []) {
      if (component.ingredient?.is_stock_tracked === false) continue;
      const required = Number(component.qty_per_batch) * qty;
      usageMap.set(component.ingredient_id, (usageMap.get(component.ingredient_id) ?? 0) + required);
    }
  }

  return { outputMap, usageMap };
}

function createDefaultLine(preset?: Partial<IngredientLineState>): IngredientLineState {
  return {
    inQty: preset?.inQty ?? "",
    inUnitPrice: preset?.inUnitPrice ?? "",
    closingStock: preset?.closingStock ?? "",
    outQty: preset?.outQty ?? "",
    outNote: preset?.outNote ?? "",
    outPhotoUrl: preset?.outPhotoUrl ?? "",
    outPhotoPublicId: preset?.outPhotoPublicId ?? "",
  };
}

async function fetchMenusWithActiveRecipes(
  supabase: ReturnType<typeof getSupabaseClient>,
  department: Department
): Promise<MenuItemWithRecipe[]> {
  const { data, error } = await supabase
    .from("menu_item")
    .select(
      `
        id,
        menu_name,
        department,
        price,
        is_active,
        created_at,
        updated_at,
        menu_recipe_version (
          id,
          is_active,
          recipe_line (
            ingredient_id,
            quantity_per_serving
          )
        )
      `
    )
    .eq("department", department)
    .eq("is_active", true)
    .order("menu_name", { ascending: true });

  if (error) {
    throw new Error(`Gagal memuat resep aktif: ${error.message}`);
  }

  // Gunakan 'as unknown as' untuk memberitahu TypeScript bahwa 
  // hasil query ini sudah pasti memiliki field yang diperlukan
  return (data ?? []) as unknown as MenuItemWithRecipe[];
}

async function fetchPremixWithActiveRecipes(
  supabase: ReturnType<typeof getSupabaseClient>,
  department: Department
): Promise<PremixItemWithRecipe[]> {
  const { data, error } = await supabase
    .from("ingredient")
    .select(
      `
        *,
        recipes (
          id,
          is_active,
          yield_quantity,
          recipe_component (
            ingredient_id,
            qty_per_batch,
            ingredient:ingredient_id (
              id,
              name,
              unit,
              purchase_to_stock_factor,
              current_stock,
              is_stock_tracked
            )
          )
        )
      `
    )
    .eq("department", department)
    .eq("kind", "premix")
    .eq("is_active", true)
    .eq("is_stock_tracked", true)
    .order("name", { ascending: true });

  if (error) throw new Error(`Gagal memuat resep premix: ${error.message}`);
  return (data ?? []) as unknown as PremixItemWithRecipe[];
}

async function fetchIngredientsByIds(
  supabase: ReturnType<typeof getSupabaseClient>,
  ingredientIds: string[]
): Promise<IngredientRow[]> {
  const uniqueIds = [...new Set(ingredientIds)];
  if (uniqueIds.length === 0) return [];

  const { data, error } = await supabase
    .from("ingredient")
    .select("*")
    .in("id", uniqueIds);

  if (error) throw new Error(`Gagal memuat bahan lintas departemen: ${error.message}`);
  return (data ?? []) as IngredientRow[];
}

async function fetchLedgerSnapshotForDate(
  supabase: ReturnType<typeof getSupabaseClient>,
  ingredientIds: string[],
  date: string
): Promise<Map<string, LedgerSnapshotForCalc>> {
  const map = new Map<string, LedgerSnapshotForCalc>();
  const uniqueIds = [...new Set(ingredientIds)];
  if (uniqueIds.length === 0) return map;

  const { data, error } = await supabase
    .from("stock_ledger")
    .select("ingredient_id, opening_stock, in_qty, theoretical_usage, adjustment_qty, closing_stock")
    .eq("business_date", date)
    .in("ingredient_id", uniqueIds);

  if (error) throw new Error(`Gagal memuat ledger hari ini: ${error.message}`);

  for (const row of data ?? []) {
    map.set(row.ingredient_id, {
      ingredient_id: row.ingredient_id,
      opening_stock: Number(row.opening_stock),
      in_qty: Number(row.in_qty),
      theoretical_usage: Number(row.theoretical_usage),
      adjustment_qty: Number(row.adjustment_qty),
      closing_stock: Number(row.closing_stock),
    });
  }

  return map;
}

async function fetchSoldMenuTheoreticalUsage(
  supabase: ReturnType<typeof getSupabaseClient>,
  date: string,
  currentSessionId: string
): Promise<Map<string, number>> {
  const usage = new Map<string, number>();

  const { data: sessions, error: sessionErr } = await supabase
    .from("worksheet_session")
    .select("id, status")
    .eq("business_date", date);

  if (sessionErr) throw new Error(`Gagal memuat sesi closing: ${sessionErr.message}`);

  const sessionIds = (sessions ?? [])
    .filter((session) => session.id === currentSessionId || isWorksheetLocked(session.status))
    .map((session) => session.id);

  if (sessionIds.length === 0) return usage;

  const { data: soldLines, error: soldErr } = await supabase
    .from("worksheet_sold_line")
    .select("menu_item_id, quantity_sold")
    .in("session_id", sessionIds);

  if (soldErr) throw new Error(`Gagal memuat menu terjual lintas departemen: ${soldErr.message}`);

  const qtyByMenuId = new Map<string, number>();
  for (const line of soldLines ?? []) {
    const qty = Number(line.quantity_sold);
    if (qty <= 0) continue;
    qtyByMenuId.set(line.menu_item_id, (qtyByMenuId.get(line.menu_item_id) ?? 0) + qty);
  }

  const menuIds = [...qtyByMenuId.keys()];
  if (menuIds.length === 0) return usage;

  const { data: versions, error: recipeErr } = await supabase
    .from("menu_recipe_version")
    .select(
      `
        menu_item_id,
        is_active,
        recipe_line (
          ingredient_id,
          quantity_per_serving
        )
      `
    )
    .in("menu_item_id", menuIds)
    .eq("is_active", true);

  if (recipeErr) throw new Error(`Gagal memuat resep menu lintas departemen: ${recipeErr.message}`);

  const recipeVersions = (versions ?? []) as unknown as {
    menu_item_id: string;
    recipe_line?: RecipeLineForCalc[];
  }[];

  for (const version of recipeVersions) {
    const soldQty = qtyByMenuId.get(version.menu_item_id) ?? 0;
    for (const line of version.recipe_line ?? []) {
      const add = soldQty * Number(line.quantity_per_serving);
      usage.set(line.ingredient_id, (usage.get(line.ingredient_id) ?? 0) + add);
    }
  }

  return usage;
}

async function fetchMenuIssueTheoreticalUsage(
  supabase: ReturnType<typeof getSupabaseClient>,
  date: string,
  currentSessionId: string
): Promise<Map<string, number>> {
  const usage = new Map<string, number>();

  const { data: sessions, error: sessionErr } = await supabase
    .from("worksheet_session")
    .select("id, status")
    .eq("business_date", date);

  if (sessionErr) throw new Error(`Gagal memuat sesi issue menu: ${sessionErr.message}`);

  const sessionIds = (sessions ?? [])
    .filter((session) => session.id === currentSessionId || isWorksheetLocked(session.status))
    .map((session) => session.id);

  if (sessionIds.length === 0) return usage;

  const { data: issueLines, error: issueErr } = await supabase
    .from("worksheet_menu_issue_line")
    .select("menu_item_id, quantity")
    .in("session_id", sessionIds);

  if (issueErr) throw new Error(`Gagal memuat menu issue: ${issueErr.message}`);

  const qtyByMenuId = new Map<string, number>();
  for (const line of issueLines ?? []) {
    const qty = Number(line.quantity);
    if (qty <= 0) continue;
    qtyByMenuId.set(line.menu_item_id, (qtyByMenuId.get(line.menu_item_id) ?? 0) + qty);
  }

  const menuIds = [...qtyByMenuId.keys()];
  if (menuIds.length === 0) return usage;

  const { data: versions, error: recipeErr } = await supabase
    .from("menu_recipe_version")
    .select(
      `
        menu_item_id,
        is_active,
        recipe_line (
          ingredient_id,
          quantity_per_serving
        )
      `
    )
    .in("menu_item_id", menuIds)
    .eq("is_active", true);

  if (recipeErr) throw new Error(`Gagal memuat resep menu issue: ${recipeErr.message}`);

  const recipeVersions = (versions ?? []) as unknown as {
    menu_item_id: string;
    recipe_line?: RecipeLineForCalc[];
  }[];

  for (const version of recipeVersions) {
    const issueQty = qtyByMenuId.get(version.menu_item_id) ?? 0;
    for (const line of version.recipe_line ?? []) {
      const add = issueQty * Number(line.quantity_per_serving);
      usage.set(line.ingredient_id, (usage.get(line.ingredient_id) ?? 0) + add);
    }
  }

  return usage;
}

async function fetchLedgerClosingMap(
  supabase: ReturnType<typeof getSupabaseClient>,
  ingredientIds: string[],
  date: string,
  mode: "before" | "through"
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ingredientIds.length === 0) return map;

  const query = supabase
    .from("stock_ledger")
    .select("ingredient_id, business_date, closing_stock")
    .in("ingredient_id", ingredientIds)
    .order("business_date", { ascending: false });

  const { data, error } =
    mode === "before" ? await query.lt("business_date", date) : await query.lte("business_date", date);

  if (error) {
    throw new Error(`Gagal memuat snapshot stock ledger: ${error.message}`);
  }

  for (const row of data ?? []) {
    if (!map.has(row.ingredient_id)) {
      map.set(row.ingredient_id, Number(row.closing_stock) || 0);
    }
  }

  return map;
}

async function fetchLatestLedgerClosingMap(
  supabase: ReturnType<typeof getSupabaseClient>,
  ingredientIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ingredientIds.length === 0) return map;

  const { data, error } = await supabase
    .from("stock_ledger")
    .select("ingredient_id, business_date, closing_stock")
    .in("ingredient_id", ingredientIds)
    .order("business_date", { ascending: false });

  if (error) {
    throw new Error(`Gagal memuat cache stok terbaru: ${error.message}`);
  }

  for (const row of data ?? []) {
    if (!map.has(row.ingredient_id)) {
      map.set(row.ingredient_id, Number(row.closing_stock) || 0);
    }
  }

  return map;
}

export function WorksheetClosing({ department, title }: WorksheetClosingProps) {
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [activeTab, setActiveTab] = useState<WorksheetTab>("receive");
  const [businessDate, setBusinessDate] = useState<string>("");
  const [worksheetStatus, setWorksheetStatus] = useState<ClosingStatus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [menus, setMenus] = useState<MenuItemWithRecipe[]>([]);
  const [premixItems, setPremixItems] = useState<PremixItemWithRecipe[]>([]);
  const [lines, setLines] = useState<Record<string, IngredientLineState>>({});
  const [receiveEntryInputs, setReceiveEntryInputs] = useState<Record<string, string>>({});
  const [soldItems, setSoldItems] = useState<Record<string, string>>({});
  const [soldEntrySummaries, setSoldEntrySummaries] = useState<Record<string, SoldEntrySummary[]>>({});
  const [menuIssues, setMenuIssues] = useState<Record<string, MenuIssueLineState>>({});
  const [premixQuantities, setPremixQuantities] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingReceive, setIsSavingReceive] = useState(false);
  const [isSavingOutStock, setIsSavingOutStock] = useState(false);
  const [isSavingOpname, setIsSavingOpname] = useState(false);
  const [isSavingPremix, setIsSavingPremix] = useState(false);
  const [isSavingMenuProgress, setIsSavingMenuProgress] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingResubmit, setIsRequestingResubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    title?: string;
    message: string;
    description?: string;
    variant: ToastVariant;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typoModalOpen, setTypoModalOpen] = useState(false);
  const [typoWarnings, setTypoWarnings] = useState<TypoGuardWarning[]>([]);
  const [showTestDateControls, setShowTestDateControls] = useState(false);
  const [testBusinessDate, setTestBusinessDate] = useState("");
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);
  const [clockTick, setClockTick] = useState(() => Date.now());
  const pendingTypoActionRef = useRef<(() => void) | null>(null);

  const locked = isWorksheetLocked(worksheetStatus ?? undefined);
  const pendingAdminApproval = worksheetStatus === "PENDING_APPROVAL_ADMIN";
  const showResubmitCta = canRequestResubmit(worksheetStatus ?? undefined);
  const canEdit = canEditStaffData(staff?.role);
  const closingSubmitOpen = useMemo(() => isClosingSubmitWindowOpen(new Date(clockTick)), [clockTick]);

  const businessDateLabel = useMemo(
    () => (businessDate ? formatBusinessDateLabel(businessDate) : ""),
    [businessDate]
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredIngredients = useMemo(() => {
    const sorted = [...ingredients].sort((a, b) =>
      a.name.localeCompare(b.name, "id", { sensitivity: "base" })
    );
    if (!normalizedSearch) return sorted;
    return sorted.filter((ing) => ing.name.toLowerCase().includes(normalizedSearch));
  }, [ingredients, normalizedSearch]);

  const filteredReceiveIngredients = useMemo(() => {
    const rawIngredients = ingredients
      .filter((ing) => ing.kind === "raw")
      .sort((a, b) => a.name.localeCompare(b.name, "id", { sensitivity: "base" }));
    if (!normalizedSearch) return rawIngredients;
    return rawIngredients.filter((ing) => ing.name.toLowerCase().includes(normalizedSearch));
  }, [ingredients, normalizedSearch]);

  const filteredMenus = useMemo(() => {
    if (!normalizedSearch) return menus;
    return menus.filter((menu) => menu.menu_name.toLowerCase().includes(normalizedSearch));
  }, [menus, normalizedSearch]);

  const filteredIssueMenus = filteredMenus;

  const filteredPremixItems = useMemo(() => {
    if (!normalizedSearch) return premixItems;
    return premixItems.filter((item) => item.name.toLowerCase().includes(normalizedSearch));
  }, [normalizedSearch, premixItems]);

  const premixEffects = useMemo(
    () => computePremixEffects(premixItems, premixQuantities),
    [premixItems, premixQuantities]
  );

  const outstockHasBlockingErrors = useMemo(
    () => hasOutstockValidationErrors(ingredients, lines),
    [ingredients, lines]
  );

  const refreshIngredientStockFromDb = useCallback(async () => {
    const { data, error: stockErr } = await supabase
      .from("ingredient")
      .select("*")
      .eq("department", department)
      .eq("is_active", true)
      .eq("is_stock_tracked", true)
      .order("name", { ascending: true });

    if (stockErr) {
      throw new Error(stockErr.message);
    }

    const freshList = data ?? [];
    setIngredients(freshList);
    return freshList;
  }, [department, supabase]);

  const assertOutstockPayloadValid = useCallback(
    async (stockList: IngredientRow[]) => {
      const errors = findOutstockValidationErrors(stockList, lines);
      if (errors.length === 0) return;

      const first = errors[0];
      if (first.exceedsStock) {
        throw new Error(OUTSTOCK_LOGICAL_FALLACY_MESSAGE);
      }

      throw new Error(
        `Keterangan / Alasan Outstock wajib diisi untuk ${first.ingredientName}.`
      );
    },
    [lines]
  );

  const initIngredientLines = useCallback(
    (items: IngredientRow[], preset?: Record<string, Partial<IngredientLineState>>) => {
      const next: Record<string, IngredientLineState> = {};
      for (const ing of items) {
        const rowPreset = preset?.[ing.id];
        next[ing.id] = createDefaultLine({
          ...rowPreset,
        });
      }
      setLines(next);
    },
    []
  );

  const showSuccessToast = (message: string) => {
    setError(null);
    setToast({ message, variant: "success" });
  };

  const showPlainErrorToast = (message: string) => {
    setError(message);
    setToast({ message, variant: "error" });
  };

  const showTranslatedSubmitError = (err: unknown) => {
    const translated = translateWorksheetSubmitError(err);
    setError(translated.description);
    setToast({
      title: translated.title,
      message: translated.description,
      description: translated.description,
      variant: translated.variant,
    });
  };

  const focusWorksheetField = useCallback(
    (tab: WorksheetTab, ingredientId?: string) => {
      setActiveTab(tab);
      if (!ingredientId) return;
      window.requestAnimationFrame(() => {
        document
          .getElementById(`worksheet-${tab}-${ingredientId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    },
    []
  );

  const initSoldItems = useCallback(
    (menuList: MenuItemWithRecipe[], preset?: Record<string, string>) => {
      const next: Record<string, string> = {};
      for (const menu of menuList) {
        next[menu.id] = preset?.[menu.id] ?? "";
      }
      setSoldItems(next);
    },
    []
  );

  const initPremixQuantities = useCallback(
    (items: PremixItemWithRecipe[], preset?: Record<string, string>) => {
      const next: Record<string, string> = {};
      for (const item of items) {
        next[item.id] = preset?.[item.id] ?? "";
      }
      setPremixQuantities(next);
    },
    []
  );

  const loadData = useCallback(async () => {
    if (!staff) return;

    setIsLoading(true);
    setError(null);

    const date = resolveWorksheetBusinessDate();
    setBusinessDate(date);
    setTestBusinessDate(date);

    const { error: dayErr } = await supabase.from("business_day").upsert(
      { business_date: date, status: "DRAFT" },
      { onConflict: "business_date" }
    );
    if (dayErr) {
      setError(dayErr.message);
      setIsLoading(false);
      return;
    }

    const { data: ingRows, error: ingErr } = await supabase
      .from("ingredient")
      .select("*")
      .eq("department", department)
      .eq("is_active", true)
      .eq("is_stock_tracked", true)
      .order("name", { ascending: true });

    if (ingErr) {
      setError(ingErr.message);
      setIsLoading(false);
      return;
    }

    const ingredientList = ingRows ?? [];
    setIngredients(ingredientList);
    const ingredientIds = ingredientList.map((i) => i.id);
    const ingredientById = new Map(ingredientList.map((ingredient) => [ingredient.id, ingredient]));

    let menuList: MenuItemWithRecipe[];
    let premixList: PremixItemWithRecipe[];
    try {
      [menuList, premixList] = await Promise.all([
        fetchMenusWithActiveRecipes(supabase, department),
        fetchPremixWithActiveRecipes(supabase, department),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat menu/premix.");
      setIsLoading(false);
      return;
    }
    setMenus(menuList);
    setPremixItems(premixList);

    const { data: ws, error: wsErr } = await supabase
      .from("worksheet_session")
      .select("id, status")
      .eq("business_date", date)
      .eq("department", department)
      .maybeSingle();

    if (wsErr) {
      setError(wsErr.message);
      setIsLoading(false);
      return;
    }

    setWorksheetStatus(ws?.status ?? null);
    setSessionId(ws?.id ?? null);

    const ingredientPreset: Record<string, Partial<IngredientLineState>> = {};
    const soldPreset: Record<string, string> = {};
    const issuePreset: Record<string, MenuIssueLineState> = {};
    const premixPreset: Record<string, string> = {};
    setSoldEntrySummaries({});

    if (ws?.id) {
      const { data: inLines } = await supabase
        .from("worksheet_in_line")
        .select("ingredient_id, quantity")
        .eq("session_id", ws.id);

      for (const row of inLines ?? []) {
        ingredientPreset[row.ingredient_id] = {
          ...ingredientPreset[row.ingredient_id],
          inQty: Number(row.quantity) === 0 ? "" : String(row.quantity),
        };
      }

      const { data: outLines } = await supabase
        .from("worksheet_out_line")
        .select("ingredient_id, quantity, note, photo_url, photo_public_id")
        .eq("session_id", ws.id);

      for (const row of outLines ?? []) {
        ingredientPreset[row.ingredient_id] = {
          ...ingredientPreset[row.ingredient_id],
          outQty: Number(row.quantity) === 0 ? "" : String(row.quantity),
          outNote: row.note ?? "",
          outPhotoUrl: row.photo_url ?? "",
          outPhotoPublicId: row.photo_public_id ?? "",
        };
      }

      const { data: soldEntries, error: soldEntryErr } = await supabase
        .from("worksheet_sold_entry")
        .select("menu_item_id, staff_id, quantity_sold, staff:staff_id ( name )")
        .eq("session_id", ws.id);

      const soldSummaries: Record<string, SoldEntrySummary[]> = {};

      if (!soldEntryErr && (soldEntries ?? []).length > 0) {
        for (const row of (soldEntries ?? []) as unknown as SoldEntryJoined[]) {
          const staffRaw = row.staff;
          const rowStaff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
          const quantity = Number(row.quantity_sold ?? 0);
          if (quantity <= 0) continue;

          soldSummaries[row.menu_item_id] = [
            ...(soldSummaries[row.menu_item_id] ?? []),
            {
              staffId: row.staff_id,
              staffName: rowStaff?.name ?? "Staff lama / tidak tercatat",
              quantity,
            },
          ];

          if (row.staff_id === staff.id) {
            soldPreset[row.menu_item_id] = String(quantity);
          }
        }
      } else {
        const { data: soldLines } = await supabase
          .from("worksheet_sold_line")
          .select("menu_item_id, quantity_sold")
          .eq("session_id", ws.id);

        for (const row of soldLines ?? []) {
          const quantity = Number(row.quantity_sold);
          if (quantity <= 0) continue;
          soldPreset[row.menu_item_id] = String(quantity);
          soldSummaries[row.menu_item_id] = [
            {
              staffId: null,
              staffName: "Data lama / belum ada staff",
              quantity,
            },
          ];
        }
      }

      setSoldEntrySummaries(soldSummaries);

      const { data: issueLines } = await supabase
        .from("worksheet_menu_issue_line")
        .select("menu_item_id, quantity, reason, note, photo_url, photo_public_id")
        .eq("session_id", ws.id);

      for (const row of issueLines ?? []) {
        issuePreset[row.menu_item_id] = {
          quantity: Number(row.quantity) === 0 ? "" : String(row.quantity),
          reason: normalizeIssueReason(row.reason),
          note: row.note ?? "",
          photoUrl: row.photo_url ?? "",
          photoPublicId: row.photo_public_id ?? "",
        };
      }

      const { data: premixLines } = await supabase
        .from("worksheet_premix_line")
        .select("output_ingredient_id, batch_quantity")
        .eq("session_id", ws.id);

      for (const row of premixLines ?? []) {
        premixPreset[row.output_ingredient_id] =
          Number(row.batch_quantity) === 0 ? "" : String(row.batch_quantity);
      }

      const { data: opnameLines } = await supabase
        .from("worksheet_opname_line")
        .select("ingredient_id, closing_stock")
        .eq("session_id", ws.id);

      for (const row of opnameLines ?? []) {
        ingredientPreset[row.ingredient_id] = {
          ...ingredientPreset[row.ingredient_id],
          closingStock: String(row.closing_stock),
        };
      }

      const { data: ledgers } = await supabase
        .from("stock_ledger")
        .select("ingredient_id, opening_stock, in_qty, theoretical_usage, adjustment_qty, closing_stock")
        .eq("business_date", date)
        .in(
          "ingredient_id",
          ingredientIds
        );

      for (const row of ledgers ?? []) {
        const snapshot = ledgerRowToSnapshot(row);
        const existing = ingredientPreset[row.ingredient_id];
        ingredientPreset[row.ingredient_id] = {
          inQty:
            existing?.inQty ??
            stockQtyToReceiveInput(ingredientById.get(row.ingredient_id), snapshot?.in_qty ?? 0),
          closingStock: existing?.closingStock,
          outQty: existing?.outQty,
          outNote: existing?.outNote,
          outPhotoUrl: existing?.outPhotoUrl,
          outPhotoPublicId: existing?.outPhotoPublicId,
        };
      }
    }

    initIngredientLines(ingredientList, ingredientPreset);
    setReceiveEntryInputs({});
    initSoldItems(menuList, soldPreset);
    setMenuIssues(issuePreset);
    initPremixQuantities(premixList, premixPreset);
    setIsLoading(false);
  }, [department, initIngredientLines, initPremixQuantities, initSoldItems, staff, supabase]);

  useEffect(() => {
    const current = getStaffSession();
    if (!current || !canAccessWorksheet(current, department)) {
      router.replace("/");
      return;
    }
    setStaff(current);
    setShowTestDateControls(canUseTestBusinessDate());
  }, [department, router]);

  useEffect(() => {
    if (staff) void loadData();
  }, [staff, loadData]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockTick(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useWorksheetDraft({
    department,
    businessDate,
    isLoading,
    locked,
    lines,
    soldItems,
    premixQuantities,
    activeTab,
    onRestore: (draft) => {
      const restoredLines = normalizeRestoredLines(draft.lines);
      setLines((prev) =>
        Object.fromEntries(
          Object.entries(restoredLines).map(([ingredientId, line]) => [
            ingredientId,
            {
              ...line,
              inQty: prev[ingredientId]?.inQty ?? line.inQty,
            },
          ])
        )
      );
      setSoldItems(normalizeRestoredSoldItems(draft.soldItems));
      setPremixQuantities(normalizeRestoredSoldItems(draft.premixQuantities ?? {}));
      setActiveTab(draft.activeTab);
      showSuccessToast("Draft lokal dipulihkan setelah refresh.");
    },
  });

  const runWithTypoGuard = (
    fields: Array<keyof Pick<IngredientLineState, "inQty" | "closingStock" | "outQty">>,
    action: () => void | Promise<void>
  ) => {
    const warnings = findTypoGuardWarnings(ingredients, lines, fields);
    if (warnings.length === 0) {
      void action();
      return;
    }
    setTypoWarnings(warnings);
    pendingTypoActionRef.current = () => void action();
    setTypoModalOpen(true);
  };

  const clearDraftAfterSuccess = () => {
    if (businessDate) clearWorksheetDraft(department, businessDate);
  };

  const applyTestBusinessDate = async () => {
    const next = testBusinessDate.trim();
    if (!isIsoDate(next)) {
      showPlainErrorToast("Tanggal test harus format YYYY-MM-DD.");
      return;
    }
    window.localStorage.setItem(TEST_BUSINESS_DATE_STORAGE_KEY, next);
    await loadData();
    showSuccessToast(`Mode test pindah ke business date ${formatBusinessDateLabel(next)}.`);
  };

  const clearTestBusinessDate = async () => {
    window.localStorage.removeItem(TEST_BUSINESS_DATE_STORAGE_KEY);
    const liveDate = resolveBusinessDate();
    setTestBusinessDate(liveDate);
    await loadData();
    showSuccessToast(`Mode test dimatikan. Kembali ke live date ${formatBusinessDateLabel(liveDate)}.`);
  };

  const ensureDraftSession = async (
    date: string
  ): Promise<{ sessionId: string; status: ClosingStatus }> => {
    if (sessionId && worksheetStatus === "DRAFT") {
      return { sessionId, status: "DRAFT" };
    }

    if (sessionId && worksheetStatus && worksheetStatus !== "DRAFT") {
      throw new Error("Worksheet terkunci. Gunakan Request Resubmit di tab Menu.");
    }

    const { data: wsRow, error: wsErr } = await supabase
      .from("worksheet_session")
      .upsert(
        {
          business_date: date,
          department,
          status: "DRAFT",
          submitted_at: null,
          submitted_by_staff_id: null,
          locked_at: null,
          locked_by_staff_id: null,
        },
        { onConflict: "business_date,department" }
      )
      .select("id, status")
      .single();

    if (wsErr || !wsRow) {
      throw new Error(wsErr?.message ?? "Gagal membuat worksheet session.");
    }

    setSessionId(wsRow.id);
    setWorksheetStatus(wsRow.status);
    return { sessionId: wsRow.id, status: wsRow.status };
  };

  const updateReceiveEntryQty = (ingredientId: string, value: string) => {
    if (locked) return;
    setReceiveEntryInputs((prev) => ({
      ...prev,
      [ingredientId]: value,
    }));
  };

  const updateClosingStock = (ingredientId: string, value: string) => {
    if (locked) return;
    setLines((prev) => ({
      ...prev,
      [ingredientId]: { ...(prev[ingredientId] ?? DEFAULT_LINE), closingStock: value },
    }));
  };

  const updateOutQty = (ingredientId: string, value: string) => {
    if (locked) return;
    setLines((prev) => ({
      ...prev,
      [ingredientId]: { ...(prev[ingredientId] ?? DEFAULT_LINE), outQty: value },
    }));
  };

  const updateOutNote = (ingredientId: string, value: string) => {
    if (locked) return;
    setLines((prev) => ({
      ...prev,
      [ingredientId]: { ...(prev[ingredientId] ?? DEFAULT_LINE), outNote: value },
    }));
  };

  const updateOutPhoto = (
    ingredientId: string,
    value: { url: string; publicId: string }
  ) => {
    if (locked) return;
    setLines((prev) => ({
      ...prev,
      [ingredientId]: {
        ...(prev[ingredientId] ?? DEFAULT_LINE),
        outPhotoUrl: value.url,
        outPhotoPublicId: value.publicId,
      },
    }));
  };

  const clearOutPhoto = (ingredientId: string) => {
    if (locked) return;
    setLines((prev) => ({
      ...prev,
      [ingredientId]: {
        ...(prev[ingredientId] ?? DEFAULT_LINE),
        outPhotoUrl: "",
        outPhotoPublicId: "",
      },
    }));
  };

  const syncReceiveAggregate = async (activeSessionId: string): Promise<Map<string, number>> => {
    const { data: entries, error: entryErr } = await supabase
      .from("worksheet_receive_entry")
      .select("ingredient_id, quantity")
      .eq("session_id", activeSessionId);

    if (entryErr) {
      throw new Error(`Gagal membaca detail receive: ${entryErr.message}`);
    }

    const totals = new Map<string, number>();
    for (const entry of entries ?? []) {
      const qty = Number(entry.quantity);
      if (qty <= 0) continue;
      totals.set(entry.ingredient_id, (totals.get(entry.ingredient_id) ?? 0) + qty);
    }

    const { error: clearErr } = await supabase
      .from("worksheet_in_line")
      .delete()
      .eq("session_id", activeSessionId);

    if (clearErr) {
      throw new Error(`Gagal menyinkronkan total receive: ${clearErr.message}`);
    }

    const aggregatePayload = Array.from(totals.entries()).map(([ingredientId, quantity]) => ({
      session_id: activeSessionId,
      ingredient_id: ingredientId,
      quantity,
      unit_price: 0,
      line_total: 0,
    }));

    if (aggregatePayload.length > 0) {
      const { error: aggregateErr } = await supabase
        .from("worksheet_in_line")
        .insert(aggregatePayload);

      if (aggregateErr) {
        throw new Error(`Gagal menyimpan total receive: ${aggregateErr.message}`);
      }
    }

    setLines((prev) => {
      const next = { ...prev };
      for (const ing of ingredients) {
        if (ing.kind !== "raw") continue;
        const total = totals.get(ing.id) ?? 0;
        next[ing.id] = {
          ...(next[ing.id] ?? DEFAULT_LINE),
          inQty: total > 0 ? String(total) : "",
        };
      }
      return next;
    });

    return totals;
  };

  const savePendingReceiveEntries = async (activeSessionId: string): Promise<Map<string, number>> => {
    if (!staff?.id) {
      throw new Error("Sesi staf tidak ditemukan. Silakan logout dan login ulang.");
    }

    const entryPayload = ingredients
      .filter((ing) => ing.kind === "raw")
      .map((ing) => ({
        session_id: activeSessionId,
        ingredient_id: ing.id,
        staff_id: staff.id,
        quantity: parseQty(receiveEntryInputs[ing.id] ?? ""),
      }))
      .filter((row) => row.quantity > 0);

    if (entryPayload.length > 0) {
      const { error: insertErr } = await supabase
        .from("worksheet_receive_entry")
        .insert(entryPayload);

      if (insertErr) {
        throw new Error(`Gagal menyimpan entry receive: ${insertErr.message}`);
      }
    }

    const totals = await syncReceiveAggregate(activeSessionId);
    setReceiveEntryInputs({});
    return totals;
  };

  const uploadOutStockPhoto = async (ingredientId: string, file: File | null) => {
    if (!file || locked) return;

    setUploadingPhotoFor(ingredientId);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("folder", `artha/outstock/${department}`);

      const response = await fetch("/api/cloudinary/upload", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        url?: string;
        publicId?: string;
        error?: string;
      };

      if (!response.ok || !result.url || !result.publicId) {
        throw new Error(result.error ?? "Upload foto gagal.");
      }

      updateOutPhoto(ingredientId, { url: result.url, publicId: result.publicId });
      showSuccessToast("Foto bukti out stock tersimpan.");
    } catch (err) {
      showPlainErrorToast(err instanceof Error ? err.message : "Upload foto gagal.");
    } finally {
      setUploadingPhotoFor(null);
    }
  };

  const updateSoldQty = (menuId: string, value: string) => {
    if (locked) return;
    setSoldItems((prev) => ({ ...prev, [menuId]: value }));
  };

  const updateMenuIssue = (menuId: string, patch: Partial<MenuIssueLineState>) => {
    if (locked) return;
    setMenuIssues((prev) => ({
      ...prev,
      [menuId]: {
        ...createDefaultMenuIssue(),
        ...(prev[menuId] ?? {}),
        ...patch,
      },
    }));
  };

  const uploadMenuIssuePhoto = async (menuId: string, file: File | null) => {
    if (!file || locked) return;

    setUploadingPhotoFor(`issue-${menuId}`);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("folder", `artha/menu-issue/${department}`);

      const response = await fetch("/api/cloudinary/upload", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        url?: string;
        publicId?: string;
        error?: string;
      };

      if (!response.ok || !result.url || !result.publicId) {
        throw new Error(result.error ?? "Upload foto gagal.");
      }

      updateMenuIssue(menuId, { photoUrl: result.url, photoPublicId: result.publicId });
      showSuccessToast("Foto bukti remake tersimpan.");
    } catch (err) {
      showPlainErrorToast(err instanceof Error ? err.message : "Upload foto gagal.");
    } finally {
      setUploadingPhotoFor(null);
    }
  };

  const clearMenuIssuePhoto = (menuId: string) => {
    updateMenuIssue(menuId, { photoUrl: "", photoPublicId: "" });
  };

  const updatePremixQty = (premixId: string, value: string) => {
    if (locked) return;
    setPremixQuantities((prev) => ({ ...prev, [premixId]: value }));
  };

  const adjustSoldQty = (menuId: string, delta: number) => {
    if (locked) return;
    setSoldItems((prev) => {
      const current = parseQty(prev[menuId] ?? "");
      const next = Math.max(0, current + delta);
      return { ...prev, [menuId]: next === 0 ? "" : String(next) };
    });
  };

  const adjustPremixQty = (premixId: string, delta: number) => {
    if (locked) return;
    setPremixQuantities((prev) => {
      const current = parseQty(prev[premixId] ?? "");
      const next = Math.max(0, current + delta);
      return { ...prev, [premixId]: next === 0 ? "" : String(next) };
    });
  };

  const handleSaveReceive = async () => {
    if (locked || isSavingReceive) return;

    const date = businessDate || resolveWorksheetBusinessDate();
    setIsSavingReceive(true);
    setError(null);

    try {
      const { sessionId: activeSessionId } = await ensureDraftSession(date);
      const hasPendingReceive = ingredients.some(
        (ing) => ing.kind === "raw" && parseQty(receiveEntryInputs[ing.id] ?? "") > 0
      );

      if (!hasPendingReceive) {
        showPlainErrorToast("Isi jumlah tambahan receive terlebih dahulu.");
        return;
      }

      await savePendingReceiveEntries(activeSessionId);
      showSuccessToast(
        "Receive ditambahkan. Total pasokan hari ini otomatis terakumulasi untuk semua staff."
      );
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSavingReceive(false);
    }
  };

  const handleSaveOutStock = async () => {
    if (locked || isSavingOutStock || outstockHasBlockingErrors) return;

    const date = businessDate || resolveWorksheetBusinessDate();
    setIsSavingOutStock(true);
    setError(null);

    try {
      const freshIngredients = await refreshIngredientStockFromDb();
      await assertOutstockPayloadValid(freshIngredients);

      const { sessionId: activeSessionId } = await ensureDraftSession(date);

      const outLinePayload = freshIngredients
        .map((ing) => {
          const line = lines[ing.id] ?? DEFAULT_LINE;
          return {
            session_id: activeSessionId,
            ingredient_id: ing.id,
            quantity: parseQty(line.outQty),
            note: line.outNote.trim(),
            photo_url: line.outPhotoUrl || null,
            photo_public_id: line.outPhotoPublicId || null,
          };
        })
        .filter((row) => row.quantity > 0);

      const { error: clearErr } = await supabase
        .from("worksheet_out_line")
        .delete()
        .eq("session_id", activeSessionId);

      if (clearErr) {
        throw new Error(`Gagal membersihkan draft out stock: ${clearErr.message}`);
      }

      const { error: outLineErr } =
        outLinePayload.length > 0
          ? await supabase.from("worksheet_out_line").insert(outLinePayload)
          : { error: null };

      if (outLineErr) {
        throw new Error(`Gagal menyimpan out stock: ${outLineErr.message}`);
      }

      showSuccessToast("Out stock tersimpan. Form tetap bisa diedit untuk koreksi typo.");
    } catch (err) {
      showTranslatedSubmitError(err);
      setActiveTab("outstock");
    } finally {
      setIsSavingOutStock(false);
    }
  };

  const handleSaveOpname = async () => {
    if (locked || isSavingOpname || !staff) return;

    const date = businessDate || resolveWorksheetBusinessDate();
    setIsSavingOpname(true);
    setError(null);

    try {
      const freshIngredients = await refreshIngredientStockFromDb();
      const { sessionId: activeSessionId } = await ensureDraftSession(date);

      const blankIngredientIds: string[] = [];
      const opnamePayload = freshIngredients.flatMap((ing) => {
        const raw = (lines[ing.id] ?? DEFAULT_LINE).closingStock;
        if (isBlankQty(raw)) {
          blankIngredientIds.push(ing.id);
          return [];
        }

        const closing_stock = parseQty(raw);
        if (closing_stock < 0) {
          throw new Error(`Stok fisik ${ing.name} tidak boleh negatif.`);
        }

        return [
          {
            session_id: activeSessionId,
            ingredient_id: ing.id,
            closing_stock,
          },
        ];
      });

      if (blankIngredientIds.length > 0) {
        const { error: clearBlankErr } = await supabase
          .from("worksheet_opname_line")
          .delete()
          .eq("session_id", activeSessionId)
          .in("ingredient_id", blankIngredientIds);

        if (clearBlankErr) {
          throw new Error(`Gagal membersihkan draft opname kosong: ${clearBlankErr.message}`);
        }
      }

      const { error: opnameErr } =
        opnamePayload.length > 0
          ? await supabase
              .from("worksheet_opname_line")
              .upsert(opnamePayload, { onConflict: "session_id,ingredient_id" })
          : { error: null };

      if (opnameErr) {
        throw new Error(`Gagal menyimpan draft opname: ${opnameErr.message}`);
      }

      showSuccessToast("Draft opname tersimpan. Ledger final dibuat saat Submit Report Closing.");
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSavingOpname(false);
    }
  };

  const handleSavePremix = async () => {
    if (locked || isSavingPremix || !staff) return;

    const date = businessDate || resolveWorksheetBusinessDate();
    setIsSavingPremix(true);
    setError(null);

    try {
      const { sessionId: activeSessionId } = await ensureDraftSession(date);
      const payload = premixItems
        .map((premix) => {
          const recipe = getActivePremixRecipe(premix);
          return {
            session_id: activeSessionId,
            output_ingredient_id: premix.id,
            recipe_id: recipe?.id ?? "",
            batch_quantity: parseQty(premixQuantities[premix.id] ?? ""),
          };
        })
        .filter((row) => row.batch_quantity > 0 && row.recipe_id);

      const { error: clearErr } = await supabase
        .from("worksheet_premix_line")
        .delete()
        .eq("session_id", activeSessionId);

      if (clearErr) {
        throw new Error(`Gagal membersihkan draft premix: ${clearErr.message}`);
      }

      const { error: premixErr } =
        payload.length > 0
          ? await supabase.from("worksheet_premix_line").insert(payload)
          : { error: null };

      if (premixErr) {
        throw new Error(`Gagal menyimpan draft premix: ${premixErr.message}`);
      }

      showSuccessToast("Produksi premix tersimpan. Stok final dihitung saat Submit Report Closing.");
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSavingPremix(false);
    }
  };

  const handleRequestResubmit = async () => {
    if (!sessionId || !showResubmitCta || isRequestingResubmit) return;

    const confirmed = window.confirm(
      "Buka kembali worksheet untuk koreksi typo? Anda perlu submit ulang setelah selesai memperbaiki."
    );
    if (!confirmed) return;

    setIsRequestingResubmit(true);
    setError(null);

    try {
      const { error: unlockErr } = await supabase
        .from("worksheet_session")
        .update({
          status: "DRAFT",
          submitted_at: null,
          submitted_by_staff_id: null,
        })
        .eq("id", sessionId);

      if (unlockErr) {
        throw new Error(unlockErr.message);
      }

      setWorksheetStatus("DRAFT");
      showSuccessToast("Worksheet dibuka kembali. Semua kamar bisa diedit.");
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsRequestingResubmit(false);
    }
  };

  const saveMenuProgress = async (
    activeSessionId: string,
    menuList: MenuItemWithRecipe[]
  ): Promise<void> => {
    if (!staff?.id) {
      throw new Error("Sesi staf tidak ditemukan. Silakan logout dan login ulang.");
    }

    const soldEntryPayload = menuList
      .map((menu) => ({
        session_id: activeSessionId,
        menu_item_id: menu.id,
        staff_id: staff.id,
        quantity_sold: parseQty(soldItems[menu.id] ?? ""),
      }))
      .filter((row) => row.quantity_sold > 0);

    const { error: clearOwnSoldErr } = await supabase
      .from("worksheet_sold_entry")
      .delete()
      .eq("session_id", activeSessionId)
      .eq("staff_id", staff.id);

    if (clearOwnSoldErr) {
      throw new Error(`Gagal membersihkan sales menu milik staff ini: ${clearOwnSoldErr.message}`);
    }

    const { error: soldEntryErr } =
      soldEntryPayload.length > 0
        ? await supabase.from("worksheet_sold_entry").insert(soldEntryPayload)
        : { error: null };

    if (soldEntryErr) {
      throw new Error(`Gagal menyimpan sales menu staff: ${soldEntryErr.message}`);
    }

    const { data: allSoldEntries, error: allSoldErr } = await supabase
      .from("worksheet_sold_entry")
      .select("menu_item_id, staff_id, quantity_sold, staff:staff_id ( name )")
      .eq("session_id", activeSessionId);

    if (allSoldErr) {
      throw new Error(`Gagal memuat akumulasi sales menu: ${allSoldErr.message}`);
    }

    const aggregateByMenu = new Map<string, number>();
    const nextSummaries: Record<string, SoldEntrySummary[]> = {};

    for (const row of (allSoldEntries ?? []) as unknown as SoldEntryJoined[]) {
      const quantity = Number(row.quantity_sold ?? 0);
      if (quantity <= 0) continue;
      aggregateByMenu.set(row.menu_item_id, (aggregateByMenu.get(row.menu_item_id) ?? 0) + quantity);

      const staffRaw = row.staff;
      const rowStaff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
      nextSummaries[row.menu_item_id] = [
        ...(nextSummaries[row.menu_item_id] ?? []),
        {
          staffId: row.staff_id,
          staffName: rowStaff?.name ?? "Staff lama / tidak tercatat",
          quantity,
        },
      ];
    }

    const aggregatePayload = Array.from(aggregateByMenu.entries()).map(
      ([menuItemId, quantitySold]) => ({
        session_id: activeSessionId,
        menu_item_id: menuItemId,
        quantity_sold: quantitySold,
      })
    );

    const { error: clearSoldErr } = await supabase
      .from("worksheet_sold_line")
      .delete()
      .eq("session_id", activeSessionId);

    if (clearSoldErr) {
      throw new Error(`Gagal membersihkan worksheet_sold_line: ${clearSoldErr.message}`);
    }

    const { error: soldErr } =
      aggregatePayload.length > 0
        ? await supabase.from("worksheet_sold_line").insert(aggregatePayload)
        : { error: null };

    if (soldErr) {
      throw new Error(`Gagal menyimpan total worksheet_sold_line: ${soldErr.message}`);
    }

    setSoldEntrySummaries(nextSummaries);

    const issuePayload = menuList
      .map((menu) => {
        const issue = menuIssues[menu.id] ?? createDefaultMenuIssue();
        return {
          session_id: activeSessionId,
          menu_item_id: menu.id,
          quantity: parseQty(issue.quantity),
          reason: issue.reason,
          note: issue.note.trim(),
          photo_url: issue.photoUrl || null,
          photo_public_id: issue.photoPublicId || null,
        };
      })
      .filter((row) => row.quantity > 0);

    const { error: clearIssueErr } = await supabase
      .from("worksheet_menu_issue_line")
      .delete()
      .eq("session_id", activeSessionId);

    if (clearIssueErr) {
      throw new Error(`Gagal membersihkan worksheet_menu_issue_line: ${clearIssueErr.message}`);
    }

    const { error: issueErr } =
      issuePayload.length > 0
        ? await supabase.from("worksheet_menu_issue_line").insert(issuePayload)
        : { error: null };

    if (issueErr) {
      throw new Error(`Gagal menyimpan worksheet_menu_issue_line: ${issueErr.message}`);
    }
  };

  const handleSaveMenuProgress = async () => {
    if (locked || isSavingMenuProgress) return;

    setIsSavingMenuProgress(true);
    setError(null);

    try {
      const date = businessDate || resolveWorksheetBusinessDate();
      const { sessionId: ensuredSessionId } = await ensureDraftSession(date);
      await saveMenuProgress(ensuredSessionId, menus);
      showSuccessToast("Sales menu tersimpan sebagai draft. Shift berikutnya bisa lanjut dari angka ini.");
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSavingMenuProgress(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      showPlainErrorToast("Laporan sedang dikirim, tunggu sebentar ya.");
      return;
    }

    if (!closingSubmitOpen) {
      showPlainErrorToast("Submit Closing aktif otomatis setelah jam 00:00 WIB. Untuk sekarang gunakan Simpan Sales Menu / Simpan Progress dulu.");
      return;
    }

    const blocker = getClosingSubmitBlocker(ingredients, lines, { locked });
    if (blocker) {
      showPlainErrorToast(blocker.message);
      focusWorksheetField(blocker.tab, blocker.ingredientId);
      return;
    }

    if (!staff?.id) {
      showPlainErrorToast("Sesi staf tidak ditemukan. Silakan logout dan login ulang.");
      return;
    }

    const submittingStaffId = staff.id;

    try {
      const freshIngredients = await refreshIngredientStockFromDb();
      await assertOutstockPayloadValid(freshIngredients);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Validasi out stock gagal.";
      showPlainErrorToast(message);
      const retryBlocker = getClosingSubmitBlocker(ingredients, lines, { locked });
      focusWorksheetField(retryBlocker?.tab ?? "outstock", retryBlocker?.ingredientId);
      return;
    }

    let menuListForCalc: MenuItemWithRecipe[];
    try {
      menuListForCalc = await fetchMenusWithActiveRecipes(supabase, department);
    } catch (err) {
      showTranslatedSubmitError(err);
      return;
    }

    const confirmed = window.confirm(
      "Kunci laporan closing hari ini? Setelah submit, worksheet terkunci sampai Request Resubmit."
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    setError(null);

    const date = businessDate || resolveWorksheetBusinessDate();
    const submittedAt = new Date().toISOString();
    let activeSessionId: string | null = null;
    let opnameEvalForAsync: ReturnType<typeof evaluateOpnameSubmission> | null = null;

    try {
      const freshIngredients = await refreshIngredientStockFromDb();
      await assertOutstockPayloadValid(freshIngredients);

      const { sessionId: ensuredSessionId } = await ensureDraftSession(date);
      activeSessionId = ensuredSessionId;

      const receiveTotals = await savePendingReceiveEntries(ensuredSessionId);

      const outLinePayload = freshIngredients
        .map((ing) => {
          const line = lines[ing.id] ?? DEFAULT_LINE;
          return {
            session_id: ensuredSessionId,
            ingredient_id: ing.id,
            quantity: parseQty(line.outQty),
            note: line.outNote.trim(),
            photo_url: line.outPhotoUrl || null,
            photo_public_id: line.outPhotoPublicId || null,
          };
        })
        .filter((row) => row.quantity > 0);

      const { error: clearOutErr } = await supabase
        .from("worksheet_out_line")
        .delete()
        .eq("session_id", ensuredSessionId);

      if (clearOutErr) {
        throw new Error(`Gagal membersihkan worksheet_out_line: ${clearOutErr.message}`);
      }

      const { error: outLineErr } =
        outLinePayload.length > 0
          ? await supabase.from("worksheet_out_line").insert(outLinePayload)
          : { error: null };

      if (outLineErr) {
        throw new Error(`Gagal menyimpan worksheet_out_line: ${outLineErr.message}`);
      }

      await saveMenuProgress(ensuredSessionId, menuListForCalc);

      const premixPayload = premixItems
        .map((premix) => {
          const recipe = getActivePremixRecipe(premix);
          return {
            session_id: ensuredSessionId,
            output_ingredient_id: premix.id,
            recipe_id: recipe?.id ?? "",
            batch_quantity: parseQty(premixQuantities[premix.id] ?? ""),
          };
        })
        .filter((row) => row.batch_quantity > 0 && row.recipe_id);

      const { error: clearPremixErr } = await supabase
        .from("worksheet_premix_line")
        .delete()
        .eq("session_id", ensuredSessionId);

      if (clearPremixErr) {
        throw new Error(`Gagal membersihkan worksheet_premix_line: ${clearPremixErr.message}`);
      }

      const { error: premixErr } =
        premixPayload.length > 0
          ? await supabase.from("worksheet_premix_line").insert(premixPayload)
          : { error: null };

      if (premixErr) {
        throw new Error(`Gagal menyimpan worksheet_premix_line: ${premixErr.message}`);
      }

      const menuTheoreticalMap = await fetchSoldMenuTheoreticalUsage(
        supabase,
        date,
        ensuredSessionId
      );
      const issueTheoreticalMap = await fetchMenuIssueTheoreticalUsage(
        supabase,
        date,
        ensuredSessionId
      );
      const premixUsageMap = premixEffects.usageMap;
      const premixOutputMap = premixEffects.outputMap;
      const freshById = new Map(freshIngredients.map((ing) => [ing.id, ing]));
      const theoreticalIngredientIds = new Set([
        ...menuTheoreticalMap.keys(),
        ...issueTheoreticalMap.keys(),
      ]);
      const externalIngredientIds = [...theoreticalIngredientIds].filter((ingredientId) => !freshById.has(ingredientId));
      const externalIngredients = (
        await fetchIngredientsByIds(supabase, externalIngredientIds)
      ).filter((ing) => ing.is_active && ing.is_stock_tracked);
      const ledgerIngredients = [...freshIngredients, ...externalIngredients];
      const ledgerIngredientById = new Map(
        ledgerIngredients.map((ingredient) => [ingredient.id, ingredient])
      );
      const previousClosingMap = await fetchLedgerClosingMap(
        supabase,
        ledgerIngredients.map((ing) => ing.id),
        date,
        "before"
      );
      const existingLedgerMap = await fetchLedgerSnapshotForDate(
        supabase,
        externalIngredients.map((ing) => ing.id),
        date
      );

      const localLedgerPayload: StockLedgerInsert[] = freshIngredients.map((ing) => {
        const line = lines[ing.id] ?? DEFAULT_LINE;
        const masterStock = Number(ing.current_stock);
        const opening_stock = Math.max(
          0,
          Number.isFinite(masterStock) ? masterStock : previousClosingMap.get(ing.id) ?? 0
        );
        const receive_qty = receiveInputToStockQty(
          ing,
          String(receiveTotals.get(ing.id) ?? 0)
        );
        const premix_output_qty = premixOutputMap.get(ing.id) ?? 0;
        const in_qty = receive_qty + premix_output_qty;
        const out_qty = parseQty(line.outQty);
        const menu_theoretical = menuTheoreticalMap.get(ing.id) ?? 0;
        const issue_theoretical = issueTheoreticalMap.get(ing.id) ?? 0;
        const premix_theoretical = premixUsageMap.get(ing.id) ?? 0;
        const theoretical_usage = menu_theoretical + issue_theoretical + premix_theoretical;
        const expected_closing = opening_stock + in_qty - theoretical_usage;
        const hasPhysicalOpname = !isBlankQty(line.closingStock);

        const closing_stock = hasPhysicalOpname
          ? parseQty(line.closingStock)
          : Math.max(0, expected_closing - out_qty);
        const adjustment_qty = closing_stock - expected_closing;

        if (closing_stock < 0) {
          throw new Error(`Stok fisik ${ing.name} tidak boleh negatif.`);
        }

        if (out_qty > 0 && adjustment_qty > -out_qty) {
          throw new Error(
            `Out Stock ${ing.name} tidak selaras dengan opname. Jika ada ${out_qty} keluar/rusak, stok fisik harus mencerminkan pengurangan itu.`
          );
        }

        return {
          business_date: date,
          ingredient_id: ing.id,
          opening_stock,
          in_qty,
          theoretical_usage,
          adjustment_qty,
          closing_stock,
        };
      });

      const externalLedgerPayload: StockLedgerInsert[] = externalIngredients.map((ing) => {
        const existing = existingLedgerMap.get(ing.id);
        const masterStock = Number(ing.current_stock);
        const opening_stock = existing
          ? existing.opening_stock
          : Math.max(
              0,
              Number.isFinite(masterStock) ? masterStock : previousClosingMap.get(ing.id) ?? 0
            );
        const in_qty = existing?.in_qty ?? 0;
        const menu_theoretical = menuTheoreticalMap.get(ing.id) ?? 0;
        const issue_theoretical = issueTheoreticalMap.get(ing.id) ?? 0;
        const current_menu_issue_theoretical = menu_theoretical + issue_theoretical;
        const existing_other_theoretical = existing
          ? Math.max(0, Number(existing.theoretical_usage) - current_menu_issue_theoretical)
          : 0;
        const theoretical_usage = current_menu_issue_theoretical + existing_other_theoretical;
        const expected_closing = opening_stock + in_qty - theoretical_usage;
        const closing_stock = existing
          ? existing.closing_stock
          : Math.max(0, expected_closing);
        const adjustment_qty = closing_stock - expected_closing;

        return {
          business_date: date,
          ingredient_id: ing.id,
          opening_stock,
          in_qty,
          theoretical_usage,
          adjustment_qty,
          closing_stock,
        };
      });

      const ledgerPayload = [...localLedgerPayload, ...externalLedgerPayload];

      const { error: ledgerErr } = await supabase
        .from("stock_ledger")
        .upsert(ledgerPayload, { onConflict: "business_date,ingredient_id" });

      if (ledgerErr) {
        throw new Error(`Gagal upsert stock_ledger: ${ledgerErr.message}`);
      }

      const latestClosingMap = await fetchLatestLedgerClosingMap(
        supabase,
        ledgerPayload.map((row) => row.ingredient_id)
      );

      const stockUpdateResults = await Promise.all(
        ledgerPayload.map((row) => {
          const latestClosing = latestClosingMap.get(row.ingredient_id) ?? row.closing_stock;
          return supabase
            .from("ingredient")
            .update({ current_stock: latestClosing })
            .eq("id", row.ingredient_id);
        })
      );
      const stockUpdateErr = stockUpdateResults.find((result) => result.error)?.error;
      if (stockUpdateErr) {
        throw new Error(`Ledger tersimpan tetapi cache stok gagal diperbarui: ${stockUpdateErr.message}`);
      }

      const logPayload = ledgerPayload.map((row) => {
        const ing = ledgerIngredientById.get(row.ingredient_id);
        const before = Number(ing?.current_stock ?? 0);
        return {
          ingredient_id: row.ingredient_id,
          business_date: date,
          event_type: "CLOSING" as const,
          qty_before: before,
          qty_after: row.closing_stock,
          reason: row.adjustment_qty === 0 ? null : "closing adjustment from physical opname",
          message: `Closing ${ing?.name ?? row.ingredient_id}: ${before} -> ${row.closing_stock}`,
          worksheet_session_id: ensuredSessionId,
          created_by_staff_id: submittingStaffId,
        };
      });

      const { error: logErr } = await supabase.from("stock_log").insert(logPayload);
      if (logErr) {
        throw new Error(`Ledger tersimpan tetapi audit log gagal dibuat: ${logErr.message}`);
      }

      opnameEvalForAsync = evaluateOpnameSubmission({
        ingredients: freshIngredients,
        lines,
        ledgerRows: localLedgerPayload.map((row) => ({
          ingredient_id: row.ingredient_id,
          opening_stock: row.opening_stock,
          in_qty: row.in_qty,
          theoretical_usage: row.theoretical_usage,
          adjustment_qty: row.adjustment_qty,
          closing_stock: row.closing_stock,
        })),
      });

      const finalStatus: ClosingStatus = opnameEvalForAsync.hasPendingApproval
        ? "PENDING_APPROVAL_ADMIN"
        : "SUBMITTED";

      await finalizeWorksheetSession({
        supabase,
        sessionId: ensuredSessionId,
        staffId: submittingStaffId,
        submittedAt,
        status: finalStatus,
      });

      setWorksheetStatus(finalStatus);

      const { error: dayErr } = await supabase
        .from("business_day")
        .update({ status: "SUBMITTED" })
        .eq("business_date", date);

      if (dayErr) throw new Error(dayErr.message);

      clearDraftAfterSuccess();
      showSuccessToast("Laporan Closing Berhasil Dikirim!");
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSubmitting(false);
    }

    if (activeSessionId && opnameEvalForAsync?.hasPendingApproval) {
      enqueueOpnamePendingRecords({
        supabase,
        sessionId: activeSessionId,
        businessDate: date,
        staffId: submittingStaffId,
        evaluation: opnameEvalForAsync,
      });
    }
  };

  if (!staff) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
      </main>
    );
  }

  const showBlockingOverlay =
    isSubmitting ||
    isSavingReceive ||
    isSavingOutStock ||
    isSavingOpname ||
    isSavingPremix ||
    isSavingMenuProgress ||
    isRequestingResubmit;

  const overlayMessage = isSubmitting
    ? "Mengirim laporan closing…"
    : isRequestingResubmit
      ? "Membuka kembali worksheet…"
      : isSavingReceive
        ? "Menyimpan pasokan…"
          : isSavingOutStock
            ? "Menyimpan out stock…"
            : isSavingPremix
              ? "Menyimpan premix…"
              : isSavingMenuProgress
                ? "Menyimpan sales menu…"
                : "Menyimpan opname…";

  const stickySaveReceive = () =>
    runWithTypoGuard(["inQty"], () => void handleSaveReceive());
  const stickySaveOutStock = () =>
    runWithTypoGuard(["outQty"], () => void handleSaveOutStock());
  const stickySaveOpname = () =>
    runWithTypoGuard(["closingStock"], () => void handleSaveOpname());
  const stickySavePremix = () => void handleSavePremix();
  const stickySaveMenuProgress = () => void handleSaveMenuProgress();
  const stickySubmit = () =>
    runWithTypoGuard(["inQty", "closingStock", "outQty"], () => void handleSubmit());

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-zinc-950 pb-48">
      <Toast
        message={toast?.message ?? null}
        title={toast?.title}
        description={toast?.description}
        variant={toast?.variant ?? "success"}
        onDismiss={() => setToast(null)}
      />

      <TypoConfirmModal
        open={typoModalOpen}
        warnings={typoWarnings}
        onCancel={() => {
          setTypoModalOpen(false);
          pendingTypoActionRef.current = null;
        }}
        onConfirm={() => {
          setTypoModalOpen(false);
          const action = pendingTypoActionRef.current;
          pendingTypoActionRef.current = null;
          if (action) action();
        }}
      />

      {showBlockingOverlay ? (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-zinc-950/85 backdrop-blur-sm"
        >
          <Loader2 className="h-10 w-10 animate-spin text-indigo-400" />
          <p className="text-sm font-medium text-zinc-200">{overlayMessage}</p>
          <p className="text-xs text-zinc-500">Jangan tutup aplikasi</p>
        </div>
      ) : null}

      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 px-4 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              {title}
            </p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500">
              Penanggung jawab (otomatis dari login)
            </p>
            <h1 className="text-lg font-bold text-zinc-50">{staff.name}</h1>
            {businessDateLabel ? (
              <p className="mt-1 text-sm text-zinc-300">
                Hari Bisnis: <span className="font-medium text-zinc-50">{businessDateLabel}</span>
              </p>
            ) : null}
            {sessionId ? (
              <p className="mt-0.5 text-[10px] text-zinc-500">Session: {sessionId.slice(0, 8)}…</p>
            ) : null}
            {worksheetStatus ? (
              <p className="mt-1 inline-flex items-center gap-1 rounded-md bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                {locked ? <Lock className="h-3 w-3 text-sky-400" /> : null}
                Status: {worksheetStatus}
              </p>
            ) : null}
          </div>
          <LogoutButton className="shrink-0 min-h-10 rounded-lg border border-zinc-700 px-3 text-sm font-medium text-zinc-300 hover:border-zinc-600" />
        </div>
      </header>

      <nav
        className="sticky top-[100px] z-10 border-b border-zinc-800 bg-zinc-950/95 px-2 py-2 backdrop-blur"
        aria-label="Worksheet tabs"
      >
        <ul className="grid grid-cols-4 gap-1">
          {TAB_CONFIG.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center transition active:scale-[0.98] ${
                    active
                      ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/50"
                      : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800"
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? "text-amber-200" : ""}`} />
                  <span className="text-[10px] font-bold uppercase leading-tight tracking-wide">
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {showTestDateControls ? (
        <section className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-amber-300">
            <CalendarDays className="h-4 w-4" />
            Mode Test Business Date
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="date"
              value={testBusinessDate}
              onChange={(e) => setTestBusinessDate(e.target.value)}
              className="min-h-11 flex-1 rounded-lg border border-amber-500/30 bg-zinc-950 px-3 text-sm text-zinc-100"
              aria-label="Tanggal business date untuk testing"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void applyTestBusinessDate()}
                className="min-h-11 rounded-lg bg-amber-500 px-3 text-sm font-bold text-zinc-950"
              >
                Pakai
              </button>
              <button
                type="button"
                onClick={() => void clearTestBusinessDate()}
                className="min-h-11 rounded-lg border border-zinc-700 px-3 text-sm font-semibold text-zinc-300"
              >
                Live
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-amber-100/70">
            Untuk simulasi: submit tanggal ini, lalu pilih tanggal besoknya untuk test carry-over.
            Kalau mau edit tanggal yang sudah submit, gunakan Request Resubmit.
          </p>
        </section>
      ) : null}

      {!isLoading && (ingredients.length > 0 || menus.length > 0 || premixItems.length > 0) ? (
        <div className="px-4 pt-3">
          <div className="relative mb-4 w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === "sold"
                  ? "Cari menu terjual…"
                  : activeTab === "issue"
                    ? "Cari menu remake…"
                  : activeTab === "premix"
                    ? "Cari premix…"
                    : "Cari bahan baku…"
              }
              autoCorrect="off"
              spellCheck={false}
              className={SEARCH_INPUT_CLASS}
              aria-label="Pencarian cepat worksheet"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-200"
                aria-label="Hapus pencarian"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="px-4 pt-4">
        {staff.role === "admin" || staff.role === "op_manager" ? (
          <p className="mb-3 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
            Mode Admin/Ops — melihat worksheet {department}.
          </p>
        ) : null}

        {pendingAdminApproval ? (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
            <p className="text-sm font-semibold text-emerald-100">Laporan Closing Berhasil Dikirim!</p>
            <p className="mt-1 text-xs text-emerald-200/90">
              Sesi Anda sudah selesai. Tim Admin akan meninjau data di dashboard Monitoring jika diperlukan.
            </p>
          </div>
        ) : null}

        {locked ? (
          <div className="mb-4 rounded-xl border border-sky-500/40 bg-sky-500/10 p-4">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-sky-100">
                  Worksheet hari ini sudah terkunci
                </p>
                <p className="mt-1 text-xs text-sky-200/90">
                  Status: <span className="font-medium">{worksheetStatus}</span>. Input dinonaktifkan
                  hingga worksheet dibuka kembali.
                </p>
                {showResubmitCta && canEdit ? (
                  <button
                    type="button"
                    disabled={isRequestingResubmit || isSubmitting}
                    onClick={() => void handleRequestResubmit()}
                    className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-500/20 px-4 text-sm font-bold text-amber-100 active:bg-amber-500/30 disabled:opacity-50"
                  >
                    {isRequestingResubmit ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Unlock className="h-4 w-4" />
                    )}
                    🔓 Request Resubmit / Koreksi Typo
                  </button>
                ) : (
                  <p className="mt-2 text-xs text-sky-300/80">
                    Hubungi Admin untuk koreksi status {worksheetStatus}.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            Memuat data dari Supabase…
          </div>
                ) : ingredients.length === 0 && activeTab !== "premix" && activeTab !== "issue" && activeTab !== "sold" ? (
          <p className="py-12 text-center text-zinc-400">
            Belum ada bahan aktif untuk departemen ini. Tambahkan di Master Data Admin.
          </p>
        ) : (
          <>
            {activeTab === "receive" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-amber-400">
                  Kamar 1 — Receive
                </h2>
                <p className="mb-4 text-xs text-zinc-500">
                  Tambahkan barang yang baru datang. Total receive hari ini otomatis dijumlahkan dan bisa dilihat staff lain.
                </p>
                <ul className="space-y-3">
                  {filteredReceiveIngredients.length === 0 ? (
                    <li className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-400">
                      Tidak ada bahan raw cocok dengan &ldquo;{searchTerm}&rdquo;.
                    </li>
                  ) : null}
                  {filteredReceiveIngredients.map((ing) => {
                    const line = lines[ing.id] ?? DEFAULT_LINE;
                    const purchaseUnit = getPurchaseUnit(ing);
                    const factor = getPurchaseToStockFactor(ing);
                    const totalReceiveQty = parseQty(line.inQty);
                    const entryQty = parseQty(receiveEntryInputs[ing.id] ?? "");
                    const entryStockQty = receiveInputToStockQty(
                      ing,
                      receiveEntryInputs[ing.id] ?? ""
                    );
                    return (
                      <li
                        key={ing.id}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-sm"
                      >
                        <div className="mb-3">
                          <p className="font-semibold text-zinc-50">{ing.name}</p>
                          <p className="text-xs text-zinc-500">
                            Total hari ini:{" "}
                            <span className="font-semibold text-amber-200">
                              {formatQty(totalReceiveQty)} {purchaseUnit}
                            </span>
                            {purchaseUnit !== ing.unit
                              ? ` · Receive: 1 ${purchaseUnit} = ${factor} ${ing.unit}`
                              : ""}
                          </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                          <label className="block">
                            <span className="mb-1 block text-xs text-zinc-400">
                              Tambah receive ({purchaseUnit})
                            </span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              disabled={locked}
                              value={receiveEntryInputs[ing.id] ?? ""}
                              onChange={(e) => updateReceiveEntryQty(ing.id, e.target.value)}
                              placeholder="Kosong"
                              className={INPUT_CLASS}
                            />
                          </label>
                          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-right">
                            <p className="text-[10px] uppercase tracking-wide text-zinc-500">
                              Setelah save
                            </p>
                            <p className="text-sm font-semibold tabular-nums text-zinc-100">
                              {formatQty(totalReceiveQty + entryQty)} {purchaseUnit}
                            </p>
                          </div>
                        </div>
                        {purchaseUnit !== ing.unit && entryQty > 0 ? (
                          <p className="mt-2 text-xs text-emerald-300">
                            Tambahan masuk ledger: {formatQty(entryStockQty)} {ing.unit}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {activeTab === "outstock" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-amber-400">
                  Kamar 2 — Out Stock
                </h2>
                <p className="mb-4 text-xs text-zinc-500">
                  Barang keluar/rusak/basi mengurangi stok. Keterangan dan foto bukti opsional,
                  tapi foto akan ikut masuk export XLSX inventory sebagai bukti.
                </p>
                <ul className="space-y-3">
                  {filteredIngredients.length === 0 ? (
                    <li className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-400">
                      Tidak ada bahan cocok dengan &ldquo;{searchTerm}&rdquo;.
                    </li>
                  ) : null}
                  {filteredIngredients.map((ing) => {
                    const line = lines[ing.id] ?? DEFAULT_LINE;
                    const validation = validateOutstockLine(ing, line);
                    const showOutFields = validation.outQty > 0;
                    const qtyInputInvalid = validation.exceedsStock;
                    const isUploadingPhoto = uploadingPhotoFor === ing.id;

                    return (
                      <li
                        id={`worksheet-outstock-${ing.id}`}
                        key={ing.id}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-sm"
                      >
                        <div className="mb-3">
                          <p className="font-semibold text-zinc-50">{ing.name}</p>
                          <p className="text-xs text-zinc-500">Satuan: {ing.unit}</p>
                        </div>
                        <label className="mb-3 block">
                          <span className="mb-1 block text-xs text-zinc-400">
                            Qty keluar (out_qty)
                          </span>
                          <p className="mb-2 text-xs font-medium text-sky-300/90">
                            {formatStockAvailability(ing)}
                          </p>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            disabled={locked}
                            value={line.outQty}
                            onChange={(e) => updateOutQty(ing.id, e.target.value)}
                            placeholder="Kosong"
                            aria-invalid={qtyInputInvalid}
                            className={`${INPUT_CLASS} ${
                              qtyInputInvalid
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500/40"
                                : ""
                            }`}
                          />
                          {qtyInputInvalid ? (
                            <p className="mt-2 text-xs text-red-300" role="alert">
                              {OUTSTOCK_LOGICAL_FALLACY_MESSAGE}
                            </p>
                          ) : null}
                        </label>
                        {showOutFields ? (
                          <label className="block">
                            <span className="mb-1 block text-xs text-zinc-400">
                              Keterangan / Alasan Outstock (opsional)
                            </span>
                            <textarea
                              rows={3}
                              disabled={locked || isUploadingPhoto}
                              value={line.outNote}
                              onChange={(e) => updateOutNote(ing.id, e.target.value)}
                              placeholder="Contoh: Tumpah, Salah buat/re-make, Expired"
                              autoCorrect="off"
                              spellCheck={false}
                              className="min-h-24 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/40"
                            />
                            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/70 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="flex items-center gap-1 text-xs font-medium text-zinc-300">
                                    <Camera className="h-3.5 w-3.5" />
                                    Foto bukti (opsional)
                                  </p>
                                  <p className="mt-0.5 text-[11px] text-zinc-500">
                                    JPG/PNG dari kamera atau galeri.
                                  </p>
                                </div>
                                <label className="shrink-0">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    disabled={locked || isUploadingPhoto}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] ?? null;
                                      e.currentTarget.value = "";
                                      void uploadOutStockPhoto(ing.id, file);
                                    }}
                                    className="sr-only"
                                  />
                                  <span className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-indigo-500/50 bg-indigo-600/15 px-3 text-xs font-semibold text-indigo-100">
                                    {isUploadingPhoto ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <ImageIcon className="h-4 w-4" />
                                    )}
                                    {line.outPhotoUrl ? "Ganti" : "Upload"}
                                  </span>
                                </label>
                              </div>
                              {line.outPhotoUrl ? (
                                <div className="mt-3 flex items-center gap-3">
                                  <img
                                    src={line.outPhotoUrl}
                                    alt={`Bukti out stock ${ing.name}`}
                                    className="h-16 w-16 rounded-lg object-cover ring-1 ring-zinc-700"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <a
                                      href={line.outPhotoUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block truncate text-xs font-medium text-sky-300 hover:text-sky-200"
                                    >
                                      Lihat foto bukti
                                    </a>
                                    <button
                                      type="button"
                                      disabled={locked || isUploadingPhoto}
                                      onClick={() => clearOutPhoto(ing.id)}
                                      className="mt-1 text-xs text-red-300 hover:text-red-200 disabled:opacity-50"
                                    >
                                      Hapus dari draft
                                    </button>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </label>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {activeTab === "opname" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-indigo-400">
                  Kamar 3 — Stock Opname
                </h2>
                <p className="mb-4 text-xs text-zinc-500">
                  Catat sisa fisik di rak. Setelah Submit Report Closing di tab Menu, data dikirim apa adanya —
                  tidak perlu menunggu atau menyelesaikan selisih di sini.
                </p>
                <ul className="space-y-3">
                  {filteredIngredients.length === 0 ? (
                    <li className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-400">
                      Tidak ada bahan cocok dengan &ldquo;{searchTerm}&rdquo;.
                    </li>
                  ) : null}
                  {filteredIngredients.map((ing) => {
                    const line = lines[ing.id] ?? DEFAULT_LINE;
                    return (
                      <li
                        key={ing.id}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-sm"
                      >
                        <div className="mb-3">
                          <p className="font-semibold text-zinc-50">{ing.name}</p>
                          <p className="text-xs text-zinc-500">Satuan: {ing.unit}</p>
                        </div>
                        <label className="block">
                          <span className="mb-1 block text-xs text-zinc-400">
                            Sisa fisik (closing_stock)
                          </span>
                          <p className="mb-2 text-xs font-medium text-sky-300/90">
                            {formatSystemStockGuide(ing)}
                          </p>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            disabled={locked}
                            value={line.closingStock}
                            onChange={(e) => updateClosingStock(ing.id, e.target.value)}
                            placeholder="Kosong = ikut stok sistem"
                            className={INPUT_CLASS}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {activeTab === "premix" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-emerald-400">
                  Kamar 4 — Produksi Premix
                </h2>
                <p className="mb-4 text-xs text-zinc-500">
                  Input premix yang dibuat hari ini. Kebutuhan bahan dihitung dari resep dan
                  stok tersedia = stok sistem + receive hari ini.
                </p>
                {premixItems.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-400">
                    Belum ada premix aktif untuk departemen ini.
                  </p>
                ) : filteredPremixItems.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-400">
                    Tidak ada premix cocok dengan &ldquo;{searchTerm}&rdquo;.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {filteredPremixItems.map((premix) => {
                      const recipe = getActivePremixRecipe(premix);
                      const qtyValue = premixQuantities[premix.id] ?? "";
                      const qty = parseQty(qtyValue);
                      const yieldQty = Number(recipe?.yield_quantity ?? 1);
                      const outputQty = qty * yieldQty;

                      return (
                        <li
                          key={premix.id}
                          className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-sm"
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-zinc-50">{premix.name}</p>
                              <p className="text-xs text-zinc-500">
                                1 batch = {yieldQty.toLocaleString("id-ID")} {premix.unit} · Stok sistem {Number(premix.current_stock).toLocaleString("id-ID")}
                              </p>
                            </div>
                            <Beaker className="h-5 w-5 shrink-0 text-emerald-400" />
                          </div>

                          <label className="block">
                            <span className="mb-1 block text-xs text-zinc-400">
                              Jumlah dibuat hari ini
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => adjustPremixQty(premix.id, -1)}
                                className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-200 active:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Minus className="h-5 w-5" />
                              </button>
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="any"
                                disabled={locked || !recipe}
                                value={qtyValue}
                                onChange={(e) => updatePremixQty(premix.id, e.target.value)}
                                placeholder="Kosong"
                                className={`${INPUT_CLASS} text-center`}
                              />
                              <button
                                type="button"
                                disabled={locked || !recipe}
                                onClick={() => adjustPremixQty(premix.id, 1)}
                                className="flex h-12 w-12 items-center justify-center rounded-lg border border-emerald-500/50 bg-emerald-600/20 text-emerald-100 active:bg-emerald-600/35 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Plus className="h-5 w-5" />
                              </button>
                            </div>
                          </label>
                          {qty > 0 && recipe ? (
                            <p className="mt-2 text-xs font-medium text-emerald-300">
                              Output masuk stok: {outputQty.toLocaleString("id-ID")} {premix.unit}
                            </p>
                          ) : null}

                          {!recipe ? (
                            <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                              Resep premix belum disusun di Admin.
                            </p>
                          ) : recipe.recipe_component.length > 0 ? (
                            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                Kebutuhan bahan
                              </p>
                              <ul className="space-y-1.5 text-xs">
                                {recipe.recipe_component.map((component) => {
                                  const componentIng = component.ingredient;
                                  const required = Number(component.qty_per_batch) * qty;
                                  const receive = componentIng
                                    ? receiveInputToStockQty(componentIng, lines[componentIng.id]?.inQty ?? "")
                                    : 0;
                                  const available = componentIng
                                    ? Number(componentIng.current_stock ?? 0) + receive
                                    : 0;
                                  const unlimited = componentIng?.is_stock_tracked === false;
                                  const enough = unlimited || required <= available;
                                  return (
                                    <li
                                      key={component.ingredient_id}
                                      className="flex justify-between gap-3 text-zinc-300"
                                    >
                                      <span>{componentIng?.name ?? component.ingredient_id}</span>
                                      <span className={enough ? "text-zinc-400" : "text-red-300"}>
                                        {required.toLocaleString("id-ID")} {componentIng?.unit ?? ""}{" "}
                                        {unlimited
                                          ? "(non-stok)"
                                          : `/ tersedia ${available.toLocaleString("id-ID")}`}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}

            {activeTab === "issue" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-red-400">
                  Kamar 5 — Remake / Complaint
                </h2>
                <p className="mb-4 text-xs text-zinc-500">
                  Catat menu yang harus diganti baru karena kualitas tidak layak. Sistem otomatis
                  mengurangi bahan berdasarkan resep aktif.
                </p>
                {filteredIssueMenus.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-400">
                    Tidak ada menu cocok dengan &ldquo;{searchTerm}&rdquo;.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {filteredIssueMenus.map((menu) => {
                      const issue = menuIssues[menu.id] ?? createDefaultMenuIssue();
                      const hasRecipe = getActiveRecipeLines(menu).length > 0;
                      return (
                        <li
                          key={menu.id}
                          className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4"
                        >
                          <div className="mb-3">
                            <p className="font-semibold text-zinc-50">{menu.menu_name}</p>
                            <p className="text-xs text-zinc-500">
                              {hasRecipe
                                ? "Remake akan dikonversi otomatis ke bahan resep."
                                : "Belum ada resep aktif — pemakaian bahan tidak bisa dihitung."}
                            </p>
                          </div>
                          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                            <label className="block">
                              <span className="mb-1 block text-xs text-zinc-400">Qty</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={1}
                                disabled={locked}
                                value={issue.quantity}
                                onChange={(e) =>
                                  updateMenuIssue(menu.id, { quantity: e.target.value })
                                }
                                placeholder="-"
                                className={INPUT_CLASS}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs text-zinc-400">Alasan</span>
                              <select
                                disabled={locked}
                                value={issue.reason}
                                onChange={(e) =>
                                  updateMenuIssue(menu.id, {
                                    reason: normalizeIssueReason(e.target.value),
                                  })
                                }
                                className="min-h-12 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {MENU_ISSUE_REASONS.map((reason) => (
                                  <option key={reason.id} value={reason.id}>
                                    {reason.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="mt-3 block">
                            <span className="mb-1 block text-xs text-zinc-400">
                              Catatan opsional
                            </span>
                            <input
                              type="text"
                              disabled={locked}
                              value={issue.note}
                              onChange={(e) =>
                                updateMenuIssue(menu.id, { note: e.target.value })
                              }
                              placeholder="Contoh: tamu minta diganti karena terlalu asin"
                              className="min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-50 placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span className="text-xs font-medium text-zinc-400">
                                Foto bukti opsional
                              </span>
                              {issue.photoUrl ? (
                                <button
                                  type="button"
                                  disabled={locked}
                                  onClick={() => clearMenuIssuePhoto(menu.id)}
                                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-red-500/40 px-2 text-xs font-medium text-red-300 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Hapus
                                </button>
                              ) : null}
                            </div>
                            {issue.photoUrl ? (
                              <a
                                href={issue.photoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mb-3 flex items-center gap-2 text-xs text-indigo-300 underline decoration-indigo-500/40 underline-offset-4"
                              >
                                <ImageIcon className="h-4 w-4" />
                                Lihat foto bukti
                              </a>
                            ) : null}
                            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm font-medium text-zinc-200 active:bg-zinc-800">
                              {uploadingPhotoFor === `issue-${menu.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Camera className="h-4 w-4" />
                              )}
                              {uploadingPhotoFor === `issue-${menu.id}`
                                ? "Upload foto..."
                                : issue.photoUrl
                                  ? "Ganti foto"
                                  : "Upload foto"}
                              <input
                                type="file"
                                accept="image/*"
                                disabled={locked || uploadingPhotoFor === `issue-${menu.id}`}
                                onChange={(e) => {
                                  void uploadMenuIssuePhoto(menu.id, e.target.files?.[0] ?? null);
                                  e.currentTarget.value = "";
                                }}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ) : null}

            {activeTab === "sold" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-indigo-400">
                  Kamar 6 — Menu Terjual
                </h2>
                <p className="mb-4 text-xs text-zinc-500">
                  Kosong berarti tidak ada penjualan. Simpan sales menu saat pergantian shift; Submit Closing aktif otomatis setelah 00:00 WIB.
                </p>
                {menus.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-400">
                    Belum ada menu aktif untuk departemen ini.
                  </p>
                ) : filteredMenus.length === 0 ? (
                  <p className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-6 text-center text-sm text-zinc-400">
                    Tidak ada menu cocok dengan &ldquo;{searchTerm}&rdquo;.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {filteredMenus.map((menu) => {
                      const soldValue = soldItems[menu.id] ?? "";
                      const menuSoldEntries = soldEntrySummaries[menu.id] ?? [];
                      const totalSold = menuSoldEntries.reduce((sum, entry) => sum + entry.quantity, 0);
                      return (
                        <li
                          key={menu.id}
                          className="rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-zinc-50">{menu.menu_name}</p>
                              <p className="text-xs text-zinc-500">
                                Rp {Number(menu.price).toLocaleString("id-ID")}
                                {getActiveRecipeLines(menu).length === 0 ? " · tanpa resep" : ""}
                              </p>
                            </div>
                            <div className="shrink-0">
                              <span className="mb-1 block text-right text-xs text-zinc-400">
                                Input kamu
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={locked}
                                  onClick={() => adjustSoldQty(menu.id, -1)}
                                  aria-label={`Kurangi ${menu.menu_name}`}
                                  className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-950 text-zinc-200 active:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Minus className="h-5 w-5" />
                                </button>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  min={0}
                                  step={1}
                                  disabled={locked}
                                  value={soldValue}
                                  onChange={(e) => updateSoldQty(menu.id, e.target.value)}
                                  placeholder="-"
                                  className="min-h-12 w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-1 text-center text-lg font-semibold tabular-nums text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                                <button
                                  type="button"
                                  disabled={locked}
                                  onClick={() => adjustSoldQty(menu.id, 1)}
                                  aria-label={`Tambah ${menu.menu_name}`}
                                  className="flex h-12 w-12 items-center justify-center rounded-lg border border-indigo-500/50 bg-indigo-600/20 text-indigo-100 active:bg-indigo-600/35 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Plus className="h-5 w-5" />
                                </button>
                              </div>
                            </div>
                          </div>
                          {menuSoldEntries.length > 0 ? (
                            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                                <span className="font-medium text-zinc-400">Akumulasi tersimpan</span>
                                <span className="font-semibold tabular-nums text-indigo-200">
                                  {formatQty(totalSold)}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {menuSoldEntries.map((entry) => (
                                  <span
                                    key={`${menu.id}-${entry.staffId ?? entry.staffName}`}
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                      entry.staffId === staff?.id
                                        ? "bg-emerald-500/15 text-emerald-200"
                                        : "bg-zinc-800 text-zinc-300"
                                    }`}
                                  >
                                    {entry.staffName}: {formatQty(entry.quantity)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}

              </section>
            ) : null}
          </>
        )}
      </div>

      {!locked && canEdit && !isLoading && ingredients.length > 0 ? (
        <WorksheetStickyActionBar>
          {activeTab === "receive" ? (
            <button
              type="button"
              disabled={isSavingReceive || isSubmitting}
              onClick={stickySaveReceive}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-600/20 font-bold text-amber-100 active:bg-amber-600/30 disabled:opacity-50"
            >
              {isSavingReceive ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Package className="h-5 w-5" />
              )}
              Simpan Pasokan
            </button>
          ) : null}

          {activeTab === "outstock" ? (
            <button
              type="button"
              disabled={isSavingOutStock || isSubmitting || outstockHasBlockingErrors}
              onClick={stickySaveOutStock}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-600/20 font-bold text-amber-100 active:bg-amber-600/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingOutStock ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <PackageMinus className="h-5 w-5" />
              )}
              Simpan Out Stock
            </button>
          ) : null}

          {activeTab === "opname" ? (
            <button
              type="button"
              disabled={isSavingOpname || isSubmitting}
              onClick={stickySaveOpname}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-indigo-500/50 bg-indigo-600/20 font-bold text-indigo-100 active:bg-indigo-600/35 disabled:opacity-50"
            >
              {isSavingOpname ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <ClipboardList className="h-5 w-5" />
              )}
              Simpan Opname
            </button>
          ) : null}

          {activeTab === "premix" ? (
            <button
              type="button"
              disabled={isSavingPremix || isSubmitting}
              onClick={stickySavePremix}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-600/20 font-bold text-emerald-100 active:bg-emerald-600/30 disabled:opacity-50"
            >
              {isSavingPremix ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Beaker className="h-5 w-5" />
              )}
              Simpan Premix
            </button>
          ) : null}

          {activeTab === "issue" ? (
            <button
              type="button"
              onClick={() => setActiveTab("sold")}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-red-500/50 bg-red-600/20 font-bold text-red-100 active:bg-red-600/30"
            >
              <AlertTriangle className="h-5 w-5" />
              Lanjut ke Menu Terjual
            </button>
          ) : null}

          {activeTab === "sold" ? (
            <div className="grid w-full gap-2">
              <button
                type="button"
                disabled={isSavingMenuProgress || isSubmitting}
                onClick={stickySaveMenuProgress}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-600/20 px-3 text-center text-sm font-bold leading-tight text-emerald-100 active:bg-emerald-600/30 disabled:opacity-50"
              >
                {isSavingMenuProgress ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <UtensilsCrossed className="h-5 w-5 shrink-0" />
                )}
                <span>{isSavingMenuProgress ? "Menyimpan sales…" : "Simpan Sales Menu"}</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting || !closingSubmitOpen}
                onClick={stickySubmit}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-center text-sm font-bold leading-tight text-white shadow-lg shadow-indigo-900/40 active:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Lock className="h-5 w-5 shrink-0" />
                )}
                <span>
                  {isSubmitting
                    ? "Mengunci laporan…"
                    : closingSubmitOpen
                      ? "Submit Report Closing"
                      : "Submit Aktif 00:00 WIB"}
                </span>
              </button>
            </div>
          ) : null}
        </WorksheetStickyActionBar>
      ) : null}
    </main>
  );
}
