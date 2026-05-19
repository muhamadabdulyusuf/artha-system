"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
} from "lucide-react";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { Toast, type ToastVariant } from "@/components/ui/Toast";
import { translateWorksheetSubmitError } from "@/lib/worksheet/errorTranslator";
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

type WorksheetTab = "receive" | "outstock" | "opname" | "sold";

type IngredientLineState = {
  inQty: string;
  closingStock: string;
  outQty: string;
  outNote: string;
};

type RecipeVersionNested = {
  id: string;
  is_active: boolean;
  recipe_line: RecipeLineForCalc[];
};

type MenuItemWithRecipe = MenuItemRow & {
  menu_recipe_version: RecipeVersionNested[];
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

type WorksheetClosingProps = {
  department: Department;
  title: string;
};

const DEFAULT_LINE: IngredientLineState = {
  inQty: "0",
  closingStock: "0",
  outQty: "0",
  outNote: "",
};

const TAB_CONFIG: { id: WorksheetTab; label: string; icon: typeof Package }[] = [
  { id: "receive", label: "Receive", icon: Package },
  { id: "outstock", label: "Out Stock", icon: PackageMinus },
  { id: "opname", label: "Opname", icon: ClipboardList },
  { id: "sold", label: "Menu", icon: UtensilsCrossed },
];

const INPUT_CLASS =
  "min-h-12 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-lg font-semibold tabular-nums text-zinc-50 disabled:cursor-not-allowed disabled:opacity-50";

const SEARCH_INPUT_CLASS =
  "min-h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2.5 pl-10 pr-10 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

function parseQty(value: string): number {
  const n = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatQty(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10000) / 10000;
  return String(rounded);
}

function isWorksheetLocked(status: ClosingStatus | null | undefined): boolean {
  return status !== null && status !== undefined && SUBMITTED_LOCK_STATUSES.includes(status);
}

function canRequestResubmit(status: ClosingStatus | null | undefined): boolean {
  return status === "SUBMITTED" || status === "PENDING_APPROVAL_ADMIN";
}

function getActiveRecipeLines(menu: MenuItemWithRecipe): RecipeLineForCalc[] {
  const active = menu.menu_recipe_version?.find((v) => v.is_active);
  return active?.recipe_line ?? [];
}

function computeMenuTheoreticalUsage(
  menuList: MenuItemWithRecipe[],
  soldItems: Record<string, string>
): Map<string, number> {
  const usage = new Map<string, number>();

  for (const menu of menuList) {
    const quantitySold = parseQty(soldItems[menu.id] ?? "0");
    for (const line of getActiveRecipeLines(menu)) {
      const add = quantitySold * Number(line.quantity_per_serving);
      usage.set(line.ingredient_id, (usage.get(line.ingredient_id) ?? 0) + add);
    }
  }

  return usage;
}

function createDefaultLine(preset?: Partial<IngredientLineState>): IngredientLineState {
  return {
    inQty: preset?.inQty ?? "0",
    closingStock: preset?.closingStock ?? "0",
    outQty: preset?.outQty ?? "0",
    outNote: preset?.outNote ?? "",
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

  return (data ?? []) as MenuItemWithRecipe[];
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
  const [lines, setLines] = useState<Record<string, IngredientLineState>>({});
  const [soldItems, setSoldItems] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingReceive, setIsSavingReceive] = useState(false);
  const [isSavingOutStock, setIsSavingOutStock] = useState(false);
  const [isSavingOpname, setIsSavingOpname] = useState(false);
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
  const pendingTypoActionRef = useRef<(() => void) | null>(null);

  const locked = isWorksheetLocked(worksheetStatus ?? undefined);
  const pendingAdminApproval = worksheetStatus === "PENDING_APPROVAL_ADMIN";
  const showResubmitCta = canRequestResubmit(worksheetStatus ?? undefined);

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

  const filteredMenus = useMemo(() => {
    if (!normalizedSearch) return menus;
    return menus.filter((menu) => menu.menu_name.toLowerCase().includes(normalizedSearch));
  }, [menus, normalizedSearch]);

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
          closingStock:
            rowPreset?.closingStock ??
            String(Number.isFinite(Number(ing.current_stock)) ? ing.current_stock : 0),
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

  const initSoldItems = useCallback(
    (menuList: MenuItemWithRecipe[], preset?: Record<string, string>) => {
      const next: Record<string, string> = {};
      for (const menu of menuList) {
        next[menu.id] = preset?.[menu.id] ?? "0";
      }
      setSoldItems(next);
    },
    []
  );

  const loadData = useCallback(async () => {
    if (!staff) return;

    setIsLoading(true);
    setError(null);

    const date = resolveBusinessDate();
    setBusinessDate(date);

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
      .order("name", { ascending: true });

    if (ingErr) {
      setError(ingErr.message);
      setIsLoading(false);
      return;
    }

    const ingredientList = ingRows ?? [];
    setIngredients(ingredientList);

    let menuList: MenuItemWithRecipe[];
    try {
      menuList = await fetchMenusWithActiveRecipes(supabase, department);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat menu.");
      setIsLoading(false);
      return;
    }
    setMenus(menuList);

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

    if (ws?.id) {
      const { data: inLines } = await supabase
        .from("worksheet_in_line")
        .select("ingredient_id, quantity")
        .eq("session_id", ws.id);

      for (const row of inLines ?? []) {
        ingredientPreset[row.ingredient_id] = {
          ...ingredientPreset[row.ingredient_id],
          inQty: String(row.quantity),
        };
      }

      const { data: outLines } = await supabase
        .from("worksheet_out_line")
        .select("ingredient_id, quantity, note")
        .eq("session_id", ws.id);

      for (const row of outLines ?? []) {
        ingredientPreset[row.ingredient_id] = {
          ...ingredientPreset[row.ingredient_id],
          outQty: String(row.quantity),
          outNote: row.note ?? "",
        };
      }

      const { data: soldLines } = await supabase
        .from("worksheet_sold_line")
        .select("menu_item_id, quantity_sold")
        .eq("session_id", ws.id);

      for (const row of soldLines ?? []) {
        soldPreset[row.menu_item_id] = String(row.quantity_sold);
      }

      const { data: ledgers } = await supabase
        .from("stock_ledger")
        .select("ingredient_id, closing_stock, in_qty")
        .eq("business_date", date)
        .in(
          "ingredient_id",
          ingredientList.map((i) => i.id)
        );

      for (const row of ledgers ?? []) {
        const snapshot = ledgerRowToSnapshot(row);
        const existing = ingredientPreset[row.ingredient_id];
        ingredientPreset[row.ingredient_id] = {
          inQty: existing?.inQty ?? String(snapshot?.in_qty ?? 0),
          closingStock: String(snapshot?.closing_stock ?? 0),
          outQty: existing?.outQty,
          outNote: existing?.outNote,
        };
      }
    }

    initIngredientLines(ingredientList, ingredientPreset);
    initSoldItems(menuList, soldPreset);
    setIsLoading(false);
  }, [department, initIngredientLines, initSoldItems, staff, supabase]);

  useEffect(() => {
    const current = getStaffSession();
    if (!current || !canAccessWorksheet(current, department)) {
      router.replace("/");
      return;
    }
    setStaff(current);
  }, [department, router]);

  useEffect(() => {
    if (staff) void loadData();
  }, [staff, loadData]);

  useWorksheetDraft({
    department,
    businessDate,
    isLoading,
    locked,
    lines,
    soldItems,
    activeTab,
    onRestore: (draft) => {
      setLines(draft.lines);
      setSoldItems(draft.soldItems);
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

  const updateInQty = (ingredientId: string, value: string) => {
    if (locked) return;
    setLines((prev) => ({
      ...prev,
      [ingredientId]: { ...(prev[ingredientId] ?? DEFAULT_LINE), inQty: value },
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

  const updateSoldQty = (menuId: string, value: string) => {
    if (locked) return;
    setSoldItems((prev) => ({ ...prev, [menuId]: value }));
  };

  const adjustSoldQty = (menuId: string, delta: number) => {
    if (locked) return;
    setSoldItems((prev) => {
      const current = parseQty(prev[menuId] ?? "0");
      const next = Math.max(0, current + delta);
      return { ...prev, [menuId]: String(next) };
    });
  };

  const handleSaveReceive = async () => {
    if (locked || isSavingReceive) return;

    const date = businessDate || resolveBusinessDate();
    setIsSavingReceive(true);
    setError(null);

    try {
      const { sessionId: activeSessionId } = await ensureDraftSession(date);

      const upsertPayload = ingredients.map((ing) => ({
        session_id: activeSessionId,
        ingredient_id: ing.id,
        quantity: parseQty(lines[ing.id]?.inQty ?? "0"),
      }));

      const { error: inLineErr } = await supabase
        .from("worksheet_in_line")
        .upsert(upsertPayload, { onConflict: "session_id,ingredient_id" });

      if (inLineErr) {
        throw new Error(`Gagal menyimpan pasokan: ${inLineErr.message}`);
      }

      showSuccessToast(
        "Pasokan tersimpan. Stok akumulatif (masuk) — tidak perlu isi opname di kamar ini."
      );
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSavingReceive(false);
    }
  };

  const handleSaveOutStock = async () => {
    if (locked || isSavingOutStock || outstockHasBlockingErrors) return;

    const date = businessDate || resolveBusinessDate();
    setIsSavingOutStock(true);
    setError(null);

    try {
      const freshIngredients = await refreshIngredientStockFromDb();
      await assertOutstockPayloadValid(freshIngredients);

      const { sessionId: activeSessionId } = await ensureDraftSession(date);

      const outLinePayload = freshIngredients.map((ing) => {
        const line = lines[ing.id] ?? DEFAULT_LINE;
        return {
          session_id: activeSessionId,
          ingredient_id: ing.id,
          quantity: parseQty(line.outQty),
          note: line.outNote.trim(),
        };
      });

      const { error: outLineErr } = await supabase
        .from("worksheet_out_line")
        .upsert(outLinePayload, { onConflict: "session_id,ingredient_id" });

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

    const date = businessDate || resolveBusinessDate();
    setIsSavingOpname(true);
    setError(null);

    try {
      const freshIngredients = await refreshIngredientStockFromDb();
      const { sessionId: activeSessionId } = await ensureDraftSession(date);

      const ledgerDraft: StockLedgerInsert[] = freshIngredients.map((ing) => {
        const line = lines[ing.id] ?? DEFAULT_LINE;
        const in_qty = parseQty(line.inQty);
        const closing_stock = parseQty(line.closingStock);
        const opening_stock = Math.max(0, closing_stock - in_qty);

        return {
          business_date: date,
          ingredient_id: ing.id,
          opening_stock,
          in_qty,
          theoretical_usage: 0,
          adjustment_qty: 0,
          closing_stock,
        };
      });

      const { error: ledgerErr } = await supabase
        .from("stock_ledger")
        .upsert(ledgerDraft, { onConflict: "business_date,ingredient_id" });

      if (ledgerErr) {
        throw new Error(`Gagal menyimpan opname: ${ledgerErr.message}`);
      }

      showSuccessToast("Opname tersimpan. Lanjutkan tab Menu lalu Submit Report Closing.");

    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSavingOpname(false);
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

  const handleSubmit = async () => {
    if (locked || isSubmitting || outstockHasBlockingErrors) return;

    if (!staff?.id) {
      setError("Sesi staf tidak ditemukan. Silakan logout dan login PIN ulang.");
      return;
    }

    const submittingStaffId = staff.id;

    try {
      const freshIngredients = await refreshIngredientStockFromDb();
      await assertOutstockPayloadValid(freshIngredients);
    } catch (err) {
      showPlainErrorToast(err instanceof Error ? err.message : "Validasi out stock gagal.");
      setActiveTab("outstock");
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

    const date = businessDate || resolveBusinessDate();
    const submittedAt = new Date().toISOString();
    let activeSessionId: string | null = null;
    let opnameEvalForAsync: ReturnType<typeof evaluateOpnameSubmission> | null = null;

    try {
      const freshIngredients = await refreshIngredientStockFromDb();
      await assertOutstockPayloadValid(freshIngredients);

      const { sessionId: ensuredSessionId } = await ensureDraftSession(date);
      activeSessionId = ensuredSessionId;

      const inLinePayload = ingredients.map((ing) => ({
        session_id: ensuredSessionId,
        ingredient_id: ing.id,
        quantity: parseQty(lines[ing.id]?.inQty ?? "0"),
      }));

      const { error: inLineErr } = await supabase
        .from("worksheet_in_line")
        .upsert(inLinePayload, { onConflict: "session_id,ingredient_id" });

      if (inLineErr) {
        throw new Error(`Gagal menyimpan worksheet_in_line: ${inLineErr.message}`);
      }

      const outLinePayload = freshIngredients.map((ing) => {
        const line = lines[ing.id] ?? DEFAULT_LINE;
        return {
          session_id: ensuredSessionId,
          ingredient_id: ing.id,
          quantity: parseQty(line.outQty),
          note: line.outNote.trim(),
        };
      });

      const { error: outLineErr } = await supabase
        .from("worksheet_out_line")
        .upsert(outLinePayload, { onConflict: "session_id,ingredient_id" });

      if (outLineErr) {
        throw new Error(`Gagal menyimpan worksheet_out_line: ${outLineErr.message}`);
      }

      const soldPayload = menuListForCalc.map((menu) => ({
        session_id: ensuredSessionId,
        menu_item_id: menu.id,
        quantity_sold: parseQty(soldItems[menu.id] ?? "0"),
      }));

      const { error: soldErr } = await supabase
        .from("worksheet_sold_line")
        .upsert(soldPayload, { onConflict: "session_id,menu_item_id" });

      if (soldErr) {
        throw new Error(`Gagal menyimpan worksheet_sold_line: ${soldErr.message}`);
      }

      const menuTheoreticalMap = computeMenuTheoreticalUsage(menuListForCalc, soldItems);

      const ledgerPayload: StockLedgerInsert[] = freshIngredients.map((ing) => {
        const line = lines[ing.id] ?? DEFAULT_LINE;
        const in_qty = parseQty(line.inQty);
        const closing_stock = parseQty(line.closingStock);
        const out_qty = parseQty(line.outQty);
        const menu_theoretical = menuTheoreticalMap.get(ing.id) ?? 0;
        const theoretical_usage = menu_theoretical;
        const adjustment_qty = out_qty > 0 ? -out_qty : 0;
        const opening_stock = closing_stock - in_qty + menu_theoretical + out_qty;

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

      const { error: ledgerErr } = await supabase
        .from("stock_ledger")
        .upsert(ledgerPayload, { onConflict: "business_date,ingredient_id" });

      if (ledgerErr) {
        throw new Error(`Gagal upsert stock_ledger: ${ledgerErr.message}`);
      }

      opnameEvalForAsync = evaluateOpnameSubmission({
        ingredients: freshIngredients,
        lines,
        ledgerRows: ledgerPayload.map((row) => ({
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
    isSubmitting || isSavingReceive || isSavingOutStock || isSavingOpname || isRequestingResubmit;

  const overlayMessage = isSubmitting
    ? "Mengirim laporan closing…"
    : isRequestingResubmit
      ? "Membuka kembali worksheet…"
      : isSavingReceive
        ? "Menyimpan pasokan…"
        : isSavingOutStock
          ? "Menyimpan out stock…"
          : "Menyimpan opname…";

  const stickySaveReceive = () =>
    runWithTypoGuard(["inQty"], () => void handleSaveReceive());
  const stickySaveOutStock = () =>
    runWithTypoGuard(["outQty"], () => void handleSaveOutStock());
  const stickySaveOpname = () =>
    runWithTypoGuard(["closingStock"], () => void handleSaveOpname());
  const stickySubmit = () =>
    runWithTypoGuard(["inQty", "closingStock", "outQty"], () => void handleSubmit());

  return (
    <main className="mx-auto min-h-screen max-w-lg bg-zinc-950 pb-24">
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
              Penanggung jawab (otomatis dari PIN)
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

      {!isLoading && (ingredients.length > 0 || menus.length > 0) ? (
        <div className="px-4 pt-3">
          <div className="relative mb-4 w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={
                activeTab === "sold" ? "Cari menu terjual…" : "Cari bahan baku…"
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
                {showResubmitCta ? (
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
        ) : ingredients.length === 0 ? (
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
                  Catat barang masuk saja (akumulatif). Tidak perlu isi opname di kamar ini — stok baru =
                  stok lama + qty masuk saat closing.
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
                            Pasokan masuk (in_qty)
                          </span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            disabled={locked}
                            value={line.inQty}
                            onChange={(e) => updateInQty(ing.id, e.target.value)}
                            className={INPUT_CLASS}
                          />
                        </label>
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
                  Barang keluar/rusak/basi. Qty tidak boleh melebihi persediaan. Keterangan wajib
                  jika qty &gt; 0. Simpan draft ke Supabase — form tetap aktif.
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
                    const noteInvalid = validation.noteMissing;

                    return (
                      <li
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
                              Keterangan / Alasan Outstock{" "}
                              <span className="text-red-400">*</span>
                            </span>
                            <textarea
                              required
                              rows={3}
                              disabled={locked}
                              value={line.outNote}
                              onChange={(e) => updateOutNote(ing.id, e.target.value)}
                              placeholder="Contoh: Tumpah, Salah buat/re-make, Expired"
                              autoCorrect="off"
                              spellCheck={false}
                              aria-invalid={noteInvalid}
                              className={`min-h-24 w-full rounded-lg border bg-zinc-950 px-3 py-2 text-sm text-zinc-50 placeholder:text-zinc-600 disabled:cursor-not-allowed disabled:opacity-50 ${
                                noteInvalid
                                  ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/40"
                                  : "border-zinc-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40"
                              } focus:outline-none`}
                            />
                            {noteInvalid ? (
                              <p className="mt-2 text-xs text-red-300" role="alert">
                                Keterangan / Alasan Outstock wajib diisi sebelum menyimpan.
                              </p>
                            ) : null}
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
                            className={INPUT_CLASS}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {activeTab === "sold" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-indigo-400">
                  Kamar 4 — Menu Terjual
                </h2>
                <p className="mb-4 text-xs text-zinc-500">
                  Qty default 0. Setelah semua kamar benar, submit laporan closing di bawah.
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
                      const soldValue = soldItems[menu.id] ?? "0";
                      return (
                        <li
                          key={menu.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-4 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-zinc-50">{menu.menu_name}</p>
                            <p className="text-xs text-zinc-500">
                              Rp {Number(menu.price).toLocaleString("id-ID")}
                              {getActiveRecipeLines(menu).length === 0 ? " · tanpa resep" : ""}
                            </p>
                          </div>
                          <div className="shrink-0">
                            <span className="mb-1 block text-right text-xs text-zinc-400">
                              Terjual
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

      {!locked && !isLoading && ingredients.length > 0 ? (
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

          {activeTab === "sold" ? (
            <button
              type="button"
              disabled={isSubmitting || outstockHasBlockingErrors}
              onClick={stickySubmit}
              className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-bold text-white shadow-lg shadow-indigo-900/40 active:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {isSubmitting ? "Mengunci laporan…" : "Submit Report Closing"}
            </button>
          ) : null}
        </WorksheetStickyActionBar>
      ) : null}
    </main>
  );
}
