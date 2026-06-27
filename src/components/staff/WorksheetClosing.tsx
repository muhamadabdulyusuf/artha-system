"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { ForwardedRef } from "react";
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
import { AbdulCompanyMark } from "@/components/brand/AbdulCompanyMark";
import { Toast, type ToastVariant } from "@/components/ui/Toast";
import { translateWorksheetSubmitError } from "@/lib/worksheet/errorTranslator";
import { canEditStaffData } from "@/lib/auth/permissions";
import {
  WORKSHEET_TAB_TASK_ID,
  isRoleTaskEnabled,
  mergeRoleTaskSettings,
} from "@/lib/auth/roleTasks";
import { getStaffSession, type StaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  ClosingStatus,
  Department,
  IngredientRow,
  MenuItemRow,
  RecipeLineForCalc,
  StaffRole,
  WorksheetEditRequestRow,
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
  type TypoGuardPreviewEntry,
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
const BUSINESS_DATE_CUTOFF_HOUR = 5;

type WorksheetTab = "receive" | "outstock" | "opname" | "premix" | "issue" | "sold";
type OutflowType = "operational" | "spoil";
type LossResponsibilityScope = "general" | "unknown" | "staff";

type IngredientLineState = {
  inQty: string;
  inUnitPrice: string;
  closingStock: string;
  outQty: string;
  outNote: string;
  outflowType: OutflowType;
  outResponsibilityScope: LossResponsibilityScope;
  outResponsibleStaffId: string;
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
  lossResponsibilityScope: LossResponsibilityScope;
  responsibleStaffId: string;
  photoUrl: string;
  photoPublicId: string;
};

type WorksheetPhoto = {
  url: string;
  publicId: string;
};

type DepartmentStaffOption = {
  id: string;
  name: string;
  role: StaffRole;
  department: Department | null;
};

type SoldEntrySummary = {
  staffId: string | null;
  staffName: string;
  staffRole?: StaffRole | null;
  quantity: number;
};

type StaffSummaryJoin = { name: string; role?: StaffRole | null };

type SoldEntryJoined = {
  menu_item_id: string;
  staff_id: string | null;
  quantity_sold: number;
  staff: StaffSummaryJoin | StaffSummaryJoin[] | null;
};

type ReceiveEntryJoined = {
  ingredient_id: string;
  staff_id: string | null;
  quantity: number;
  staff: StaffSummaryJoin | StaffSummaryJoin[] | null;
};

type WorksheetLineOwner = {
  staffId: string | null;
  staffName: string;
  staffRole?: StaffRole | null;
};

type StaffJoin = { staff_id: string | null; staff: StaffSummaryJoin | StaffSummaryJoin[] | null };

type OutLineJoined = StaffJoin & {
  ingredient_id: string;
  quantity: number;
  note: string | null;
  outflow_type?: OutflowType | null;
  loss_responsibility_scope?: LossResponsibilityScope | null;
  responsible_staff_id?: string | null;
  photo_url: string | null;
  photo_public_id: string | null;
};

type IssueLineJoined = StaffJoin & {
  menu_item_id: string;
  quantity: number;
  reason: string | null;
  note: string | null;
  loss_responsibility_scope?: LossResponsibilityScope | null;
  responsible_staff_id?: string | null;
  photo_url: string | null;
  photo_public_id: string | null;
};

type PremixLineJoined = StaffJoin & {
  output_ingredient_id: string;
  batch_quantity: number;
};

type OpnameLineJoined = StaffJoin & {
  ingredient_id: string;
  closing_stock: number;
};

type OpnameAggregateJoined = {
  ingredient_id: string;
  closing_stock: number;
  staff: StaffSummaryJoin | StaffSummaryJoin[] | null;
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
  embedded?: boolean;
};

export type WorksheetClosingHandle = {
  saveAllProgress: () => Promise<void>;
  buildPreviewEntries: () => TypoGuardPreviewEntry[];
};

type WorksheetEditRequestSummary = Pick<
  WorksheetEditRequestRow,
  "id" | "reason" | "status" | "created_at"
>;

const DEFAULT_LINE: IngredientLineState = {
  inQty: "",
  inUnitPrice: "",
  closingStock: "",
  outQty: "",
  outNote: "",
  outflowType: "operational",
  outResponsibilityScope: "unknown",
  outResponsibleStaffId: "",
  outPhotoUrl: "",
  outPhotoPublicId: "",
};

function splitStoredPhotoValue(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinStoredPhotoValue(values: string[]): string {
  return values.map((item) => item.trim()).filter(Boolean).join("; ");
}

function buildStoredPhotoItems(
  photoUrl: string | null | undefined,
  photoPublicId: string | null | undefined
): WorksheetPhoto[] {
  const urls = splitStoredPhotoValue(photoUrl);
  const publicIds = splitStoredPhotoValue(photoPublicId);
  return urls.map((url, index) => ({
    url,
    publicId: publicIds[index] ?? "",
  }));
}

function appendStoredPhotos(
  photoUrl: string | null | undefined,
  photoPublicId: string | null | undefined,
  photos: WorksheetPhoto[]
): Pick<IngredientLineState, "outPhotoUrl" | "outPhotoPublicId"> {
  return {
    outPhotoUrl: joinStoredPhotoValue([
      ...splitStoredPhotoValue(photoUrl),
      ...photos.map((photo) => photo.url),
    ]),
    outPhotoPublicId: joinStoredPhotoValue([
      ...splitStoredPhotoValue(photoPublicId),
      ...photos.map((photo) => photo.publicId),
    ]),
  };
}

function removeStoredPhotoAt(
  photoUrl: string | null | undefined,
  photoPublicId: string | null | undefined,
  indexToRemove: number
): Pick<IngredientLineState, "outPhotoUrl" | "outPhotoPublicId"> {
  return {
    outPhotoUrl: joinStoredPhotoValue(
      splitStoredPhotoValue(photoUrl).filter((_, index) => index !== indexToRemove)
    ),
    outPhotoPublicId: joinStoredPhotoValue(
      splitStoredPhotoValue(photoPublicId).filter((_, index) => index !== indexToRemove)
    ),
  };
}

async function uploadWorksheetPhoto(file: File, folder: string): Promise<WorksheetPhoto> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("folder", folder);

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

  return { url: result.url, publicId: result.publicId };
}

const TAB_CONFIG: { id: WorksheetTab; label: string; icon: typeof Package }[] = [
  { id: "receive", label: "Receive", icon: Package },
  { id: "outstock", label: "Out Stock", icon: PackageMinus },
  { id: "opname", label: "Opname", icon: ClipboardList },
  { id: "premix", label: "Premix", icon: Beaker },
  { id: "issue", label: "Remake", icon: AlertTriangle },
  { id: "sold", label: "Menu", icon: UtensilsCrossed },
];

const DEFAULT_WORKSHEET_FEATURES: Record<WorksheetTab, boolean> = {
  receive: true,
  outstock: true,
  opname: true,
  premix: true,
  issue: true,
  sold: true,
};

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
const SERVICE_DEDUCTIBLE_MENU_ISSUE_REASONS = new Set<MenuIssueReason>([
  "too_salty",
  "undercooked",
  "burnt",
  "hair",
  "wrong_order",
  "spilled",
  "staff_error",
  "other",
]);

const INPUT_CLASS =
  "min-h-12 w-full rounded-lg border border-slate-200/80 bg-white px-3 text-lg font-semibold tabular-nums text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50";

const SEARCH_INPUT_CLASS =
  "min-h-11 w-full rounded-lg border border-slate-200/80 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-100 disabled:cursor-not-allowed disabled:opacity-50";

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
    Omit<
      IngredientLineState,
      "inUnitPrice" | "outflowType" | "outResponsibilityScope" | "outResponsibleStaffId" | "outPhotoUrl" | "outPhotoPublicId"
    > &
      Partial<
        Pick<
          IngredientLineState,
          "inUnitPrice" | "outflowType" | "outResponsibilityScope" | "outResponsibleStaffId" | "outPhotoUrl" | "outPhotoPublicId"
        >
      >
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
        outflowType: line.outflowType ?? "operational",
        outResponsibilityScope: line.outResponsibilityScope ?? "unknown",
        outResponsibleStaffId:
          line.outflowType === "spoil" && line.outResponsibilityScope === "staff" ? line.outResponsibleStaffId ?? "" : "",
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

function normalizeLossResponsibilityScope(value: string | null | undefined): LossResponsibilityScope {
  return value === "staff" || value === "general" ? value : "unknown";
}

function createDefaultMenuIssue(): MenuIssueLineState {
  return {
    quantity: "",
    reason: "guest_complaint",
    note: "",
    lossResponsibilityScope: "unknown",
    responsibleStaffId: "",
    photoUrl: "",
    photoPublicId: "",
  };
}

function normalizeIssueReason(value: string | null | undefined): MenuIssueReason {
  return MENU_ISSUE_REASONS.some((reason) => reason.id === value)
    ? (value as MenuIssueReason)
    : "other";
}

function formatIssueReasonLabel(value: string | null | undefined): string {
  const normalized = normalizeIssueReason(value);
  return MENU_ISSUE_REASONS.find((reason) => reason.id === normalized)?.label ?? "Lainnya";
}

function isServiceDeductibleMenuIssueReason(value: string | null | undefined): boolean {
  return SERVICE_DEDUCTIBLE_MENU_ISSUE_REASONS.has(normalizeIssueReason(value));
}

function normalizeRestoredMenuIssues(
  restoredIssues: Record<
    string,
    Partial<Omit<MenuIssueLineState, "reason" | "lossResponsibilityScope">> & {
      reason?: string | null;
      lossResponsibilityScope?: string | null;
    }
  >
): Record<string, MenuIssueLineState> {
  return Object.fromEntries(
    Object.entries(restoredIssues).map(([menuId, issue]) => {
      const reason = normalizeIssueReason(issue.reason);
      const scope = isServiceDeductibleMenuIssueReason(reason)
        ? normalizeLossResponsibilityScope(issue.lossResponsibilityScope)
        : "unknown";

      return [
        menuId,
        {
          quantity: blankZero(issue.quantity),
          reason,
          note: issue.note ?? "",
          lossResponsibilityScope: scope,
          responsibleStaffId: scope === "staff" ? issue.responsibleStaffId ?? "" : "",
          photoUrl: issue.photoUrl ?? "",
          photoPublicId: issue.photoPublicId ?? "",
        },
      ];
    })
  );
}

function isWorksheetLocked(status: ClosingStatus | null | undefined): boolean {
  return status !== null && status !== undefined && SUBMITTED_LOCK_STATUSES.includes(status);
}

function canRequestResubmit(status: ClosingStatus | null | undefined): boolean {
  return status === "SUBMITTED" || status === "LOCKED" || status === "PENDING_APPROVAL_ADMIN";
}

function isMasterRole(role: StaffRole | null | undefined): boolean {
  return role === "master_admin" || role === "admin" || role === "op_manager";
}

function resolveLineOwner(row: StaffJoin): WorksheetLineOwner {
  const staffRaw = row.staff;
  const rowStaff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
  return {
    staffId: row.staff_id,
    staffName: rowStaff?.name ?? "Staff lama / tidak tercatat",
    staffRole: rowStaff?.role ?? null,
  };
}

function preferWorksheetOwner(
  current: WorksheetLineOwner | undefined,
  incoming: WorksheetLineOwner
): WorksheetLineOwner {
  if (!current) return incoming;
  if (!current.staffId) return incoming;
  if (!incoming.staffId) return current;
  if (isMasterRole(current.staffRole) && !isMasterRole(incoming.staffRole)) return incoming;
  return current;
}

function normalizeOwnerText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildOwnerDeleteFilter(staffIds: string[]): string {
  const uniqueIds = Array.from(
    new Set(staffIds.map((id) => id.trim()).filter((id) => id.length > 0))
  );
  return uniqueIds.length > 0
    ? `staff_id.in.(${uniqueIds.join(",")}),staff_id.is.null`
    : "staff_id.is.null";
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

function computePremixEffectsFromTotals(
  premixItems: PremixItemWithRecipe[],
  premixQuantityTotals: Map<string, number>
): {
  outputMap: Map<string, number>;
  usageMap: Map<string, number>;
} {
  const quantities = Object.fromEntries(
    Array.from(premixQuantityTotals.entries()).map(([id, quantity]) => [
      id,
      String(quantity),
    ])
  );
  return computePremixEffects(premixItems, quantities);
}

function buildMasterFirstOpnameTotalMap(rows: OpnameAggregateJoined[]): Map<string, number> {
  const allTotals = new Map<string, number>();
  const masterTotals = new Map<string, number>();

  for (const row of rows) {
    const quantity = Number(row.closing_stock ?? 0);
    allTotals.set(row.ingredient_id, (allTotals.get(row.ingredient_id) ?? 0) + quantity);

    const staffRaw = row.staff;
    const rowStaff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
    if (isMasterRole(rowStaff?.role)) {
      masterTotals.set(row.ingredient_id, (masterTotals.get(row.ingredient_id) ?? 0) + quantity);
    }
  }

  const totals = new Map<string, number>();
  for (const [ingredientId, quantity] of allTotals.entries()) {
    totals.set(
      ingredientId,
      masterTotals.has(ingredientId) ? masterTotals.get(ingredientId) ?? 0 : quantity
    );
  }
  return totals;
}

function createDefaultLine(preset?: Partial<IngredientLineState>): IngredientLineState {
  return {
    inQty: preset?.inQty ?? "",
    inUnitPrice: preset?.inUnitPrice ?? "",
    closingStock: preset?.closingStock ?? "",
    outQty: preset?.outQty ?? "",
    outNote: preset?.outNote ?? "",
    outflowType: preset?.outflowType ?? "operational",
    outResponsibilityScope: preset?.outResponsibilityScope ?? "unknown",
    outResponsibleStaffId:
      preset?.outflowType === "spoil" && preset?.outResponsibilityScope === "staff" ? preset?.outResponsibleStaffId ?? "" : "",
    outPhotoUrl: preset?.outPhotoUrl ?? "",
    outPhotoPublicId: preset?.outPhotoPublicId ?? "",
  };
}

function resolveOutstockLossPayload(line: IngredientLineState): {
  outflow_type: OutflowType;
  loss_responsibility_scope: LossResponsibilityScope;
  responsible_staff_id: string | null;
} {
  if (line.outflowType !== "spoil") {
    return {
      outflow_type: "operational",
      loss_responsibility_scope: "unknown",
      responsible_staff_id: null,
    };
  }

  const scope =
    line.outResponsibilityScope === "staff" && !line.outResponsibleStaffId
      ? "unknown"
      : line.outResponsibilityScope;

  return {
    outflow_type: "spoil",
    loss_responsibility_scope: scope,
    responsible_staff_id: scope === "staff" ? line.outResponsibleStaffId || null : null,
  };
}

function resolveMenuIssueLossPayload(issue: MenuIssueLineState): {
  loss_responsibility_scope: LossResponsibilityScope;
  responsible_staff_id: string | null;
} {
  if (!isServiceDeductibleMenuIssueReason(issue.reason)) {
    return {
      loss_responsibility_scope: "unknown",
      responsible_staff_id: null,
    };
  }

  const scope =
    issue.lossResponsibilityScope === "staff" && !issue.responsibleStaffId
      ? "unknown"
      : issue.lossResponsibilityScope;

  return {
    loss_responsibility_scope: scope,
    responsible_staff_id: scope === "staff" ? issue.responsibleStaffId || null : null,
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

function WorksheetClosingInner(
  { department, title, embedded = false }: WorksheetClosingProps,
  ref: ForwardedRef<WorksheetClosingHandle>
) {
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [staff, setStaff] = useState<StaffSession | null>(null);
  const [activeTab, setActiveTab] = useState<WorksheetTab>("receive");
  const [worksheetFeatures, setWorksheetFeatures] = useState<Record<WorksheetTab, boolean>>({
    ...DEFAULT_WORKSHEET_FEATURES,
  });
  const [selectedBusinessDate, setSelectedBusinessDate] = useState(() => resolveWorksheetBusinessDate());
  const [businessDate, setBusinessDate] = useState<string>("");
  const [worksheetStatus, setWorksheetStatus] = useState<ClosingStatus | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [editRequest, setEditRequest] = useState<WorksheetEditRequestSummary | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [menus, setMenus] = useState<MenuItemWithRecipe[]>([]);
  const [premixItems, setPremixItems] = useState<PremixItemWithRecipe[]>([]);
  const [departmentStaffOptions, setDepartmentStaffOptions] = useState<DepartmentStaffOption[]>([]);
  const [lines, setLines] = useState<Record<string, IngredientLineState>>({});
  const [receiveEntryInputs, setReceiveEntryInputs] = useState<Record<string, string>>({});
  const [receiveEntrySummaries, setReceiveEntrySummaries] = useState<Record<string, SoldEntrySummary[]>>({});
  const [soldItems, setSoldItems] = useState<Record<string, string>>({});
  const [soldEntrySummaries, setSoldEntrySummaries] = useState<Record<string, SoldEntrySummary[]>>({});
  const [outEntrySummaries, setOutEntrySummaries] = useState<Record<string, SoldEntrySummary[]>>({});
  const [opnameEntrySummaries, setOpnameEntrySummaries] = useState<Record<string, SoldEntrySummary[]>>({});
  const [premixEntrySummaries, setPremixEntrySummaries] = useState<Record<string, SoldEntrySummary[]>>({});
  const [issueEntrySummaries, setIssueEntrySummaries] = useState<Record<string, SoldEntrySummary[]>>({});
  const [outLineOwners, setOutLineOwners] = useState<Record<string, WorksheetLineOwner>>({});
  const [opnameLineOwners, setOpnameLineOwners] = useState<Record<string, WorksheetLineOwner>>({});
  const [premixLineOwners, setPremixLineOwners] = useState<Record<string, WorksheetLineOwner>>({});
  const [issueLineOwners, setIssueLineOwners] = useState<Record<string, WorksheetLineOwner>>({});
  const [menuIssues, setMenuIssues] = useState<Record<string, MenuIssueLineState>>({});
  const [premixQuantities, setPremixQuantities] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingReceive, setIsSavingReceive] = useState(false);
  const [isSavingOutStock, setIsSavingOutStock] = useState(false);
  const [isSavingOpname, setIsSavingOpname] = useState(false);
  const [isSavingPremix, setIsSavingPremix] = useState(false);
  const [isSavingMenuProgress, setIsSavingMenuProgress] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingResubmit, setIsRequestingResubmit] = useState(false);
  const [isChangingBusinessDate, setIsChangingBusinessDate] = useState(false);
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
  const [typoPreviewEntries, setTypoPreviewEntries] = useState<TypoGuardPreviewEntry[]>([]);
  const [showTestDateControls, setShowTestDateControls] = useState(false);
  const [testBusinessDate, setTestBusinessDate] = useState("");
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null);
  const pendingTypoActionRef = useRef<(() => void) | null>(null);

  const locked = isWorksheetLocked(worksheetStatus ?? undefined);
  const pendingAdminApproval = worksheetStatus === "PENDING_APPROVAL_ADMIN";
  const showResubmitCta = canRequestResubmit(worksheetStatus ?? undefined);
  const canEdit = canEditStaffData(staff?.role);
  const canApproveCorrection = isMasterRole(staff?.role);
  const canFinalizeWorksheet = canApproveCorrection;
  const canOverrideWorksheetOwnership = canApproveCorrection;
  const correctionReasonReady = correctionReason.trim().length >= 5;

  const businessDateLabel = useMemo(
    () => (businessDate ? formatBusinessDateLabel(businessDate) : ""),
    [businessDate]
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const ingredientById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients]
  );

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

  const visibleTabs = useMemo(
    () => (embedded ? TAB_CONFIG : TAB_CONFIG.filter((tab) => worksheetFeatures[tab.id])),
    [embedded, worksheetFeatures]
  );
  const departmentLabel = department === "bar" ? "Bar" : "Kitchen";
  const inventoryTitle = title?.trim() || `Inventory ${departmentLabel}`;
  const moduleCountLabel = `${visibleTabs.length} modul aktif`;

  const outstockHasBlockingErrors = useMemo(
    () => hasOutstockValidationErrors(ingredients, lines),
    [ingredients, lines]
  );

  const isCurrentStaffOwner = useCallback(
    (owner?: WorksheetLineOwner | null) => {
      if (!owner) return true;
      if (!owner.staffId) return true;

      const ownerStaffId = normalizeOwnerText(owner.staffId);
      const currentStaffId = normalizeOwnerText(staff?.id);
      if (ownerStaffId && currentStaffId && ownerStaffId === currentStaffId) return true;

      const ownerName = normalizeOwnerText(owner.staffName);
      const currentName = normalizeOwnerText(staff?.name);
      return Boolean(ownerName && currentName && ownerName === currentName);
    },
    [staff?.id, staff?.name]
  );

  const canEditLineOwner = useCallback(
    (owner?: WorksheetLineOwner | null) =>
      canOverrideWorksheetOwnership || isCurrentStaffOwner(owner),
    [canOverrideWorksheetOwnership, isCurrentStaffOwner]
  );

  const isOwnedByOther = useCallback(
    (owner?: WorksheetLineOwner | null) => Boolean(owner && !canEditLineOwner(owner)),
    [canEditLineOwner]
  );

  const formatOwnerLabel = useCallback(
    (owner?: WorksheetLineOwner | null) => {
      if (!owner) return null;
      if (!owner.staffId) return "Data lama";
      return owner.staffName;
    },
    []
  );

  const currentStaffOwner = useCallback(
    (): WorksheetLineOwner => ({
      staffId: staff?.id ?? null,
      staffName: staff?.name ?? "Staff ini",
      staffRole: staff?.role ?? null,
    }),
    [staff?.id, staff?.name, staff?.role]
  );

  const getPersistedOwner = useCallback(
    (owner?: WorksheetLineOwner | null): WorksheetLineOwner => {
      if (canOverrideWorksheetOwnership && owner) return owner;
      return currentStaffOwner();
    },
    [canOverrideWorksheetOwnership, currentStaffOwner]
  );

  const getPersistedOwnerFromSummaries = useCallback(
    (entries: SoldEntrySummary[]): WorksheetLineOwner => {
      if (!canOverrideWorksheetOwnership) return currentStaffOwner();
      const preferred =
        entries.find((entry) => entry.staffId && !isMasterRole(entry.staffRole)) ??
        entries.find((entry) => entry.staffId) ??
        entries[0];
      if (!preferred) return currentStaffOwner();
      return {
        staffId: preferred.staffId,
        staffName: preferred.staffName,
        staffRole: preferred.staffRole ?? null,
      };
    },
    [canOverrideWorksheetOwnership, currentStaffOwner]
  );

	  const getOpnameBaseStockQtyForIngredient = useCallback(
	    (ingredient: Pick<IngredientRow, "id" | "current_stock">) => {
      const opnameSummaries = opnameEntrySummaries[ingredient.id] ?? [];
      const masterOpnameEntries = opnameSummaries.filter((entry) => isMasterRole(entry.staffRole));
      if (masterOpnameEntries.length > 0) {
        return {
          quantity: masterOpnameEntries.reduce((sum, entry) => sum + entry.quantity, 0),
          source: "opname" as const,
        };
      }

	      const ownDraft = lines[ingredient.id]?.closingStock ?? "";
	      if (canOverrideWorksheetOwnership) {
	        const aggregateOpnameQty = opnameSummaries.reduce(
	          (sum, entry) => sum + entry.quantity,
	          0
	        );
	        const hasOwnDraft = !isBlankQty(ownDraft);
	        if (hasOwnDraft || aggregateOpnameQty > 0) {
	          return {
	            quantity: hasOwnDraft ? parseQty(ownDraft) : aggregateOpnameQty,
	            source: "opname" as const,
	          };
	        }
	      }

	      const otherSavedOpnameQty = opnameSummaries
	        .filter((entry) => !isCurrentStaffOwner({ staffId: entry.staffId, staffName: entry.staffName }))
	        .reduce((sum, entry) => sum + entry.quantity, 0);
	      const ownSavedOpnameQty = opnameSummaries
	        .filter((entry) => isCurrentStaffOwner({ staffId: entry.staffId, staffName: entry.staffName }))
	        .reduce((sum, entry) => sum + entry.quantity, 0);
      const hasOwnDraft = !isBlankQty(ownDraft);
      const hasSavedOpname = otherSavedOpnameQty > 0 || ownSavedOpnameQty > 0;

      if (hasOwnDraft || hasSavedOpname) {
        return {
          quantity: otherSavedOpnameQty + (hasOwnDraft ? parseQty(ownDraft) : ownSavedOpnameQty),
          source: "opname" as const,
        };
      }

      return {
        quantity: Number(ingredient.current_stock ?? 0),
        source: "master" as const,
      };
	    },
	    [canOverrideWorksheetOwnership, isCurrentStaffOwner, lines, opnameEntrySummaries]
	  );

  const summarizeStaffEntry = useCallback(
    (summary: SoldEntrySummary) =>
      `${summary.staffName}: ${formatQty(summary.quantity)}`,
    []
  );

  const getEditableOwnerIds = useCallback(
    (ownerMap: Record<string, WorksheetLineOwner>, lineIds: string[]) => {
      const ids = new Set<string>();
      if (staff?.id) ids.add(staff.id);
      for (const lineId of lineIds) {
        const owner = ownerMap[lineId];
        if (owner?.staffId && (canOverrideWorksheetOwnership || isCurrentStaffOwner(owner))) {
          ids.add(owner.staffId);
        }
      }
      return Array.from(ids);
    },
    [canOverrideWorksheetOwnership, isCurrentStaffOwner, staff?.id]
  );

  const replaceCurrentStaffSummaries = useCallback(
    (
      previous: Record<string, SoldEntrySummary[]>,
      lineIds: string[],
      quantitiesByLineId: Map<string, number>,
      ownersByLineId?: Map<string, WorksheetLineOwner>
    ) => {
      const next = { ...previous };
      for (const lineId of lineIds) {
        const retained = canOverrideWorksheetOwnership
          ? []
          : (next[lineId] ?? []).filter(
              (entry) => !isCurrentStaffOwner({ staffId: entry.staffId, staffName: entry.staffName })
            );
        const quantity = quantitiesByLineId.get(lineId) ?? 0;
        const owner = ownersByLineId?.get(lineId) ?? currentStaffOwner();
        next[lineId] =
          quantity > 0
            ? [...retained, { ...owner, quantity }]
            : retained;
        if (next[lineId].length === 0) delete next[lineId];
      }
      return next;
    },
    [canOverrideWorksheetOwnership, currentStaffOwner, isCurrentStaffOwner]
  );

	  const renderEntrySummaries = useCallback(
	    (entries: SoldEntrySummary[], unit: string, totalLabel = "Akumulasi") => {
      if (entries.length === 0) return null;
      const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);

      return (
        <div className="mt-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="font-medium text-slate-600">{totalLabel}</span>
            <span className="font-semibold tabular-nums text-teal-700">
              {formatQty(total)} {unit}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {entries.map((entry, index) => {
              const ownEntry = isCurrentStaffOwner({
                staffId: entry.staffId,
                staffName: entry.staffName,
              });
              return (
                <span
                  key={`${entry.staffId ?? entry.staffName}-${index}`}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    ownEntry
                      ? "bg-teal-50 text-teal-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {summarizeStaffEntry(entry)} {unit}
                </span>
              );
            })}
          </div>
        </div>
      );
    },
	    [isCurrentStaffOwner, summarizeStaffEntry]
	  );

	  const editableSummaryQuantity = useCallback(
	    (entries: SoldEntrySummary[]) =>
	      entries
	        .filter((entry) =>
	          canOverrideWorksheetOwnership ||
	          isCurrentStaffOwner({ staffId: entry.staffId, staffName: entry.staffName })
	        )
	        .reduce((sum, entry) => sum + entry.quantity, 0),
	    [canOverrideWorksheetOwnership, isCurrentStaffOwner]
	  );

  const getPendingReceiveStockDeltaForIngredient = useCallback(
    (ingredient: Pick<IngredientRow, "id" | "purchase_to_stock_factor">) => {
      const savedInputQty = editableSummaryQuantity(receiveEntrySummaries[ingredient.id] ?? []);
      const pendingInputQty = parseQty(receiveEntryInputs[ingredient.id] ?? "");
      return receiveInputToStockQty(ingredient, String(pendingInputQty - savedInputQty));
    },
    [editableSummaryQuantity, receiveEntryInputs, receiveEntrySummaries]
  );

	  const shouldShowPreviewEntry = useCallback(
	    (rawValue: string | undefined, savedQty: number) =>
	      Boolean(rawValue?.trim()) || savedQty > 0,
	    []
	  );

	  const buildReceivePreviewEntries = useCallback((): TypoGuardPreviewEntry[] => {
	    return ingredients
	      .filter((ing) => ing.kind === "raw")
	      .flatMap((ing) => {
	        const raw = receiveEntryInputs[ing.id] ?? "";
	        const savedQty = editableSummaryQuantity(receiveEntrySummaries[ing.id] ?? []);
	        if (!shouldShowPreviewEntry(raw, savedQty)) return [];

	        const purchaseUnit = getPurchaseUnit(ing);
	        const value = parseQty(raw);
	        const totalReceiveQty = parseQty(lines[ing.id]?.inQty ?? "");
	        const afterSaveReceiveQty = Math.max(0, totalReceiveQty - savedQty + value);
	        const stockQty = receiveInputToStockQty(ing, raw);
	        const noteParts = [`Total: ${formatQty(afterSaveReceiveQty)} ${purchaseUnit}`];
	        if (purchaseUnit !== ing.unit) {
	          noteParts.push(`Stok: ${formatQty(stockQty)} ${ing.unit}`);
	        }

	        return [
	          {
	            ingredientId: ing.id,
	            ingredientName: ing.name,
	            field: "inQty" as const,
	            value,
	            unit: purchaseUnit,
	            note: noteParts.join(" · "),
	          },
	        ];
	      });
	  }, [
	    editableSummaryQuantity,
	    ingredients,
	    lines,
	    receiveEntryInputs,
	    receiveEntrySummaries,
	    shouldShowPreviewEntry,
	  ]);

	  const buildLinePreviewEntries = useCallback(
	    (
	      field: "outQty" | "closingStock",
	      summaries: Record<string, SoldEntrySummary[]>
	    ): TypoGuardPreviewEntry[] =>
	      ingredients.flatMap((ing) => {
	        const raw = lines[ing.id]?.[field] ?? "";
	        const savedQty = editableSummaryQuantity(summaries[ing.id] ?? []);
	        if (!shouldShowPreviewEntry(raw, savedQty)) return [];

	        const line = lines[ing.id] ?? DEFAULT_LINE;
	        const note =
	          field === "outQty" && line.outNote.trim()
	            ? `Catatan: ${line.outNote.trim()}`
	            : undefined;

	        return [
	          {
	            ingredientId: ing.id,
	            ingredientName: ing.name,
	            field,
	            value: parseQty(raw),
	            unit: ing.unit,
	            note,
	          },
	        ];
	      }),
	    [editableSummaryQuantity, ingredients, lines, shouldShowPreviewEntry]
	  );

	  const buildPremixPreviewEntries = useCallback((): TypoGuardPreviewEntry[] => {
	    return premixItems.flatMap((premix) => {
	      const raw = premixQuantities[premix.id] ?? "";
	      const savedQty = editableSummaryQuantity(premixEntrySummaries[premix.id] ?? []);
	      if (!shouldShowPreviewEntry(raw, savedQty)) return [];

	      const qty = parseQty(raw);
	      const recipe = getActivePremixRecipe(premix);
	      const outputQty = qty * Number(recipe?.yield_quantity ?? 1);
	      return [
	        {
	          ingredientId: premix.id,
	          ingredientName: premix.name,
	          field: "premix" as const,
	          value: qty,
	          unit: "batch",
	          note: recipe ? `Output: ${formatQty(outputQty)} ${premix.unit}` : "Belum ada resep",
	        },
	      ];
	    });
	  }, [
	    editableSummaryQuantity,
	    premixEntrySummaries,
	    premixItems,
	    premixQuantities,
	    shouldShowPreviewEntry,
	  ]);

	  const buildIssuePreviewEntries = useCallback((): TypoGuardPreviewEntry[] => {
	    return menus.flatMap((menu) => {
	      const issue = menuIssues[menu.id] ?? createDefaultMenuIssue();
	      const raw = issue.quantity;
	      const savedQty = editableSummaryQuantity(issueEntrySummaries[menu.id] ?? []);
	      if (!shouldShowPreviewEntry(raw, savedQty)) return [];

	      const noteParts = [formatIssueReasonLabel(issue.reason)];
	      if (issue.note.trim()) noteParts.push(issue.note.trim());
	      const photoCount = splitStoredPhotoValue(issue.photoUrl).length;
	      if (photoCount > 0) noteParts.push(`${photoCount} foto`);

	      return [
	        {
	          ingredientId: menu.id,
	          ingredientName: menu.menu_name,
	          field: "issue" as const,
	          value: parseQty(raw),
	          unit: "porsi",
	          note: noteParts.join(" · "),
	        },
	      ];
	    });
	  }, [editableSummaryQuantity, issueEntrySummaries, menuIssues, menus, shouldShowPreviewEntry]);

	  const buildSoldPreviewEntries = useCallback((): TypoGuardPreviewEntry[] => {
	    return menus.flatMap((menu) => {
	      const raw = soldItems[menu.id] ?? "";
	      const savedQty = editableSummaryQuantity(soldEntrySummaries[menu.id] ?? []);
	      if (!shouldShowPreviewEntry(raw, savedQty)) return [];

	      return [
	        {
	          ingredientId: menu.id,
	          ingredientName: menu.menu_name,
	          field: "sold" as const,
	          value: parseQty(raw),
	          unit: "porsi",
	        },
	      ];
	    });
	  }, [editableSummaryQuantity, menus, shouldShowPreviewEntry, soldEntrySummaries, soldItems]);

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

  const refreshReceiveEntrySummaries = useCallback(
    async (activeSessionId: string) => {
      const { data, error: receiveEntryErr } = await supabase
        .from("worksheet_receive_entry")
        .select("ingredient_id, staff_id, quantity, staff:staff_id ( name, role )")
        .eq("session_id", activeSessionId);

      if (receiveEntryErr) {
        throw new Error(`Gagal memuat detail receive staff: ${receiveEntryErr.message}`);
      }

      const nextSummaries: Record<string, SoldEntrySummary[]> = {};
      const quantityByIngredientAndStaff = new Map<string, SoldEntrySummary>();
      const currentStaffInputs: Record<string, string> = {};

      for (const row of (data ?? []) as unknown as ReceiveEntryJoined[]) {
        const quantity = Number(row.quantity ?? 0);
        if (quantity <= 0) continue;
        const staffRaw = row.staff;
        const rowStaff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
        const summary: SoldEntrySummary = {
          staffId: row.staff_id,
          staffName: rowStaff?.name ?? "Staff lama / tidak tercatat",
          staffRole: rowStaff?.role ?? null,
          quantity,
        };
        const key = `${row.ingredient_id}:${summary.staffId ?? summary.staffName}`;
        const existing = quantityByIngredientAndStaff.get(key);
        quantityByIngredientAndStaff.set(key, {
          ...summary,
          quantity: (existing?.quantity ?? 0) + quantity,
        });
      }

	      for (const [key, summary] of quantityByIngredientAndStaff.entries()) {
	        const ingredientId = key.split(":")[0];
	        nextSummaries[ingredientId] = [...(nextSummaries[ingredientId] ?? []), summary];
	        if (canOverrideWorksheetOwnership) {
	          const previous = parseQty(currentStaffInputs[ingredientId] ?? "");
	          currentStaffInputs[ingredientId] = formatQty(previous + summary.quantity);
	        } else if (isCurrentStaffOwner({ staffId: summary.staffId, staffName: summary.staffName })) {
	          currentStaffInputs[ingredientId] = formatQty(summary.quantity);
	        }
	      }

      setReceiveEntrySummaries(nextSummaries);
      return currentStaffInputs;
    },
	    [canOverrideWorksheetOwnership, isCurrentStaffOwner, supabase]
	  );

  const refreshOpnameEntrySummaries = useCallback(
    async (activeSessionId: string) => {
      const { data, error: opnameEntryErr } = await supabase
        .from("worksheet_opname_line")
        .select("ingredient_id, closing_stock, staff_id, staff:staff_id ( name, role )")
        .eq("session_id", activeSessionId);

      if (opnameEntryErr) {
        throw new Error(`Gagal memuat detail opname staff: ${opnameEntryErr.message}`);
      }

      const nextSummaries: Record<string, SoldEntrySummary[]> = {};
      for (const row of (data ?? []) as unknown as OpnameLineJoined[]) {
        const quantity = Number(row.closing_stock);
        const owner = resolveLineOwner(row);
        nextSummaries[row.ingredient_id] = [
          ...(nextSummaries[row.ingredient_id] ?? []),
          { staffId: owner.staffId, staffName: owner.staffName, staffRole: owner.staffRole, quantity },
        ];
      }

      return nextSummaries;
    },
    [supabase]
  );

  const refreshLiveWorksheetSummaries = useCallback(
    async (activeSessionId: string) => {
      await Promise.all([
        refreshIngredientStockFromDb(),
        refreshReceiveEntrySummaries(activeSessionId),
      ]);

      const [
        outResult,
        soldResult,
        issueResult,
        premixResult,
        opnameSummaries,
      ] = await Promise.all([
        supabase
          .from("worksheet_out_line")
          .select("ingredient_id, quantity, staff_id, staff:staff_id ( name, role )")
          .eq("session_id", activeSessionId),
        supabase
          .from("worksheet_sold_entry")
          .select("menu_item_id, staff_id, quantity_sold, staff:staff_id ( name, role )")
          .eq("session_id", activeSessionId),
        supabase
          .from("worksheet_menu_issue_line")
          .select("menu_item_id, quantity, staff_id, staff:staff_id ( name, role )")
          .eq("session_id", activeSessionId),
        supabase
          .from("worksheet_premix_line")
          .select("output_ingredient_id, batch_quantity, staff_id, staff:staff_id ( name, role )")
          .eq("session_id", activeSessionId),
        refreshOpnameEntrySummaries(activeSessionId),
      ]);

      if (outResult.error) {
        throw new Error(`Gagal memuat update out stock: ${outResult.error.message}`);
      }
      if (soldResult.error) {
        throw new Error(`Gagal memuat update menu terjual: ${soldResult.error.message}`);
      }
      if (issueResult.error) {
        throw new Error(`Gagal memuat update issue menu: ${issueResult.error.message}`);
      }
      if (premixResult.error) {
        throw new Error(`Gagal memuat update premix: ${premixResult.error.message}`);
      }

      const nextOutOwners: Record<string, WorksheetLineOwner> = {};
      const nextOutSummaries: Record<string, SoldEntrySummary[]> = {};
      for (const row of (outResult.data ?? []) as unknown as OutLineJoined[]) {
        const quantity = Number(row.quantity);
        if (quantity <= 0) continue;
        const owner = resolveLineOwner(row);
        nextOutSummaries[row.ingredient_id] = [
          ...(nextOutSummaries[row.ingredient_id] ?? []),
          { staffId: owner.staffId, staffName: owner.staffName, staffRole: owner.staffRole, quantity },
        ];
        if (canEditLineOwner(owner)) {
          nextOutOwners[row.ingredient_id] = preferWorksheetOwner(
            nextOutOwners[row.ingredient_id],
            owner
          );
        }
      }

      const nextSoldSummaries: Record<string, SoldEntrySummary[]> = {};
      for (const row of (soldResult.data ?? []) as unknown as SoldEntryJoined[]) {
        const quantity = Number(row.quantity_sold ?? 0);
        if (quantity <= 0) continue;
        const staffRaw = row.staff;
        const rowStaff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
        nextSoldSummaries[row.menu_item_id] = [
          ...(nextSoldSummaries[row.menu_item_id] ?? []),
          {
            staffId: row.staff_id,
            staffName: rowStaff?.name ?? "Staff lama / tidak tercatat",
            staffRole: rowStaff?.role ?? null,
            quantity,
          },
        ];
      }

      const nextIssueOwners: Record<string, WorksheetLineOwner> = {};
      const nextIssueSummaries: Record<string, SoldEntrySummary[]> = {};
      for (const row of (issueResult.data ?? []) as unknown as IssueLineJoined[]) {
        const quantity = Number(row.quantity);
        if (quantity <= 0) continue;
        const owner = resolveLineOwner(row);
        nextIssueSummaries[row.menu_item_id] = [
          ...(nextIssueSummaries[row.menu_item_id] ?? []),
          { staffId: owner.staffId, staffName: owner.staffName, staffRole: owner.staffRole, quantity },
        ];
        if (canEditLineOwner(owner)) {
          nextIssueOwners[row.menu_item_id] = preferWorksheetOwner(
            nextIssueOwners[row.menu_item_id],
            owner
          );
        }
      }

      const nextPremixOwners: Record<string, WorksheetLineOwner> = {};
      const nextPremixSummaries: Record<string, SoldEntrySummary[]> = {};
      for (const row of (premixResult.data ?? []) as unknown as PremixLineJoined[]) {
        const quantity = Number(row.batch_quantity);
        if (quantity <= 0) continue;
        const owner = resolveLineOwner(row);
        nextPremixSummaries[row.output_ingredient_id] = [
          ...(nextPremixSummaries[row.output_ingredient_id] ?? []),
          { staffId: owner.staffId, staffName: owner.staffName, staffRole: owner.staffRole, quantity },
        ];
        if (canEditLineOwner(owner)) {
          nextPremixOwners[row.output_ingredient_id] = preferWorksheetOwner(
            nextPremixOwners[row.output_ingredient_id],
            owner
          );
        }
      }

      setOutLineOwners(nextOutOwners);
      setOutEntrySummaries(nextOutSummaries);
      setSoldEntrySummaries(nextSoldSummaries);
      setIssueLineOwners(nextIssueOwners);
      setIssueEntrySummaries(nextIssueSummaries);
      setPremixLineOwners(nextPremixOwners);
      setPremixEntrySummaries(nextPremixSummaries);
      setOpnameEntrySummaries(opnameSummaries);
    },
    [
      canEditLineOwner,
      refreshIngredientStockFromDb,
      refreshOpnameEntrySummaries,
      refreshReceiveEntrySummaries,
      supabase,
    ]
  );

  const loadData = useCallback(async (dateOverride?: string) => {
    if (!staff) return;

    setIsLoading(true);
    setError(null);

    const date = dateOverride ?? selectedBusinessDate;
    setBusinessDate(date);
    setTestBusinessDate(date);
    setSelectedBusinessDate(date);
    setEditRequest(null);

    const nextFeatures = { ...DEFAULT_WORKSHEET_FEATURES };
    if (!embedded) {
      const { data: featureRows } = await supabase
        .from("role_task_setting")
        .select("task_id, is_enabled")
        .eq("role", staff.role);

      const roleTaskMap = mergeRoleTaskSettings(staff.role, featureRows ?? []);

      for (const tab of TAB_CONFIG) {
        const taskId = WORKSHEET_TAB_TASK_ID[tab.id];
        nextFeatures[tab.id] = isRoleTaskEnabled(roleTaskMap, staff.role, taskId);
      }
    }
    setWorksheetFeatures(nextFeatures);
    setActiveTab((current) => {
      if (nextFeatures[current]) return current;
      const firstEnabled = TAB_CONFIG.find((tab) => nextFeatures[tab.id]);
      return firstEnabled?.id ?? current;
    });

    const { error: dayErr } = await supabase
      .from("business_day")
      .upsert({ business_date: date }, { onConflict: "business_date", ignoreDuplicates: true });
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

    const staffRoleForDepartment = department === "bar" ? "bar_staff" : "kitchen_staff";
    const { data: staffRows, error: staffErr } = await supabase
      .from("staff")
      .select("id, name, role, department")
      .eq("is_active", true)
      .eq("role", staffRoleForDepartment)
      .order("name", { ascending: true });

    if (staffErr) {
      setError(staffErr.message);
      setIsLoading(false);
      return;
    }

    setDepartmentStaffOptions((staffRows ?? []) as DepartmentStaffOption[]);

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

    if (ws?.id && staff.id) {
      const { data: requestRow } = await supabase
        .from("worksheet_edit_request")
        .select("id, reason, status, created_at")
        .eq("session_id", ws.id)
        .eq("requested_by_staff_id", staff.id)
        .eq("status", "PENDING")
        .maybeSingle();

      setEditRequest(requestRow ?? null);
    }

    const ingredientPreset: Record<string, Partial<IngredientLineState>> = {};
    const soldPreset: Record<string, string> = {};
    const issuePreset: Record<string, MenuIssueLineState> = {};
    const premixPreset: Record<string, string> = {};
    let receivePreset: Record<string, string> = {};
    setReceiveEntrySummaries({});
    setSoldEntrySummaries({});
    setOutEntrySummaries({});
    setOpnameEntrySummaries({});
    setPremixEntrySummaries({});
    setIssueEntrySummaries({});
    setOutLineOwners({});
    setOpnameLineOwners({});
    setPremixLineOwners({});
    setIssueLineOwners({});

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

      try {
        receivePreset = await refreshReceiveEntrySummaries(ws.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memuat detail receive staff.");
      }

      const { data: outLines } = await supabase
        .from("worksheet_out_line")
        .select("ingredient_id, quantity, note, outflow_type, loss_responsibility_scope, responsible_staff_id, photo_url, photo_public_id, staff_id, staff:staff_id ( name, role )")
        .eq("session_id", ws.id);

      const nextOutOwners: Record<string, WorksheetLineOwner> = {};
      const nextOutSummaries: Record<string, SoldEntrySummary[]> = {};
      for (const row of (outLines ?? []) as unknown as OutLineJoined[]) {
        const quantity = Number(row.quantity);
        if (quantity <= 0) continue;
        const owner = resolveLineOwner(row);
        nextOutSummaries[row.ingredient_id] = [
          ...(nextOutSummaries[row.ingredient_id] ?? []),
          { staffId: owner.staffId, staffName: owner.staffName, staffRole: owner.staffRole, quantity },
        ];
	        if (canEditLineOwner(owner)) {
	          const existingOutQty = ingredientPreset[row.ingredient_id]?.outQty ?? "";
	          ingredientPreset[row.ingredient_id] = {
	            ...ingredientPreset[row.ingredient_id],
	            outQty: canOverrideWorksheetOwnership
	              ? String(parseQty(existingOutQty) + quantity)
	              : String(row.quantity),
	            outNote: row.note ?? "",
              outflowType: row.outflow_type ?? "operational",
              outResponsibilityScope: row.loss_responsibility_scope ?? "unknown",
              outResponsibleStaffId:
                row.outflow_type === "spoil" && row.loss_responsibility_scope === "staff"
                  ? row.responsible_staff_id ?? ""
                  : "",
	            outPhotoUrl: row.photo_url ?? "",
	            outPhotoPublicId: row.photo_public_id ?? "",
          };
          nextOutOwners[row.ingredient_id] = preferWorksheetOwner(
            nextOutOwners[row.ingredient_id],
            owner
          );
        }
      }
      setOutLineOwners(nextOutOwners);
      setOutEntrySummaries(nextOutSummaries);

      const { data: soldEntries, error: soldEntryErr } = await supabase
        .from("worksheet_sold_entry")
        .select("menu_item_id, staff_id, quantity_sold, staff:staff_id ( name, role )")
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
              staffRole: rowStaff?.role ?? null,
              quantity,
            },
          ];

	          if (canOverrideWorksheetOwnership) {
	            soldPreset[row.menu_item_id] = String(
	              parseQty(soldPreset[row.menu_item_id] ?? "") + quantity
	            );
	          } else if (row.staff_id === staff.id) {
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
              staffRole: null,
              quantity,
            },
          ];
        }
      }

      setSoldEntrySummaries(soldSummaries);

      const { data: issueLines } = await supabase
        .from("worksheet_menu_issue_line")
        .select("menu_item_id, quantity, reason, note, loss_responsibility_scope, responsible_staff_id, photo_url, photo_public_id, staff_id, staff:staff_id ( name, role )")
        .eq("session_id", ws.id);

      const nextIssueOwners: Record<string, WorksheetLineOwner> = {};
      const nextIssueSummaries: Record<string, SoldEntrySummary[]> = {};
      for (const row of (issueLines ?? []) as unknown as IssueLineJoined[]) {
        const quantity = Number(row.quantity);
        if (quantity <= 0) continue;
        const owner = resolveLineOwner(row);
        nextIssueSummaries[row.menu_item_id] = [
          ...(nextIssueSummaries[row.menu_item_id] ?? []),
          { staffId: owner.staffId, staffName: owner.staffName, staffRole: owner.staffRole, quantity },
        ];
	        if (canEditLineOwner(owner)) {
	          const existingIssue = issuePreset[row.menu_item_id] ?? createDefaultMenuIssue();
	          issuePreset[row.menu_item_id] = {
            quantity: canOverrideWorksheetOwnership
              ? String(parseQty(existingIssue.quantity) + quantity)
              : String(row.quantity),
            reason: normalizeIssueReason(row.reason),
            note: row.note ?? "",
            lossResponsibilityScope: row.loss_responsibility_scope ?? "unknown",
            responsibleStaffId:
              row.loss_responsibility_scope === "staff" ? row.responsible_staff_id ?? "" : "",
            photoUrl: row.photo_url ?? "",
            photoPublicId: row.photo_public_id ?? "",
          };
          nextIssueOwners[row.menu_item_id] = preferWorksheetOwner(
            nextIssueOwners[row.menu_item_id],
            owner
          );
        }
      }
      setIssueLineOwners(nextIssueOwners);
      setIssueEntrySummaries(nextIssueSummaries);

      const { data: premixLines } = await supabase
        .from("worksheet_premix_line")
        .select("output_ingredient_id, batch_quantity, staff_id, staff:staff_id ( name, role )")
        .eq("session_id", ws.id);

      const nextPremixOwners: Record<string, WorksheetLineOwner> = {};
      const nextPremixSummaries: Record<string, SoldEntrySummary[]> = {};
      for (const row of (premixLines ?? []) as unknown as PremixLineJoined[]) {
        const quantity = Number(row.batch_quantity);
        if (quantity <= 0) continue;
        const owner = resolveLineOwner(row);
        nextPremixSummaries[row.output_ingredient_id] = [
          ...(nextPremixSummaries[row.output_ingredient_id] ?? []),
          { staffId: owner.staffId, staffName: owner.staffName, staffRole: owner.staffRole, quantity },
        ];
	        if (canEditLineOwner(owner)) {
	          premixPreset[row.output_ingredient_id] = canOverrideWorksheetOwnership
	            ? String(parseQty(premixPreset[row.output_ingredient_id] ?? "") + quantity)
	            : String(row.batch_quantity);
	          nextPremixOwners[row.output_ingredient_id] = preferWorksheetOwner(
	            nextPremixOwners[row.output_ingredient_id],
	            owner
	          );
	        }
      }
      setPremixLineOwners(nextPremixOwners);
      setPremixEntrySummaries(nextPremixSummaries);

      const { data: opnameLines } = await supabase
        .from("worksheet_opname_line")
        .select("ingredient_id, closing_stock, staff_id, staff:staff_id ( name, role )")
        .eq("session_id", ws.id);

      const nextOpnameOwners: Record<string, WorksheetLineOwner> = {};
      const nextOpnameSummaries: Record<string, SoldEntrySummary[]> = {};
      for (const row of (opnameLines ?? []) as unknown as OpnameLineJoined[]) {
        const quantity = Number(row.closing_stock);
        const owner = resolveLineOwner(row);
        nextOpnameSummaries[row.ingredient_id] = [
          ...(nextOpnameSummaries[row.ingredient_id] ?? []),
          { staffId: owner.staffId, staffName: owner.staffName, staffRole: owner.staffRole, quantity },
        ];
	        if (canEditLineOwner(owner)) {
	          ingredientPreset[row.ingredient_id] = {
	            ...ingredientPreset[row.ingredient_id],
	            closingStock: String(row.closing_stock),
          };
          nextOpnameOwners[row.ingredient_id] = preferWorksheetOwner(
            nextOpnameOwners[row.ingredient_id],
            owner
          );
        }
      }
      setOpnameLineOwners(nextOpnameOwners);
      setOpnameEntrySummaries(nextOpnameSummaries);

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
    setReceiveEntryInputs(receivePreset);
    initSoldItems(menuList, soldPreset);
    setMenuIssues(issuePreset);
    initPremixQuantities(premixList, premixPreset);
    setIsLoading(false);
	  }, [
    canEditLineOwner,
    canOverrideWorksheetOwnership,
    department,
    embedded,
    initIngredientLines,
    initPremixQuantities,
    initSoldItems,
    isCurrentStaffOwner,
    refreshReceiveEntrySummaries,
    selectedBusinessDate,
    staff,
    supabase,
  ]);

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
    if (!staff) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        if (sessionId) {
          await refreshLiveWorksheetSummaries(sessionId);
        } else {
          await refreshIngredientStockFromDb();
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Gagal memuat update worksheet.");
        }
      }
    };

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshIngredientStockFromDb, refreshLiveWorksheetSummaries, sessionId, staff]);

  useWorksheetDraft({
    department,
    businessDate,
    isLoading,
    locked,
	    lines,
	    soldItems,
	    premixQuantities,
	    menuIssues,
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
	      setMenuIssues(normalizeRestoredMenuIssues(draft.menuIssues ?? {}));
	      setActiveTab(draft.activeTab);
	      showSuccessToast("Draft lokal dipulihkan setelah refresh.");
    },
  });

	  const runWithPreviewConfirm = (
	    warnings: TypoGuardWarning[],
	    previewEntries: TypoGuardPreviewEntry[],
	    action: () => void | Promise<void>
	  ) => {
	    if (warnings.length === 0 && previewEntries.length === 0) {
	      void action();
	      return;
    }
    setTypoWarnings(warnings);
    setTypoPreviewEntries(previewEntries);
	    pendingTypoActionRef.current = () => void action();
	    setTypoModalOpen(true);
	  };

	  const runWithTypoGuard = (
	    fields: Array<keyof Pick<IngredientLineState, "inQty" | "closingStock" | "outQty">>,
	    previewEntries: TypoGuardPreviewEntry[],
	    action: () => void | Promise<void>
	  ) => {
	    const warnings = findTypoGuardWarnings(ingredients, lines, fields);
	    runWithPreviewConfirm(warnings, previewEntries, action);
	  };

  const buildAllWorksheetPreviewEntries = useCallback(
    () => [
      ...buildReceivePreviewEntries(),
      ...buildLinePreviewEntries("outQty", outEntrySummaries),
      ...buildLinePreviewEntries("closingStock", opnameEntrySummaries),
      ...buildPremixPreviewEntries(),
      ...buildIssuePreviewEntries(),
      ...buildSoldPreviewEntries(),
    ],
    [
      buildIssuePreviewEntries,
      buildLinePreviewEntries,
      buildPremixPreviewEntries,
      buildReceivePreviewEntries,
      buildSoldPreviewEntries,
      opnameEntrySummaries,
      outEntrySummaries,
    ]
  );

  const clearDraftAfterSuccess = () => {
    if (businessDate) clearWorksheetDraft(department, businessDate);
  };

  const applyTestBusinessDate = async () => {
    const next = testBusinessDate.trim();
    if (!isIsoDate(next)) {
      showPlainErrorToast("Tanggal worksheet harus format YYYY-MM-DD.");
      return;
    }
    setIsChangingBusinessDate(true);
    try {
      if (canUseTestBusinessDate()) {
        window.localStorage.setItem(TEST_BUSINESS_DATE_STORAGE_KEY, next);
      }
      await loadData(next);
      showSuccessToast(`Worksheet pindah ke business date ${formatBusinessDateLabel(next)}.`);
    } finally {
      setIsChangingBusinessDate(false);
    }
  };

  const clearTestBusinessDate = async () => {
    const liveDate = resolveBusinessDate();
    setIsChangingBusinessDate(true);
    try {
      window.localStorage.removeItem(TEST_BUSINESS_DATE_STORAGE_KEY);
      setTestBusinessDate(liveDate);
      await loadData(liveDate);
      showSuccessToast(`Kembali ke business date live ${formatBusinessDateLabel(liveDate)}.`);
    } finally {
      setIsChangingBusinessDate(false);
    }
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
    if (locked || isOwnedByOther(opnameLineOwners[ingredientId])) return;
    setLines((prev) => ({
      ...prev,
      [ingredientId]: { ...(prev[ingredientId] ?? DEFAULT_LINE), closingStock: value },
    }));
  };

  const updateOutQty = (ingredientId: string, value: string) => {
    if (locked || isOwnedByOther(outLineOwners[ingredientId])) return;
    setLines((prev) => ({
      ...prev,
      [ingredientId]: { ...(prev[ingredientId] ?? DEFAULT_LINE), outQty: value },
    }));
  };

  const updateOutNote = (ingredientId: string, value: string) => {
    if (locked || isOwnedByOther(outLineOwners[ingredientId])) return;
    setLines((prev) => ({
      ...prev,
      [ingredientId]: { ...(prev[ingredientId] ?? DEFAULT_LINE), outNote: value },
    }));
  };

  const updateOutflowType = (ingredientId: string, isSpoil: boolean) => {
    if (locked || isOwnedByOther(outLineOwners[ingredientId])) return;
    setLines((prev) => {
      const current = prev[ingredientId] ?? DEFAULT_LINE;
      return {
        ...prev,
        [ingredientId]: {
          ...current,
          outflowType: isSpoil ? "spoil" : "operational",
          outResponsibilityScope: isSpoil ? current.outResponsibilityScope : "unknown",
          outResponsibleStaffId: isSpoil ? current.outResponsibleStaffId : "",
        },
      };
    });
  };

  const updateOutResponsibility = (ingredientId: string, value: string) => {
    if (locked || isOwnedByOther(outLineOwners[ingredientId])) return;
    const nextScope: LossResponsibilityScope = value.startsWith("staff:") ? "staff" : value === "general" ? "general" : "unknown";
    const nextStaffId = nextScope === "staff" ? value.replace("staff:", "") : "";
    setLines((prev) => ({
      ...prev,
      [ingredientId]: {
        ...(prev[ingredientId] ?? DEFAULT_LINE),
        outResponsibilityScope: nextScope,
        outResponsibleStaffId: nextStaffId,
      },
    }));
  };

  const appendOutPhotos = (ingredientId: string, photos: WorksheetPhoto[]) => {
    if (photos.length === 0) return;
    if (locked || isOwnedByOther(outLineOwners[ingredientId])) return;
    setLines((prev) => ({
      ...prev,
      [ingredientId]: {
        ...(prev[ingredientId] ?? DEFAULT_LINE),
        ...appendStoredPhotos(
          prev[ingredientId]?.outPhotoUrl,
          prev[ingredientId]?.outPhotoPublicId,
          photos
        ),
      },
    }));
  };

  const removeOutPhoto = (ingredientId: string, photoIndex: number) => {
    if (locked || isOwnedByOther(outLineOwners[ingredientId])) return;
    setLines((prev) => {
      const current = prev[ingredientId] ?? DEFAULT_LINE;
      return {
        ...prev,
        [ingredientId]: {
          ...current,
          ...removeStoredPhotoAt(current.outPhotoUrl, current.outPhotoPublicId, photoIndex),
        },
      };
    });
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

    const rawIngredients = ingredients.filter((ing) => ing.kind === "raw");
    const rawIngredientIds = rawIngredients.map((ing) => ing.id);
    const previousOwnReceive = new Map<string, number>();

	    if (rawIngredientIds.length > 0) {
	      const previousQuery = supabase
	        .from("worksheet_receive_entry")
	        .select("ingredient_id, quantity")
	        .eq("session_id", activeSessionId)
	        .in("ingredient_id", rawIngredientIds);
	      const { data: previousRows, error: previousErr } = canOverrideWorksheetOwnership
	        ? await previousQuery
	        : await previousQuery.eq("staff_id", staff.id);

      if (previousErr) {
        throw new Error(`Gagal membaca receive sebelumnya: ${previousErr.message}`);
      }

      for (const row of previousRows ?? []) {
        previousOwnReceive.set(
          row.ingredient_id,
          (previousOwnReceive.get(row.ingredient_id) ?? 0) + Number(row.quantity ?? 0)
        );
      }
    }

    const entryPayload = rawIngredients
      .map((ing) => {
        const owner = getPersistedOwnerFromSummaries(receiveEntrySummaries[ing.id] ?? []);
        return {
          session_id: activeSessionId,
          ingredient_id: ing.id,
          staff_id: owner.staffId,
          quantity: parseQty(receiveEntryInputs[ing.id] ?? ""),
        };
      })
      .filter((row) => row.quantity > 0);
    const nextOwnReceive = new Map(
      entryPayload.map((row) => [row.ingredient_id, row.quantity])
    );
    const deltaByIngredient = new Map<string, number>();

	    if (rawIngredientIds.length > 0) {
	      const clearQuery = supabase
	        .from("worksheet_receive_entry")
	        .delete()
	        .eq("session_id", activeSessionId)
	        .in("ingredient_id", rawIngredientIds);
	      const { error: clearOwnErr } = canOverrideWorksheetOwnership
	        ? await clearQuery
	        : await clearQuery.eq("staff_id", staff.id);

      if (clearOwnErr) {
        throw new Error(`Gagal membersihkan receive milik staff ini: ${clearOwnErr.message}`);
      }
    }

    if (entryPayload.length > 0) {
      const { error: insertErr } = await supabase
        .from("worksheet_receive_entry")
        .insert(entryPayload);

      if (insertErr) {
        throw new Error(`Gagal menyimpan entry receive: ${insertErr.message}`);
      }
    }

    for (const ing of rawIngredients) {
      const previousQty = previousOwnReceive.get(ing.id) ?? 0;
      const nextQty = nextOwnReceive.get(ing.id) ?? 0;
      const deltaPurchaseQty = nextQty - previousQty;
      const deltaStockQty = receiveInputToStockQty(ing, String(deltaPurchaseQty));
      if (deltaStockQty !== 0) deltaByIngredient.set(ing.id, deltaStockQty);
    }

    if (deltaByIngredient.size > 0) {
      const { data: stockRows, error: stockErr } = await supabase
        .from("ingredient")
        .select("id, name, current_stock")
        .in("id", Array.from(deltaByIngredient.keys()));

      if (stockErr) {
        throw new Error(`Receive tersimpan, tapi stok admin gagal dibaca: ${stockErr.message}`);
      }

      const stockUpdateResults = await Promise.all(
        (stockRows ?? []).map((row) => {
          const delta = deltaByIngredient.get(row.id) ?? 0;
          const nextStock = Math.max(0, Number(row.current_stock ?? 0) + delta);
          return supabase.from("ingredient").update({ current_stock: nextStock }).eq("id", row.id);
        })
      );
      const stockUpdateErr = stockUpdateResults.find((result) => result.error)?.error;
      if (stockUpdateErr) {
        throw new Error(
          `Receive tersimpan, tapi stok admin gagal diupdate: ${stockUpdateErr.message}`
        );
      }

      const logPayload = (stockRows ?? []).flatMap((row) => {
        const delta = deltaByIngredient.get(row.id) ?? 0;
        if (delta === 0) return [];
        const before = Number(row.current_stock ?? 0);
        const after = Math.max(0, before + delta);
        return [
          {
            ingredient_id: row.id,
            business_date: businessDate || resolveWorksheetBusinessDate(),
            event_type: "RECEIVE" as const,
            qty_before: before,
            qty_after: after,
            reason: "receive saved from worksheet",
            message: `Receive ${row.name}: ${before} -> ${after}`,
            worksheet_session_id: activeSessionId,
            created_by_staff_id: staff.id,
          },
        ];
      });

      if (logPayload.length > 0) {
        const { error: logErr } = await supabase.from("stock_log").insert(logPayload);
        if (logErr) {
          throw new Error(`Stok admin terupdate, tapi audit log receive gagal: ${logErr.message}`);
        }
      }

      setIngredients((prev) =>
        prev.map((ing) => {
          const delta = deltaByIngredient.get(ing.id) ?? 0;
          if (delta === 0) return ing;
          return { ...ing, current_stock: Math.max(0, Number(ing.current_stock ?? 0) + delta) };
        })
      );
    }

    const totals = await syncReceiveAggregate(activeSessionId);
    const ownInputs = await refreshReceiveEntrySummaries(activeSessionId);
    setReceiveEntryInputs(ownInputs);
    return totals;
  };

  const syncWorksheetFinalMonitoringData = async (
    activeSessionId: string,
    date: string,
    submittingStaffId: string,
    options: { writeClosingLog?: boolean; strictOutstockOpname?: boolean } = {}
  ): Promise<ReturnType<typeof evaluateOpnameSubmission>> => {
    const receiveTotals = await syncReceiveAggregate(activeSessionId);
    const ledgerFreshIngredients = await refreshIngredientStockFromDb();

    const [outAggregateResult, opnameAggregateResult, premixAggregateResult] = await Promise.all([
      supabase
        .from("worksheet_out_line")
        .select("ingredient_id, quantity")
        .eq("session_id", activeSessionId),
      supabase
        .from("worksheet_opname_line")
        .select("ingredient_id, closing_stock, staff:staff_id ( name, role )")
        .eq("session_id", activeSessionId),
      supabase
        .from("worksheet_premix_line")
        .select("output_ingredient_id, batch_quantity")
        .eq("session_id", activeSessionId),
    ]);

    if (outAggregateResult.error) {
      throw new Error(`Gagal memuat akumulasi out stock: ${outAggregateResult.error.message}`);
    }
    if (opnameAggregateResult.error) {
      throw new Error(`Gagal memuat akumulasi opname: ${opnameAggregateResult.error.message}`);
    }
    if (premixAggregateResult.error) {
      throw new Error(`Gagal memuat akumulasi premix: ${premixAggregateResult.error.message}`);
    }

    const outTotalMap = new Map<string, number>();
    for (const row of outAggregateResult.data ?? []) {
      const quantity = Number(row.quantity ?? 0);
      if (quantity <= 0) continue;
      outTotalMap.set(row.ingredient_id, (outTotalMap.get(row.ingredient_id) ?? 0) + quantity);
    }

    const opnameTotalMap = buildMasterFirstOpnameTotalMap(
      (opnameAggregateResult.data ?? []) as unknown as OpnameAggregateJoined[]
    );

    const premixQuantityTotals = new Map<string, number>();
    for (const row of premixAggregateResult.data ?? []) {
      const quantity = Number(row.batch_quantity ?? 0);
      if (quantity <= 0) continue;
      premixQuantityTotals.set(
        row.output_ingredient_id,
        (premixQuantityTotals.get(row.output_ingredient_id) ?? 0) + quantity
      );
    }

    const aggregatePremixEffects = computePremixEffectsFromTotals(
      premixItems,
      premixQuantityTotals
    );
    const menuTheoreticalMap = await fetchSoldMenuTheoreticalUsage(supabase, date, activeSessionId);
    const issueTheoreticalMap = await fetchMenuIssueTheoreticalUsage(supabase, date, activeSessionId);
    const premixUsageMap = aggregatePremixEffects.usageMap;
    const premixOutputMap = aggregatePremixEffects.outputMap;
    const freshById = new Map(ledgerFreshIngredients.map((ing) => [ing.id, ing]));
    const affectedIngredientIds = new Set([
      ...menuTheoreticalMap.keys(),
      ...issueTheoreticalMap.keys(),
      ...premixUsageMap.keys(),
      ...premixOutputMap.keys(),
    ]);
    const externalIngredientIds = [...affectedIngredientIds].filter(
      (ingredientId) => !freshById.has(ingredientId)
    );
    const externalIngredients = (
      await fetchIngredientsByIds(supabase, externalIngredientIds)
    ).filter((ing) => ing.is_active && ing.is_stock_tracked);
    const ledgerIngredients = [...ledgerFreshIngredients, ...externalIngredients];
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
      ledgerIngredients.map((ing) => ing.id),
      date
    );

    const localLedgerPayload: StockLedgerInsert[] = ledgerFreshIngredients.map((ing) => {
      const existing = existingLedgerMap.get(ing.id);
      const masterStock = Number(ing.current_stock);
      const receive_qty = receiveInputToStockQty(ing, String(receiveTotals.get(ing.id) ?? 0));
      const opening_stock = existing
        ? existing.opening_stock
        : Math.max(
            0,
            Number.isFinite(masterStock)
              ? masterStock - receive_qty
              : previousClosingMap.get(ing.id) ?? 0
          );
      const premix_output_qty = premixOutputMap.get(ing.id) ?? 0;
      const in_qty = receive_qty + premix_output_qty;
      const out_qty = outTotalMap.get(ing.id) ?? 0;
      const menu_theoretical = menuTheoreticalMap.get(ing.id) ?? 0;
      const issue_theoretical = issueTheoreticalMap.get(ing.id) ?? 0;
      const premix_theoretical = premixUsageMap.get(ing.id) ?? 0;
      const theoretical_usage = menu_theoretical + issue_theoretical + premix_theoretical;
      const expected_closing = opening_stock + in_qty - theoretical_usage;
      const hasPhysicalOpname = opnameTotalMap.has(ing.id);
      const closing_stock = hasPhysicalOpname
        ? opnameTotalMap.get(ing.id) ?? 0
        : Math.max(0, expected_closing - out_qty);
      const adjustment_qty = closing_stock - expected_closing;

      if (closing_stock < 0) {
        throw new Error(`Stok fisik ${ing.name} tidak boleh negatif.`);
      }

      if (options.strictOutstockOpname && out_qty > 0 && adjustment_qty > -out_qty) {
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
      const premix_output_qty = premixOutputMap.get(ing.id) ?? 0;
      const existing_other_in = existing
        ? Math.max(0, Number(existing.in_qty) - premix_output_qty)
        : 0;
      const in_qty = existing_other_in + premix_output_qty;
      const menu_theoretical = menuTheoreticalMap.get(ing.id) ?? 0;
      const issue_theoretical = issueTheoreticalMap.get(ing.id) ?? 0;
      const premix_theoretical = premixUsageMap.get(ing.id) ?? 0;
      const current_known_theoretical =
        menu_theoretical + issue_theoretical + premix_theoretical;
      const existing_other_theoretical = existing
        ? Math.max(0, Number(existing.theoretical_usage) - current_known_theoretical)
        : 0;
      const theoretical_usage = current_known_theoretical + existing_other_theoretical;
      const expected_closing = opening_stock + in_qty - theoretical_usage;
      const closing_stock = existing ? existing.closing_stock : Math.max(0, expected_closing);
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

    if (ledgerPayload.length > 0) {
      const { error: ledgerErr } = await supabase
        .from("stock_ledger")
        .upsert(ledgerPayload, { onConflict: "business_date,ingredient_id" });

      if (ledgerErr) {
        throw new Error(`Gagal upsert stock_ledger: ${ledgerErr.message}`);
      }

      const stockUpdateResults = await Promise.all(
        ledgerPayload.map((row) =>
          supabase
            .from("ingredient")
            .update({ current_stock: row.closing_stock })
            .eq("id", row.ingredient_id)
        )
      );
      const stockUpdateErr = stockUpdateResults.find((result) => result.error)?.error;
      if (stockUpdateErr) {
        throw new Error(
          `Ledger tersimpan tetapi cache stok gagal diperbarui: ${stockUpdateErr.message}`
        );
      }

      if (options.writeClosingLog) {
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
            worksheet_session_id: activeSessionId,
            created_by_staff_id: submittingStaffId,
          };
        });

        const { error: logErr } = await supabase.from("stock_log").insert(logPayload);
        if (logErr) {
          throw new Error(`Ledger tersimpan tetapi audit log gagal dibuat: ${logErr.message}`);
        }
      }
    }

    const aggregatedLinesForEvaluation = ledgerFreshIngredients.reduce<Record<string, IngredientLineState>>(
      (acc, ing) => {
        const existing = lines[ing.id] ?? DEFAULT_LINE;
        acc[ing.id] = {
          ...existing,
          outQty: outTotalMap.has(ing.id) ? String(outTotalMap.get(ing.id)) : "",
          closingStock: opnameTotalMap.has(ing.id) ? String(opnameTotalMap.get(ing.id)) : "",
        };
        return acc;
      },
      {}
    );

    return evaluateOpnameSubmission({
      ingredients: ledgerFreshIngredients,
      lines: aggregatedLinesForEvaluation,
      ledgerRows: localLedgerPayload.map((row) => ({
        ingredient_id: row.ingredient_id,
        opening_stock: row.opening_stock,
        in_qty: row.in_qty,
        theoretical_usage: row.theoretical_usage,
        adjustment_qty: row.adjustment_qty,
        closing_stock: row.closing_stock,
      })),
    });
  };

  const uploadOutStockPhotos = async (ingredientId: string, files: File[]) => {
    if (files.length === 0 || locked || isOwnedByOther(outLineOwners[ingredientId])) return;

    setUploadingPhotoFor(ingredientId);
    setError(null);

    try {
      const uploadedPhotos = await Promise.all(
        files.map((file) => uploadWorksheetPhoto(file, `artha/outstock/${department}`))
      );

      appendOutPhotos(ingredientId, uploadedPhotos);
      showSuccessToast(
        `${uploadedPhotos.length} foto bukti out stock tersimpan.`
      );
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
    if (locked || isOwnedByOther(issueLineOwners[menuId])) return;
    setMenuIssues((prev) => ({
      ...prev,
      [menuId]: {
        ...createDefaultMenuIssue(),
        ...(prev[menuId] ?? {}),
        ...patch,
      },
    }));
  };

  const updateMenuIssueResponsibility = (menuId: string, value: string) => {
    const nextScope: LossResponsibilityScope = value.startsWith("staff:") ? "staff" : value === "general" ? "general" : "unknown";
    const nextStaffId = nextScope === "staff" ? value.replace("staff:", "") : "";
    updateMenuIssue(menuId, {
      lossResponsibilityScope: nextScope,
      responsibleStaffId: nextStaffId,
    });
  };

  const uploadMenuIssuePhotos = async (menuId: string, files: File[]) => {
    if (files.length === 0 || locked || isOwnedByOther(issueLineOwners[menuId])) return;

    setUploadingPhotoFor(`issue-${menuId}`);
    setError(null);

    try {
      const uploadedPhotos = await Promise.all(
        files.map((file) => uploadWorksheetPhoto(file, `artha/menu-issue/${department}`))
      );
      const current = menuIssues[menuId] ?? createDefaultMenuIssue();

      updateMenuIssue(menuId, {
        photoUrl: joinStoredPhotoValue([
          ...splitStoredPhotoValue(current.photoUrl),
          ...uploadedPhotos.map((photo) => photo.url),
        ]),
        photoPublicId: joinStoredPhotoValue([
          ...splitStoredPhotoValue(current.photoPublicId),
          ...uploadedPhotos.map((photo) => photo.publicId),
        ]),
      });
      showSuccessToast(`${uploadedPhotos.length} foto bukti remake tersimpan.`);
    } catch (err) {
      showPlainErrorToast(err instanceof Error ? err.message : "Upload foto gagal.");
    } finally {
      setUploadingPhotoFor(null);
    }
  };

  const removeMenuIssuePhoto = (menuId: string, photoIndex: number) => {
    const current = menuIssues[menuId] ?? createDefaultMenuIssue();
    const next = removeStoredPhotoAt(current.photoUrl, current.photoPublicId, photoIndex);
    updateMenuIssue(menuId, {
      photoUrl: next.outPhotoUrl,
      photoPublicId: next.outPhotoPublicId,
    });
  };

  const updatePremixQty = (premixId: string, value: string) => {
    if (locked || isOwnedByOther(premixLineOwners[premixId])) return;
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
    if (locked || isOwnedByOther(premixLineOwners[premixId])) return;
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
	        (ing) => ing.kind === "raw" && !isBlankQty(receiveEntryInputs[ing.id] ?? "")
	      );
	      const hasEditableExistingReceive = Object.values(receiveEntrySummaries).some((entries) =>
	        entries.some((entry) =>
	          canOverrideWorksheetOwnership ||
	          isCurrentStaffOwner({ staffId: entry.staffId, staffName: entry.staffName })
	        )
	      );

	      if (!hasPendingReceive && !hasEditableExistingReceive) {
	        showPlainErrorToast("Isi atau koreksi jumlah receive kamu terlebih dahulu.");
	        return;
	      }

      if (!staff?.id) {
        throw new Error("Sesi staf tidak ditemukan. Silakan logout dan login ulang.");
      }

      await savePendingReceiveEntries(activeSessionId);
      await syncWorksheetFinalMonitoringData(activeSessionId, date, staff.id);
      showSuccessToast("Receive tersimpan.");
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSavingReceive(false);
    }
  };

  const handleSaveOutStock = async () => {
    if (locked || isSavingOutStock || outstockHasBlockingErrors || !staff?.id) return;

    const date = businessDate || resolveWorksheetBusinessDate();
    setIsSavingOutStock(true);
    setError(null);

    try {
      const freshIngredients = await refreshIngredientStockFromDb();
      await assertOutstockPayloadValid(freshIngredients);

      const { sessionId: activeSessionId } = await ensureDraftSession(date);

      const editableIngredientIds = freshIngredients
        .filter((ing) => !isOwnedByOther(outLineOwners[ing.id]))
        .map((ing) => ing.id);
      const editableOutOwnerIds = getEditableOwnerIds(outLineOwners, editableIngredientIds);
      const outOwnerByIngredientId = new Map(
        editableIngredientIds.map((ingredientId) => [
          ingredientId,
          getPersistedOwner(outLineOwners[ingredientId]),
        ])
      );

      const outLinePayload = freshIngredients
        .filter((ing) => editableIngredientIds.includes(ing.id))
        .map((ing) => {
          const line = lines[ing.id] ?? DEFAULT_LINE;
          const owner = outOwnerByIngredientId.get(ing.id) ?? currentStaffOwner();
          const lossPayload = resolveOutstockLossPayload(line);
          return {
            session_id: activeSessionId,
            ingredient_id: ing.id,
            staff_id: owner.staffId,
            quantity: parseQty(line.outQty),
            note: line.outNote.trim(),
            ...lossPayload,
            photo_url: line.outPhotoUrl || null,
            photo_public_id: line.outPhotoPublicId || null,
          };
        })
        .filter((row) => row.quantity > 0);

	      const clearOutQuery =
	        editableIngredientIds.length > 0
	          ? supabase
	              .from("worksheet_out_line")
	              .delete()
	              .eq("session_id", activeSessionId)
	              .in("ingredient_id", editableIngredientIds)
	          : null;
	      const { error: clearErr } = clearOutQuery
	        ? canOverrideWorksheetOwnership
	          ? await clearOutQuery
	          : await clearOutQuery.or(buildOwnerDeleteFilter(editableOutOwnerIds))
	        : { error: null };

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

      const nextOwners = { ...outLineOwners };
      for (const ingredientId of editableIngredientIds) delete nextOwners[ingredientId];
      for (const row of outLinePayload) {
        nextOwners[row.ingredient_id] =
          outOwnerByIngredientId.get(row.ingredient_id) ?? currentStaffOwner();
      }
      setOutLineOwners(nextOwners);
      setOutEntrySummaries((prev) =>
        replaceCurrentStaffSummaries(
          prev,
          editableIngredientIds,
          new Map(outLinePayload.map((row) => [row.ingredient_id, row.quantity])),
          outOwnerByIngredientId
        )
      );

      await syncWorksheetFinalMonitoringData(activeSessionId, date, staff.id);

      showSuccessToast("Out stock tersimpan.");
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

      const editableIngredients = freshIngredients.filter(
        (ing) => !isOwnedByOther(opnameLineOwners[ing.id])
      );
      const editableOpnameOwnerIds = getEditableOwnerIds(
        opnameLineOwners,
        editableIngredients.map((ing) => ing.id)
      );
      const opnameOwnerByIngredientId = new Map(
        editableIngredients.map((ing) => [
          ing.id,
          getPersistedOwner(opnameLineOwners[ing.id]),
        ])
      );
      const opnamePayload = editableIngredients.flatMap((ing) => {
        const raw = (lines[ing.id] ?? DEFAULT_LINE).closingStock;
        if (isBlankQty(raw)) {
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
            staff_id: (opnameOwnerByIngredientId.get(ing.id) ?? currentStaffOwner()).staffId,
            closing_stock,
          },
        ];
      });

      const editableOpnameIngredientIds = editableIngredients.map((ing) => ing.id);
	      const clearOpnameQuery =
	        editableOpnameIngredientIds.length > 0
	          ? supabase
	              .from("worksheet_opname_line")
	              .delete()
	              .eq("session_id", activeSessionId)
	              .in("ingredient_id", editableOpnameIngredientIds)
	          : null;
	      const { error: clearOpnameErr } = clearOpnameQuery
	        ? canOverrideWorksheetOwnership
	          ? await clearOpnameQuery
	          : await clearOpnameQuery.or(buildOwnerDeleteFilter(editableOpnameOwnerIds))
	        : { error: null };

      if (clearOpnameErr) {
        throw new Error(`Gagal membersihkan draft opname: ${clearOpnameErr.message}`);
      }

      const { error: opnameErr } =
        opnamePayload.length > 0
          ? await supabase.from("worksheet_opname_line").insert(opnamePayload)
          : { error: null };

      if (opnameErr) {
        throw new Error(`Gagal menyimpan draft opname: ${opnameErr.message}`);
      }

      const nextOwners = { ...opnameLineOwners };
      for (const ingredientId of editableOpnameIngredientIds) delete nextOwners[ingredientId];
      for (const row of opnamePayload) {
        nextOwners[row.ingredient_id] =
          opnameOwnerByIngredientId.get(row.ingredient_id) ?? currentStaffOwner();
      }
      setOpnameLineOwners(nextOwners);
      setOpnameEntrySummaries((prev) =>
        replaceCurrentStaffSummaries(
          prev,
          editableOpnameIngredientIds,
          new Map(opnamePayload.map((row) => [row.ingredient_id, row.closing_stock])),
          opnameOwnerByIngredientId
        )
      );

      await syncWorksheetFinalMonitoringData(activeSessionId, date, staff.id);

      showSuccessToast("Opname tersimpan.");
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
      const hasPendingReceive = ingredients.some(
        (ing) => ing.kind === "raw" && !isBlankQty(receiveEntryInputs[ing.id] ?? "")
      );
      if (hasPendingReceive) {
        await savePendingReceiveEntries(activeSessionId);
      }

      const editablePremixIds = premixItems
        .filter((premix) => !isOwnedByOther(premixLineOwners[premix.id]))
        .map((premix) => premix.id);
      const editablePremixOwnerIds = getEditableOwnerIds(premixLineOwners, editablePremixIds);
      const premixOwnerById = new Map(
        editablePremixIds.map((premixId) => [
          premixId,
          getPersistedOwner(premixLineOwners[premixId]),
        ])
      );
      const payload = premixItems
        .filter((premix) => editablePremixIds.includes(premix.id))
        .map((premix) => {
          const recipe = getActivePremixRecipe(premix);
          const owner = premixOwnerById.get(premix.id) ?? currentStaffOwner();
          return {
            session_id: activeSessionId,
            output_ingredient_id: premix.id,
            recipe_id: recipe?.id ?? "",
            staff_id: owner.staffId,
            batch_quantity: parseQty(premixQuantities[premix.id] ?? ""),
          };
        })
        .filter((row) => row.batch_quantity > 0 && row.recipe_id);

	      const clearPremixQuery =
	        editablePremixIds.length > 0
	          ? supabase
	              .from("worksheet_premix_line")
	              .delete()
	              .eq("session_id", activeSessionId)
	              .in("output_ingredient_id", editablePremixIds)
	          : null;
	      const { error: clearErr } = clearPremixQuery
	        ? canOverrideWorksheetOwnership
	          ? await clearPremixQuery
	          : await clearPremixQuery.or(buildOwnerDeleteFilter(editablePremixOwnerIds))
	        : { error: null };

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

      const nextOwners = { ...premixLineOwners };
      for (const premixId of editablePremixIds) delete nextOwners[premixId];
      for (const row of payload) {
        nextOwners[row.output_ingredient_id] =
          premixOwnerById.get(row.output_ingredient_id) ?? currentStaffOwner();
      }
      setPremixLineOwners(nextOwners);
      setPremixEntrySummaries((prev) =>
        replaceCurrentStaffSummaries(
          prev,
          editablePremixIds,
          new Map(payload.map((row) => [row.output_ingredient_id, row.batch_quantity])),
          premixOwnerById
        )
      );

      await syncWorksheetFinalMonitoringData(activeSessionId, date, staff.id);

      showSuccessToast(
        hasPendingReceive
          ? "Receive dan premix tersimpan."
          : "Premix tersimpan."
      );
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSavingPremix(false);
    }
  };

  const handleRequestResubmit = async () => {
    if (!sessionId || !showResubmitCta || isRequestingResubmit) return;

    const reason = correctionReason.trim();
    if (!canApproveCorrection && reason.length < 5) {
      showPlainErrorToast("Isi alasan koreksi minimal 5 karakter sebelum ajukan request.");
      return;
    }

    if (canApproveCorrection) {
      const confirmed = window.confirm(
        "Buka kembali worksheet untuk koreksi? Worksheet perlu submit ulang setelah selesai diperbaiki."
      );
      if (!confirmed) return;
    }

    setIsRequestingResubmit(true);
    setError(null);

    try {
      if (!canApproveCorrection) {
        if (!staff?.id) {
          throw new Error("Sesi staff tidak ditemukan. Silakan logout dan login ulang.");
        }

        const { data: requestRow, error: requestErr } = await supabase
          .from("worksheet_edit_request")
          .insert({
            session_id: sessionId,
            business_date: businessDate || selectedBusinessDate,
            department,
            requested_by_staff_id: staff.id,
            reason,
            status: "PENDING",
          })
          .select("id, reason, status, created_at")
          .single();

        if (requestErr || !requestRow) {
          throw new Error(requestErr?.message ?? "Gagal mengajukan koreksi worksheet.");
        }

        setEditRequest(requestRow);
        setCorrectionReason("");
      showSuccessToast("Request koreksi dikirim.");
        return;
      }

      const { error: unlockErr } = await supabase
        .from("worksheet_session")
        .update({
          status: "DRAFT",
          submitted_at: null,
          submitted_by_staff_id: null,
          locked_at: null,
          locked_by_staff_id: null,
        })
        .eq("id", sessionId)
        .eq("business_date", businessDate || selectedBusinessDate)
        .eq("department", department);

      if (unlockErr) {
        throw new Error(unlockErr.message);
      }

      const { error: dayUnlockErr } = await supabase
        .from("business_day")
        .update({ status: "DRAFT" })
        .eq("business_date", businessDate || selectedBusinessDate);

      if (dayUnlockErr) {
        throw new Error(dayUnlockErr.message);
      }

      setWorksheetStatus("DRAFT");
      showSuccessToast(
        `Worksheet ${formatBusinessDateLabel(businessDate || selectedBusinessDate)} dibuka.`
      );
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
      .map((menu) => {
        const owner = getPersistedOwnerFromSummaries(soldEntrySummaries[menu.id] ?? []);
        return {
          session_id: activeSessionId,
          menu_item_id: menu.id,
          staff_id: owner.staffId,
          quantity_sold: parseQty(soldItems[menu.id] ?? ""),
        };
      })
      .filter((row) => row.quantity_sold > 0);

	    const clearSoldEntryQuery = supabase
	      .from("worksheet_sold_entry")
	      .delete()
	      .eq("session_id", activeSessionId);
	    const { error: clearOwnSoldErr } = canOverrideWorksheetOwnership
	      ? await clearSoldEntryQuery
	      : await clearSoldEntryQuery.eq("staff_id", staff.id);

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
      .select("menu_item_id, staff_id, quantity_sold, staff:staff_id ( name, role )")
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
          staffRole: rowStaff?.role ?? null,
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

    const editableIssueMenuIds = menuList
      .filter((menu) => !isOwnedByOther(issueLineOwners[menu.id]))
      .map((menu) => menu.id);
    const editableIssueOwnerIds = getEditableOwnerIds(issueLineOwners, editableIssueMenuIds);
    const issueOwnerByMenuId = new Map(
      editableIssueMenuIds.map((menuId) => [
        menuId,
        getPersistedOwner(issueLineOwners[menuId]),
      ])
    );
    const issuePayload = menuList
      .filter((menu) => editableIssueMenuIds.includes(menu.id))
      .map((menu) => {
        const issue = menuIssues[menu.id] ?? createDefaultMenuIssue();
        const owner = issueOwnerByMenuId.get(menu.id) ?? currentStaffOwner();
        const lossPayload = resolveMenuIssueLossPayload(issue);
        return {
          session_id: activeSessionId,
          menu_item_id: menu.id,
          staff_id: owner.staffId,
          quantity: parseQty(issue.quantity),
          reason: issue.reason,
          note: issue.note.trim(),
          ...lossPayload,
          photo_url: issue.photoUrl || null,
          photo_public_id: issue.photoPublicId || null,
        };
      })
      .filter((row) => row.quantity > 0);

	    const clearIssueQuery =
	      editableIssueMenuIds.length > 0
	        ? supabase
	            .from("worksheet_menu_issue_line")
	            .delete()
	            .eq("session_id", activeSessionId)
	            .in("menu_item_id", editableIssueMenuIds)
	        : null;
	    const { error: clearIssueErr } = clearIssueQuery
	      ? canOverrideWorksheetOwnership
	        ? await clearIssueQuery
	        : await clearIssueQuery.or(buildOwnerDeleteFilter(editableIssueOwnerIds))
	      : { error: null };

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

    const nextIssueOwners = { ...issueLineOwners };
    for (const menuId of editableIssueMenuIds) delete nextIssueOwners[menuId];
    for (const row of issuePayload) {
      nextIssueOwners[row.menu_item_id] =
        issueOwnerByMenuId.get(row.menu_item_id) ?? currentStaffOwner();
    }
    setIssueLineOwners(nextIssueOwners);
    setIssueEntrySummaries((prev) =>
      replaceCurrentStaffSummaries(
        prev,
        editableIssueMenuIds,
        new Map(issuePayload.map((row) => [row.menu_item_id, row.quantity])),
        issueOwnerByMenuId
      )
    );
  };

  const handleSaveMenuProgress = async () => {
    if (locked || isSavingMenuProgress) return;

    setIsSavingMenuProgress(true);
    setError(null);

    try {
      const date = businessDate || resolveWorksheetBusinessDate();
      const { sessionId: ensuredSessionId } = await ensureDraftSession(date);
      await saveMenuProgress(ensuredSessionId, menus);
      if (!staff?.id) {
        throw new Error("Sesi staf tidak ditemukan. Silakan logout dan login ulang.");
      }
      await syncWorksheetFinalMonitoringData(ensuredSessionId, date, staff.id);
      showSuccessToast("Sales menu tersimpan.");
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSavingMenuProgress(false);
    }
  };

  const handleSaveAllProgress = async () => {
    if (isLoading) {
      throw new Error(`Worksheet ${department} masih memuat. Tunggu sebentar lalu coba lagi.`);
    }
    if (locked) return;
    if (isSavingAll || isSubmitting) {
      throw new Error(`Worksheet ${department} sedang diproses.`);
    }
    if (!staff?.id) {
      throw new Error("Sesi staf tidak ditemukan. Silakan logout dan login ulang.");
    }

    const date = businessDate || resolveWorksheetBusinessDate();
    setIsSavingAll(true);
    setError(null);

    try {
      const freshIngredients = await refreshIngredientStockFromDb();
      await assertOutstockPayloadValid(freshIngredients);

      const { sessionId: activeSessionId } = await ensureDraftSession(date);
      await savePendingReceiveEntries(activeSessionId);

      const ledgerFreshIngredients = await refreshIngredientStockFromDb();
      const editableOutIngredientIds = ledgerFreshIngredients
        .filter((ing) => !isOwnedByOther(outLineOwners[ing.id]))
        .map((ing) => ing.id);
      const editableOutOwnerIds = getEditableOwnerIds(outLineOwners, editableOutIngredientIds);
      const outOwnerByIngredientId = new Map(
        editableOutIngredientIds.map((ingredientId) => [
          ingredientId,
          getPersistedOwner(outLineOwners[ingredientId]),
        ])
      );
      const outLinePayload = ledgerFreshIngredients
        .filter((ing) => editableOutIngredientIds.includes(ing.id))
        .map((ing) => {
          const line = lines[ing.id] ?? DEFAULT_LINE;
          const owner = outOwnerByIngredientId.get(ing.id) ?? currentStaffOwner();
          const lossPayload = resolveOutstockLossPayload(line);
          return {
            session_id: activeSessionId,
            ingredient_id: ing.id,
            staff_id: owner.staffId,
            quantity: parseQty(line.outQty),
            note: line.outNote.trim(),
            ...lossPayload,
            photo_url: line.outPhotoUrl || null,
            photo_public_id: line.outPhotoPublicId || null,
          };
        })
        .filter((row) => row.quantity > 0);

      const clearOutQuery =
        editableOutIngredientIds.length > 0
          ? supabase
              .from("worksheet_out_line")
              .delete()
              .eq("session_id", activeSessionId)
              .in("ingredient_id", editableOutIngredientIds)
          : null;
      const { error: clearOutErr } = clearOutQuery
        ? canOverrideWorksheetOwnership
          ? await clearOutQuery
          : await clearOutQuery.or(buildOwnerDeleteFilter(editableOutOwnerIds))
        : { error: null };

      if (clearOutErr) {
        throw new Error(`Gagal membersihkan out stock: ${clearOutErr.message}`);
      }

      const { error: outLineErr } =
        outLinePayload.length > 0
          ? await supabase.from("worksheet_out_line").insert(outLinePayload)
          : { error: null };

      if (outLineErr) {
        throw new Error(`Gagal menyimpan out stock: ${outLineErr.message}`);
      }

      const nextOutOwners = { ...outLineOwners };
      for (const ingredientId of editableOutIngredientIds) delete nextOutOwners[ingredientId];
      for (const row of outLinePayload) {
        nextOutOwners[row.ingredient_id] =
          outOwnerByIngredientId.get(row.ingredient_id) ?? currentStaffOwner();
      }
      setOutLineOwners(nextOutOwners);
      setOutEntrySummaries((prev) =>
        replaceCurrentStaffSummaries(
          prev,
          editableOutIngredientIds,
          new Map(outLinePayload.map((row) => [row.ingredient_id, row.quantity])),
          outOwnerByIngredientId
        )
      );

      await saveMenuProgress(activeSessionId, menus);

      const editablePremixIds = premixItems
        .filter((premix) => !isOwnedByOther(premixLineOwners[premix.id]))
        .map((premix) => premix.id);
      const editablePremixOwnerIds = getEditableOwnerIds(premixLineOwners, editablePremixIds);
      const premixOwnerById = new Map(
        editablePremixIds.map((premixId) => [
          premixId,
          getPersistedOwner(premixLineOwners[premixId]),
        ])
      );
      const premixPayload = premixItems
        .filter((premix) => editablePremixIds.includes(premix.id))
        .map((premix) => {
          const recipe = getActivePremixRecipe(premix);
          const owner = premixOwnerById.get(premix.id) ?? currentStaffOwner();
          return {
            session_id: activeSessionId,
            output_ingredient_id: premix.id,
            recipe_id: recipe?.id ?? "",
            staff_id: owner.staffId,
            batch_quantity: parseQty(premixQuantities[premix.id] ?? ""),
          };
        })
        .filter((row) => row.batch_quantity > 0 && row.recipe_id);

      const clearPremixQuery =
        editablePremixIds.length > 0
          ? supabase
              .from("worksheet_premix_line")
              .delete()
              .eq("session_id", activeSessionId)
              .in("output_ingredient_id", editablePremixIds)
          : null;
      const { error: clearPremixErr } = clearPremixQuery
        ? canOverrideWorksheetOwnership
          ? await clearPremixQuery
          : await clearPremixQuery.or(buildOwnerDeleteFilter(editablePremixOwnerIds))
        : { error: null };

      if (clearPremixErr) {
        throw new Error(`Gagal membersihkan premix: ${clearPremixErr.message}`);
      }

      const { error: premixErr } =
        premixPayload.length > 0
          ? await supabase.from("worksheet_premix_line").insert(premixPayload)
          : { error: null };

      if (premixErr) {
        throw new Error(`Gagal menyimpan premix: ${premixErr.message}`);
      }

      const nextPremixOwners = { ...premixLineOwners };
      for (const premixId of editablePremixIds) delete nextPremixOwners[premixId];
      for (const row of premixPayload) {
        nextPremixOwners[row.output_ingredient_id] =
          premixOwnerById.get(row.output_ingredient_id) ?? currentStaffOwner();
      }
      setPremixLineOwners(nextPremixOwners);
      setPremixEntrySummaries((prev) =>
        replaceCurrentStaffSummaries(
          prev,
          editablePremixIds,
          new Map(premixPayload.map((row) => [row.output_ingredient_id, row.batch_quantity])),
          premixOwnerById
        )
      );

      const editableOpnameIngredients = ledgerFreshIngredients.filter(
        (ing) => !isOwnedByOther(opnameLineOwners[ing.id])
      );
      const editableOpnameIngredientIds = editableOpnameIngredients.map((ing) => ing.id);
      const editableOpnameOwnerIds = getEditableOwnerIds(
        opnameLineOwners,
        editableOpnameIngredientIds
      );
      const opnameOwnerByIngredientId = new Map(
        editableOpnameIngredients.map((ing) => [
          ing.id,
          getPersistedOwner(opnameLineOwners[ing.id]),
        ])
      );
      const opnamePayload = editableOpnameIngredients.flatMap((ing) => {
        const raw = (lines[ing.id] ?? DEFAULT_LINE).closingStock;
        if (isBlankQty(raw)) return [];
        const closing_stock = parseQty(raw);
        if (closing_stock < 0) {
          throw new Error(`Stok fisik ${ing.name} tidak boleh negatif.`);
        }
        return [
          {
            session_id: activeSessionId,
            ingredient_id: ing.id,
            staff_id: (opnameOwnerByIngredientId.get(ing.id) ?? currentStaffOwner()).staffId,
            closing_stock,
          },
        ];
      });

      const clearOpnameQuery =
        editableOpnameIngredientIds.length > 0
          ? supabase
              .from("worksheet_opname_line")
              .delete()
              .eq("session_id", activeSessionId)
              .in("ingredient_id", editableOpnameIngredientIds)
          : null;
      const { error: clearOpnameErr } = clearOpnameQuery
        ? canOverrideWorksheetOwnership
          ? await clearOpnameQuery
          : await clearOpnameQuery.or(buildOwnerDeleteFilter(editableOpnameOwnerIds))
        : { error: null };

      if (clearOpnameErr) {
        throw new Error(`Gagal membersihkan opname: ${clearOpnameErr.message}`);
      }

      const { error: opnameErr } =
        opnamePayload.length > 0
          ? await supabase.from("worksheet_opname_line").insert(opnamePayload)
          : { error: null };

      if (opnameErr) {
        throw new Error(`Gagal menyimpan opname: ${opnameErr.message}`);
      }

      const nextOpnameOwners = { ...opnameLineOwners };
      for (const ingredientId of editableOpnameIngredientIds) delete nextOpnameOwners[ingredientId];
      for (const row of opnamePayload) {
        nextOpnameOwners[row.ingredient_id] =
          opnameOwnerByIngredientId.get(row.ingredient_id) ?? currentStaffOwner();
      }
      setOpnameLineOwners(nextOpnameOwners);
      setOpnameEntrySummaries((prev) =>
        replaceCurrentStaffSummaries(
          prev,
          editableOpnameIngredientIds,
          new Map(opnamePayload.map((row) => [row.ingredient_id, row.closing_stock])),
          opnameOwnerByIngredientId
        )
      );

      await syncWorksheetFinalMonitoringData(activeSessionId, date, staff.id);
      showSuccessToast("Worksheet tersimpan.");
    } catch (err) {
      showTranslatedSubmitError(err);
    } finally {
      setIsSavingAll(false);
    }
  };

  useImperativeHandle(
    ref,
    () => ({
      saveAllProgress: handleSaveAllProgress,
      buildPreviewEntries: () => {
        if (isLoading) {
          throw new Error(`Worksheet ${department} masih memuat. Tunggu sebentar lalu coba lagi.`);
        }
        return buildAllWorksheetPreviewEntries();
      },
    }),
    [buildAllWorksheetPreviewEntries, department, handleSaveAllProgress, isLoading]
  );

  const handleSubmit = async () => {
    if (isSubmitting) {
      showPlainErrorToast("Laporan sedang dikirim, tunggu sebentar ya.");
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
      `Kunci worksheet ${formatBusinessDateLabel(businessDate || selectedBusinessDate)} department ${department}? Yang terkunci hanya tanggal dan department ini.`
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
      const ledgerFreshIngredients = await refreshIngredientStockFromDb();

      const editableOutIngredientIds = ledgerFreshIngredients
        .filter((ing) => !isOwnedByOther(outLineOwners[ing.id]))
        .map((ing) => ing.id);
      const editableOutOwnerIds = getEditableOwnerIds(outLineOwners, editableOutIngredientIds);
      const outOwnerByIngredientId = new Map(
        editableOutIngredientIds.map((ingredientId) => [
          ingredientId,
          getPersistedOwner(outLineOwners[ingredientId]),
        ])
      );
      const outLinePayload = ledgerFreshIngredients
        .filter((ing) => editableOutIngredientIds.includes(ing.id))
        .map((ing) => {
          const line = lines[ing.id] ?? DEFAULT_LINE;
          const owner = outOwnerByIngredientId.get(ing.id) ?? currentStaffOwner();
          const lossPayload = resolveOutstockLossPayload(line);
          return {
            session_id: ensuredSessionId,
            ingredient_id: ing.id,
            staff_id: owner.staffId,
            quantity: parseQty(line.outQty),
            note: line.outNote.trim(),
            ...lossPayload,
            photo_url: line.outPhotoUrl || null,
            photo_public_id: line.outPhotoPublicId || null,
          };
        })
        .filter((row) => row.quantity > 0);

	      const clearOutSubmitQuery =
	        editableOutIngredientIds.length > 0
	          ? supabase
	              .from("worksheet_out_line")
	              .delete()
	              .eq("session_id", ensuredSessionId)
	              .in("ingredient_id", editableOutIngredientIds)
	          : null;
	      const { error: clearOutErr } = clearOutSubmitQuery
	        ? canOverrideWorksheetOwnership
	          ? await clearOutSubmitQuery
	          : await clearOutSubmitQuery.or(buildOwnerDeleteFilter(editableOutOwnerIds))
	        : { error: null };

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

      const editablePremixIds = premixItems
        .filter((premix) => !isOwnedByOther(premixLineOwners[premix.id]))
        .map((premix) => premix.id);
      const editablePremixOwnerIds = getEditableOwnerIds(premixLineOwners, editablePremixIds);
      const premixOwnerById = new Map(
        editablePremixIds.map((premixId) => [
          premixId,
          getPersistedOwner(premixLineOwners[premixId]),
        ])
      );
      const premixPayload = premixItems
        .filter((premix) => editablePremixIds.includes(premix.id))
        .map((premix) => {
          const recipe = getActivePremixRecipe(premix);
          const owner = premixOwnerById.get(premix.id) ?? currentStaffOwner();
          return {
            session_id: ensuredSessionId,
            output_ingredient_id: premix.id,
            recipe_id: recipe?.id ?? "",
            staff_id: owner.staffId,
            batch_quantity: parseQty(premixQuantities[premix.id] ?? ""),
          };
        })
        .filter((row) => row.batch_quantity > 0 && row.recipe_id);

	      const clearPremixSubmitQuery =
	        editablePremixIds.length > 0
	          ? supabase
	              .from("worksheet_premix_line")
	              .delete()
	              .eq("session_id", ensuredSessionId)
	              .in("output_ingredient_id", editablePremixIds)
	          : null;
	      const { error: clearPremixErr } = clearPremixSubmitQuery
	        ? canOverrideWorksheetOwnership
	          ? await clearPremixSubmitQuery
	          : await clearPremixSubmitQuery.or(buildOwnerDeleteFilter(editablePremixOwnerIds))
	        : { error: null };

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

      const editableOpnameIngredients = ledgerFreshIngredients.filter(
        (ing) => !isOwnedByOther(opnameLineOwners[ing.id])
      );
      const editableOpnameIngredientIds = editableOpnameIngredients.map((ing) => ing.id);
      const editableOpnameOwnerIds = getEditableOwnerIds(
        opnameLineOwners,
        editableOpnameIngredientIds
      );
      const opnameOwnerByIngredientId = new Map(
        editableOpnameIngredients.map((ing) => [
          ing.id,
          getPersistedOwner(opnameLineOwners[ing.id]),
        ])
      );
      const opnamePayload = editableOpnameIngredients.flatMap((ing) => {
        const raw = (lines[ing.id] ?? DEFAULT_LINE).closingStock;
        if (isBlankQty(raw)) return [];
        const closing_stock = parseQty(raw);
        if (closing_stock < 0) {
          throw new Error(`Stok fisik ${ing.name} tidak boleh negatif.`);
        }
        return [
          {
            session_id: ensuredSessionId,
            ingredient_id: ing.id,
            staff_id: (opnameOwnerByIngredientId.get(ing.id) ?? currentStaffOwner()).staffId,
            closing_stock,
          },
        ];
      });

	      const clearOpnameSubmitQuery =
	        editableOpnameIngredientIds.length > 0
	          ? supabase
	              .from("worksheet_opname_line")
	              .delete()
	              .eq("session_id", ensuredSessionId)
	              .in("ingredient_id", editableOpnameIngredientIds)
	          : null;
	      const { error: clearOpnameErr } = clearOpnameSubmitQuery
	        ? canOverrideWorksheetOwnership
	          ? await clearOpnameSubmitQuery
	          : await clearOpnameSubmitQuery.or(buildOwnerDeleteFilter(editableOpnameOwnerIds))
	        : { error: null };

      if (clearOpnameErr) {
        throw new Error(`Gagal membersihkan worksheet_opname_line: ${clearOpnameErr.message}`);
      }

      const { error: opnameLineErr } =
        opnamePayload.length > 0
          ? await supabase.from("worksheet_opname_line").insert(opnamePayload)
          : { error: null };

      if (opnameLineErr) {
        throw new Error(`Gagal menyimpan worksheet_opname_line: ${opnameLineErr.message}`);
      }

      const [outAggregateResult, opnameAggregateResult, premixAggregateResult] = await Promise.all([
        supabase
          .from("worksheet_out_line")
          .select("ingredient_id, quantity")
          .eq("session_id", ensuredSessionId),
        supabase
          .from("worksheet_opname_line")
          .select("ingredient_id, closing_stock, staff:staff_id ( name, role )")
          .eq("session_id", ensuredSessionId),
        supabase
          .from("worksheet_premix_line")
          .select("output_ingredient_id, batch_quantity")
          .eq("session_id", ensuredSessionId),
      ]);

      if (outAggregateResult.error) {
        throw new Error(`Gagal memuat akumulasi out stock: ${outAggregateResult.error.message}`);
      }
      if (opnameAggregateResult.error) {
        throw new Error(`Gagal memuat akumulasi opname: ${opnameAggregateResult.error.message}`);
      }
      if (premixAggregateResult.error) {
        throw new Error(`Gagal memuat akumulasi premix: ${premixAggregateResult.error.message}`);
      }

      const outTotalMap = new Map<string, number>();
      for (const row of outAggregateResult.data ?? []) {
        const quantity = Number(row.quantity ?? 0);
        if (quantity <= 0) continue;
        outTotalMap.set(row.ingredient_id, (outTotalMap.get(row.ingredient_id) ?? 0) + quantity);
      }

      const opnameTotalMap = buildMasterFirstOpnameTotalMap(
        (opnameAggregateResult.data ?? []) as unknown as OpnameAggregateJoined[]
      );

      const premixQuantityTotals = new Map<string, number>();
      for (const row of premixAggregateResult.data ?? []) {
        const quantity = Number(row.batch_quantity ?? 0);
        if (quantity <= 0) continue;
        premixQuantityTotals.set(
          row.output_ingredient_id,
          (premixQuantityTotals.get(row.output_ingredient_id) ?? 0) + quantity
        );
      }

      const aggregatePremixEffects = computePremixEffectsFromTotals(
        premixItems,
        premixQuantityTotals
      );

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
      const premixUsageMap = aggregatePremixEffects.usageMap;
      const premixOutputMap = aggregatePremixEffects.outputMap;
      const freshById = new Map(ledgerFreshIngredients.map((ing) => [ing.id, ing]));
      const affectedIngredientIds = new Set([
        ...menuTheoreticalMap.keys(),
        ...issueTheoreticalMap.keys(),
        ...premixUsageMap.keys(),
        ...premixOutputMap.keys(),
      ]);
      const externalIngredientIds = [...affectedIngredientIds].filter(
        (ingredientId) => !freshById.has(ingredientId)
      );
      const externalIngredients = (
        await fetchIngredientsByIds(supabase, externalIngredientIds)
      ).filter((ing) => ing.is_active && ing.is_stock_tracked);
      const ledgerIngredients = [...ledgerFreshIngredients, ...externalIngredients];
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
        ledgerIngredients.map((ing) => ing.id),
        date
      );

      const localLedgerPayload: StockLedgerInsert[] = ledgerFreshIngredients.map((ing) => {
        const existing = existingLedgerMap.get(ing.id);
        const masterStock = Number(ing.current_stock);
        const receive_qty = receiveInputToStockQty(
          ing,
          String(receiveTotals.get(ing.id) ?? 0)
        );
        const opening_stock = existing
          ? existing.opening_stock
          : Math.max(
              0,
              Number.isFinite(masterStock)
                ? masterStock - receive_qty
                : previousClosingMap.get(ing.id) ?? 0
            );
        const premix_output_qty = premixOutputMap.get(ing.id) ?? 0;
        const in_qty = receive_qty + premix_output_qty;
        const out_qty = outTotalMap.get(ing.id) ?? 0;
        const menu_theoretical = menuTheoreticalMap.get(ing.id) ?? 0;
        const issue_theoretical = issueTheoreticalMap.get(ing.id) ?? 0;
        const premix_theoretical = premixUsageMap.get(ing.id) ?? 0;
        const theoretical_usage = menu_theoretical + issue_theoretical + premix_theoretical;
        const expected_closing = opening_stock + in_qty - theoretical_usage;
        const hasPhysicalOpname = opnameTotalMap.has(ing.id);

        const closing_stock = hasPhysicalOpname
          ? opnameTotalMap.get(ing.id) ?? 0
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
        const premix_output_qty = premixOutputMap.get(ing.id) ?? 0;
        const existing_other_in = existing
          ? Math.max(0, Number(existing.in_qty) - premix_output_qty)
          : 0;
        const in_qty = existing_other_in + premix_output_qty;
        const menu_theoretical = menuTheoreticalMap.get(ing.id) ?? 0;
        const issue_theoretical = issueTheoreticalMap.get(ing.id) ?? 0;
        const premix_theoretical = premixUsageMap.get(ing.id) ?? 0;
        const current_known_theoretical =
          menu_theoretical + issue_theoretical + premix_theoretical;
        const existing_other_theoretical = existing
          ? Math.max(0, Number(existing.theoretical_usage) - current_known_theoretical)
          : 0;
        const theoretical_usage = current_known_theoretical + existing_other_theoretical;
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

      const stockUpdateResults = await Promise.all(
        ledgerPayload.map((row) =>
          supabase
            .from("ingredient")
            .update({ current_stock: row.closing_stock })
            .eq("id", row.ingredient_id)
        )
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

      const aggregatedLinesForEvaluation = ledgerFreshIngredients.reduce<Record<string, IngredientLineState>>(
        (acc, ing) => {
          const existing = lines[ing.id] ?? DEFAULT_LINE;
          acc[ing.id] = {
            ...existing,
            outQty: outTotalMap.has(ing.id) ? String(outTotalMap.get(ing.id)) : "",
            closingStock: opnameTotalMap.has(ing.id) ? String(opnameTotalMap.get(ing.id)) : "",
          };
          return acc;
        },
        {}
      );

      opnameEvalForAsync = evaluateOpnameSubmission({
        ingredients: ledgerFreshIngredients,
        lines: aggregatedLinesForEvaluation,
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
        : "LOCKED";

      await finalizeWorksheetSession({
        supabase,
        sessionId: ensuredSessionId,
        businessDate: date,
        department,
        staffId: submittingStaffId,
        submittedAt,
        status: finalStatus,
      });

      setWorksheetStatus(finalStatus);

      const { error: dayErr } = await supabase
        .from("business_day")
        .update({ status: finalStatus })
        .eq("business_date", date);

      if (dayErr) throw new Error(dayErr.message);

      clearDraftAfterSuccess();
      showSuccessToast(
        `Worksheet ${formatBusinessDateLabel(date)} department ${department} berhasil dikunci.`
      );
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
      <main className="flex min-h-screen items-center justify-center bg-white text-slate-600">
        <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
      </main>
    );
  }

  const showBlockingOverlay =
    isSubmitting ||
    isSavingAll ||
    isSavingReceive ||
    isSavingOutStock ||
    isSavingOpname ||
    isSavingPremix ||
    isSavingMenuProgress ||
    isRequestingResubmit ||
    isChangingBusinessDate;

  const overlayMessage = isSubmitting
    ? "Mengirim laporan closing…"
    : isSavingAll
      ? "Menyimpan inventory…"
    : isChangingBusinessDate
      ? "Memuat tanggal inventory…"
      : isRequestingResubmit
        ? canApproveCorrection
          ? "Membuka kembali inventory…"
          : "Mengirim request koreksi…"
      : isSavingReceive
        ? "Menyimpan pasokan…"
          : isSavingOutStock
            ? "Menyimpan out stock…"
            : isSavingPremix
              ? "Menyimpan premix…"
              : isSavingMenuProgress
                ? "Menyimpan sales menu…"
                : "Menyimpan opname…";

  const activeTabEnabled = worksheetFeatures[activeTab];

  const stickySaveAll = () =>
    runWithTypoGuard(
      ["inQty", "closingStock", "outQty"],
      buildAllWorksheetPreviewEntries(),
      () => void handleSaveAllProgress()
    );

  const stickySubmit = () => {
    if (!canFinalizeWorksheet) return;
    runWithTypoGuard(
      ["inQty", "closingStock", "outQty"],
      buildAllWorksheetPreviewEntries(),
      () => void handleSubmit()
    );
  };

  return (
    <main
      className={
        embedded
          ? "w-full bg-white pb-32"
          : "mx-auto min-h-screen max-w-lg bg-white pb-48"
      }
    >
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
        previewEntries={typoPreviewEntries}
        onCancel={() => {
          setTypoModalOpen(false);
          setTypoWarnings([]);
          setTypoPreviewEntries([]);
          pendingTypoActionRef.current = null;
        }}
        onConfirm={() => {
          setTypoModalOpen(false);
          setTypoWarnings([]);
          setTypoPreviewEntries([]);
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
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-sm"
        >
          <Loader2 className="h-10 w-10 animate-spin text-teal-700" />
          <p className="text-sm font-medium text-slate-800">{overlayMessage}</p>
        </div>
      ) : null}

      {!embedded ? (
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <AbdulCompanyMark
                size="sm"
                className="mb-2"
              />
              <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">
                Inventory {departmentLabel}
              </p>
              <h1 className="mt-0.5 truncate text-xl font-bold text-slate-900">{inventoryTitle}</h1>
              <p className="mt-1 truncate text-xs text-slate-600">Operator: {staff.name}</p>
            </div>
            <LogoutButton className="shrink-0 min-h-10 rounded-lg border border-slate-200/80 px-3 text-sm font-medium text-slate-700 hover:border-slate-200/80" />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <span className="min-h-9 rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-800">
              {businessDateLabel || "Tanggal belum aktif"}
            </span>
            <span className="inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              {locked ? <Lock className="h-3 w-3 text-teal-700" /> : <Unlock className="h-3 w-3 text-teal-700" />}
              {worksheetStatus || "DRAFT"}
            </span>
          </div>
        </header>
      ) : null}

      <nav
        className={`sticky z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur ${
          embedded ? "top-0" : "top-[142px]"
        } ${embedded ? "px-4 py-2" : "px-2 py-2"}`}
        aria-label="Inventory worksheet tabs"
      >
        <div className={embedded ? "flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between" : ""}>
          <ul className={embedded ? "flex gap-2 overflow-x-auto" : "grid grid-cols-4 gap-1"}>
            {visibleTabs.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <li key={id} className={embedded ? "shrink-0" : ""}>
                  <button
                    type="button"
                    onClick={() => setActiveTab(id)}
                    className={`flex text-center transition active:scale-[0.98] ${
                      active
                        ? embedded
                          ? "border-teal-600 bg-teal-600 text-white shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] "
                          : "bg-teal-600 text-white shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] "
                        : embedded
                          ? "border-slate-200/80 bg-slate-50 text-slate-600 hover:border-slate-200/80 hover:text-slate-900"
                          : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    } ${
                      embedded
                        ? "min-h-11 items-center justify-center gap-2 rounded-lg border px-4"
                        : "min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active && !embedded ? "text-amber-900" : ""}`} />
                    <span
                      className={
                        embedded
                          ? "text-sm font-semibold"
                          : "text-[10px] font-bold uppercase leading-tight tracking-wide"
                      }
                    >
                      {label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {embedded ? (
            <div className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
              {businessDateLabel ? (
                <span className="rounded-md border border-slate-200/80 bg-slate-50 px-2.5 py-1 font-semibold text-slate-800">
                  {businessDateLabel}
                </span>
              ) : null}
              {worksheetStatus ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 font-semibold uppercase tracking-wide text-slate-600">
                  {locked ? <Lock className="h-3 w-3 text-teal-700" /> : null}
                  {worksheetStatus}
                </span>
              ) : null}
              <span className="hidden sm:inline">{staff.name}</span>
              <span className="hidden rounded-md border border-slate-200/80 bg-slate-50 px-2.5 py-1 font-semibold text-slate-700 md:inline">
                {moduleCountLabel}
              </span>
            </div>
          ) : null}
        </div>
      </nav>

      {!embedded && visibleTabs.length === 0 ? (
        <section className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Inventory nonaktif.
        </section>
      ) : null}

      <section
        className={
          embedded
            ? "border-b border-slate-200/80 bg-slate-50 px-4 py-3"
            : "border-b border-teal-200 bg-teal-50 px-4 py-3"
        }
      >
        <div className={embedded ? "flex flex-col gap-3 lg:flex-row lg:items-center" : ""}>
          <div className={embedded ? "hidden" : ""}>
            <div className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${embedded ? "text-teal-700" : "text-teal-700"}`}>
            <CalendarDays className="h-4 w-4" />
            Tanggal
            </div>
          </div>
          <div className={embedded ? "flex flex-col gap-2 sm:flex-row sm:items-center lg:w-auto" : "mt-2 flex flex-col gap-2 sm:flex-row"}>
            {embedded ? (
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                <CalendarDays className="h-4 w-4" />
                Tanggal
              </div>
            ) : null}
            <input
              type="date"
              value={testBusinessDate}
              onChange={(e) => setTestBusinessDate(e.target.value)}
              className={`min-h-11 rounded-lg border bg-white px-3 text-sm text-slate-900 ${
                embedded ? "w-full border-slate-200/80 sm:w-44" : "flex-1 border-teal-200"
              }`}
              aria-label="Tanggal business date inventory"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isChangingBusinessDate}
                onClick={() => void applyTestBusinessDate()}
                className={`min-h-11 rounded-lg px-3 text-sm font-bold disabled:opacity-50 ${
                  embedded ? "bg-teal-600 text-white" : "bg-teal-600 text-white"
                }`}
              >
                Pakai
              </button>
              <button
                type="button"
                disabled={isChangingBusinessDate}
                onClick={() => void clearTestBusinessDate()}
                className="min-h-11 rounded-lg border border-slate-200/80 px-3 text-sm font-semibold text-slate-700"
              >
                Hari Ini
              </button>
            </div>
          </div>
          {embedded && !isLoading && (ingredients.length > 0 || menus.length > 0 || premixItems.length > 0) ? (
            <div className="relative w-full lg:ml-auto lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  activeTab === "sold"
                    ? "Cari menu..."
                    : activeTab === "issue"
                      ? "Cari remake..."
                    : activeTab === "premix"
                      ? "Cari premix..."
                      : "Cari bahan..."
                }
                autoCorrect="off"
                spellCheck={false}
                className={SEARCH_INPUT_CLASS}
                aria-label="Pencarian cepat inventory"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-600 hover:text-slate-800"
                  aria-label="Hapus pencarian"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {!embedded && !isLoading && (ingredients.length > 0 || menus.length > 0 || premixItems.length > 0) ? (
        <div className="px-4 pt-3">
          <div className="relative mb-4 w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={
                  activeTab === "sold"
                    ? "Cari menu…"
                    : activeTab === "issue"
                      ? "Cari remake…"
                    : activeTab === "premix"
                      ? "Cari premix…"
                      : "Cari bahan…"
                }
              autoCorrect="off"
              spellCheck={false}
              className={SEARCH_INPUT_CLASS}
              aria-label="Pencarian cepat inventory"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-600 hover:text-slate-800"
                aria-label="Hapus pencarian"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="px-4 pt-4">
        {pendingAdminApproval ? (
          <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 p-4">
            <p className="text-sm font-semibold text-teal-700">Terkirim</p>
          </div>
        ) : null}

        {locked ? (
          <div className="mb-4 rounded-xl border border-teal-200 bg-teal-50 p-4">
            <div className="flex items-start gap-3">
              <Lock className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-teal-700">
                  Terkunci
                </p>
                {editRequest ? (
                  <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-50 px-3 py-2">
                    <p className="text-xs font-semibold text-amber-900">
                      Menunggu approval
                    </p>
                    <p className="mt-1 text-xs text-amber-900">{editRequest.reason}</p>
                  </div>
                ) : showResubmitCta && canEdit ? (
                  <>
                    {!canApproveCorrection ? (
                      <label className="mt-3 block">
                        <span className="mb-1 block text-xs font-medium text-teal-700">
                          Alasan koreksi
                        </span>
                        <textarea
                          rows={3}
                          value={correctionReason}
                          onChange={(e) => setCorrectionReason(e.target.value)}
                          placeholder="Contoh: Receive shift 2 ketinggalan input"
                          className="w-full rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-100"
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        isRequestingResubmit ||
                        isSubmitting ||
                        (!canApproveCorrection && !correctionReasonReady)
                      }
                      onClick={() => void handleRequestResubmit()}
                      className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-amber-400/50 bg-amber-50 px-4 text-sm font-bold text-amber-900 active:bg-amber-100 disabled:opacity-50"
                    >
                      {isRequestingResubmit ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Unlock className="h-4 w-4" />
                      )}
                      {canApproveCorrection ? "Buka Worksheet" : "Ajukan Koreksi"}
                    </button>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-teal-700">
                    Hubungi Admin.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-600">
            <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
            Memuat data…
          </div>
                ) : ingredients.length === 0 && activeTab !== "premix" && activeTab !== "issue" && activeTab !== "sold" ? (
          <p className="py-12 text-center text-slate-600">
            Belum ada bahan.
          </p>
        ) : (
          <>
            {activeTabEnabled && activeTab === "receive" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-amber-700">
                  Receive
                </h2>
                <ul className="space-y-3">
                  {filteredReceiveIngredients.length === 0 ? (
                    <li className="rounded-xl border border-slate-200/80 bg-white px-4 py-6 text-center text-sm text-slate-600">
                      Tidak ditemukan.
                    </li>
                  ) : null}
                  {filteredReceiveIngredients.map((ing) => {
                    const line = lines[ing.id] ?? DEFAULT_LINE;
                    const purchaseUnit = getPurchaseUnit(ing);
                    const totalReceiveQty = parseQty(line.inQty);
                    const entryQty = parseQty(receiveEntryInputs[ing.id] ?? "");
                    const entryStockQty = receiveInputToStockQty(
                      ing,
                      receiveEntryInputs[ing.id] ?? ""
                    );
                    const receiveSummaries = receiveEntrySummaries[ing.id] ?? [];
                    const ownSavedReceiveQty = receiveSummaries
                      .filter((entry) =>
                        isCurrentStaffOwner({ staffId: entry.staffId, staffName: entry.staffName })
                      )
                      .reduce((sum, entry) => sum + entry.quantity, 0);
                    const afterSaveReceiveQty = Math.max(
                      0,
                      totalReceiveQty - ownSavedReceiveQty + entryQty
                    );
                    return (
                      <li
                        key={ing.id}
                        className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]"
                      >
                        <div className="mb-3">
                          <p className="font-semibold text-slate-900">{ing.name}</p>
                          <p className="text-xs text-slate-600">
                            Total{" "}
                            <span className="font-semibold text-amber-900">
                              {formatQty(totalReceiveQty)} {purchaseUnit}
                            </span>
                          </p>
                          {receiveSummaries.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {receiveSummaries.map((entry, index) => (
                                <span
                                  key={`${entry.staffId ?? "legacy"}-${index}`}
                                  className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                                    isCurrentStaffOwner({ staffId: entry.staffId, staffName: entry.staffName })
                                      ? "border-teal-200 bg-teal-50 text-teal-700"
                                      : "border-teal-200 bg-teal-50 text-teal-700"
                                  }`}
                                >
                                  {entry.staffName}: {formatQty(entry.quantity)} {purchaseUnit}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                          <label className="block">
                            <span className="mb-1 block text-xs text-slate-600">
                              Receive ({purchaseUnit})
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
                          <div className="rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-right">
                            <p className="text-[10px] uppercase tracking-wide text-slate-600">
                              Preview
                            </p>
                            <p className="text-sm font-semibold tabular-nums text-slate-900">
                              {formatQty(afterSaveReceiveQty)} {purchaseUnit}
                            </p>
                          </div>
                        </div>
                        {purchaseUnit !== ing.unit && entryQty > 0 ? (
                          <p className="mt-2 text-xs text-teal-700">
                            +{formatQty(entryStockQty)} {ing.unit}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {activeTabEnabled && activeTab === "outstock" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-amber-700">
                  Out Stock
                </h2>
                <ul className="space-y-3">
                  {filteredIngredients.length === 0 ? (
                    <li className="rounded-xl border border-slate-200/80 bg-white px-4 py-6 text-center text-sm text-slate-600">
                      Tidak ditemukan.
                    </li>
                  ) : null}
                  {filteredIngredients.map((ing) => {
                    const line = lines[ing.id] ?? DEFAULT_LINE;
                    const validation = validateOutstockLine(ing, line);
                    const showOutFields = validation.outQty > 0;
                    const isSpoilOutflow = line.outflowType === "spoil";
                    const qtyInputInvalid = validation.exceedsStock;
                    const isUploadingPhoto = uploadingPhotoFor === ing.id;
                    const owner = outLineOwners[ing.id];
                    const ownedByOther = isOwnedByOther(owner);
                    const inputDisabled = locked || ownedByOther;
                    const outSummaries = outEntrySummaries[ing.id] ?? [];
                    const outPhotoItems = buildStoredPhotoItems(
                      line.outPhotoUrl,
                      line.outPhotoPublicId
                    );

                    return (
                      <li
                        id={`worksheet-outstock-${ing.id}`}
                        key={ing.id}
                        className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]"
                      >
                        <div className="mb-3">
                          <p className="font-semibold text-slate-900">{ing.name}</p>
                          {owner ? (
                            <p className={`mt-1 text-xs font-medium ${ownedByOther ? "text-amber-900" : "text-teal-700"}`}>
                              {formatOwnerLabel(owner)}
                            </p>
                          ) : null}
                          {renderEntrySummaries(outSummaries, ing.unit)}
                        </div>
                        <label className="mb-3 block">
                          <span className="mb-1 block text-xs text-slate-600">
                            Out Stock ({ing.unit})
                          </span>
                          <p className="mb-2 text-xs font-medium text-teal-700">
                            {formatStockAvailability(ing)}
                          </p>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            disabled={inputDisabled}
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
                            <p className="mt-2 text-xs text-rose-700" role="alert">
                              {OUTSTOCK_LOGICAL_FALLACY_MESSAGE}
                            </p>
                          ) : null}
                        </label>
                        {showOutFields ? (
                          <div className="block">
                            <label className="block">
                              <span className="mb-1 block text-xs text-slate-600">
                                Keterangan
                              </span>
                              <textarea
                                rows={3}
                                disabled={inputDisabled || isUploadingPhoto}
                                value={line.outNote}
                                onChange={(e) => updateOutNote(ing.id, e.target.value)}
                                placeholder="Contoh: stok keluar untuk produksi, tumpah, expired"
                                autoCorrect="off"
                                spellCheck={false}
                                className="min-h-24 w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-100"
                              />
                            </label>
                            <div
                              className={`mt-3 rounded-lg border p-3 transition ${
                                isSpoilOutflow
                                  ? "border-amber-200 bg-amber-50"
                                  : "border-slate-200/80 bg-white"
                              }`}
                            >
                              <label className="flex items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={isSpoilOutflow}
                                  disabled={inputDisabled || isUploadingPhoto}
                                  onChange={(event) => updateOutflowType(ing.id, event.target.checked)}
                                  className="sr-only"
                                />
                                <span
                                  className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full border p-0.5 transition ${
                                    isSpoilOutflow
                                      ? "border-amber-300/70 bg-amber-400/40"
                                      : "border-slate-200/80 bg-slate-50"
                                  } ${inputDisabled || isUploadingPhoto ? "opacity-50" : ""}`}
                                  aria-hidden="true"
                                >
                                  <span
                                    className={`h-5 w-5 rounded-full transition ${
                                      isSpoilOutflow
                                        ? "translate-x-5 bg-amber-100"
                                        : "translate-x-0 bg-slate-500"
                                    }`}
                                  />
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-xs font-semibold text-slate-900">
                                    Tandai sebagai Spoil / Loss
                                  </span>
                                  <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                                    Aktifkan hanya kalau barang keluar karena rusak, tumpah, expired, atau kesalahan kerja.
                                  </span>
                                </span>
                              </label>
                              {isSpoilOutflow ? (
                                <div className="mt-3 border-t border-amber-300/20 pt-3">
                                  <span className="mb-1 block text-xs font-semibold text-amber-900">
                                    PIC potongan service
                                  </span>
                                  <select
                                    disabled={inputDisabled || isUploadingPhoto}
                                    value={
                                      line.outResponsibilityScope === "staff" && line.outResponsibleStaffId
                                        ? `staff:${line.outResponsibleStaffId}`
                                        : line.outResponsibilityScope === "staff"
                                          ? "unknown"
                                          : line.outResponsibilityScope
                                    }
                                    onChange={(event) => updateOutResponsibility(ing.id, event.target.value)}
                                    className="min-h-10 w-full rounded-lg border border-slate-200/80 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <option value="unknown">Abu-abu / belum jelas PIC - potong team dept</option>
                                    <option value="general">General team loss - potong team dept</option>
                                    {departmentStaffOptions.map((staffOption) => (
                                      <option key={staffOption.id} value={`staff:${staffOption.id}`}>
                                        {staffOption.name} - potong pribadi
                                      </option>
                                    ))}
                                  </select>
                                  <p className="mt-1 text-xs leading-relaxed text-amber-900">
                                    Yang input data tidak otomatis disalahkan. Pilih nama hanya kalau memang sudah jelas PIC kesalahannya.
                                  </p>
                                </div>
                              ) : (
                                <p className="mt-3 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-relaxed text-teal-700">
                                  Mode operasional: barang keluar normal dan tidak masuk potongan service.
                                </p>
                              )}
                            </div>
                            <div className="mt-3 rounded-lg border border-slate-200/80 bg-white p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="flex items-center gap-1 text-xs font-medium text-slate-700">
                                    <Camera className="h-3.5 w-3.5" />
                                    Foto
                                  </p>
                                </div>
                                <label className="shrink-0">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    disabled={inputDisabled || isUploadingPhoto}
                                    onChange={(e) => {
                                      const files = Array.from(e.target.files ?? []);
                                      e.currentTarget.value = "";
                                      void uploadOutStockPhotos(ing.id, files);
                                    }}
                                    className="sr-only"
                                  />
                                  <span className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-teal-200 bg-teal-600/15 px-3 text-xs font-semibold text-teal-700">
                                    {isUploadingPhoto ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <ImageIcon className="h-4 w-4" />
                                    )}
                                    {outPhotoItems.length > 0 ? "Tambah" : "Upload"}
                                  </span>
                                </label>
                              </div>
                              {outPhotoItems.length > 0 ? (
                                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                  {outPhotoItems.map((photo, photoIndex) => (
                                    <div
                                      key={`${photo.url}-${photoIndex}`}
                                      className="rounded-lg border border-slate-200/80 bg-white p-2"
                                    >
                                      <a href={photo.url} target="_blank" rel="noreferrer">
                                        <img
                                          src={photo.url}
                                          alt={`Bukti out stock ${ing.name} ${photoIndex + 1}`}
                                          className="aspect-square w-full rounded-md object-cover ring-1 ring-slate-200/80"
                                        />
                                      </a>
                                      <div className="mt-2 flex items-center justify-between gap-2">
                                        <a
                                          href={photo.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="truncate text-xs font-medium text-teal-700 hover:text-teal-700"
                                        >
                                          Foto {photoIndex + 1}
                                        </a>
                                        <button
                                          type="button"
                                          disabled={inputDisabled || isUploadingPhoto}
                                          onClick={() => removeOutPhoto(ing.id, photoIndex)}
                                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-rose-700 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                          aria-label={`Hapus foto out stock ${photoIndex + 1}`}
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {activeTabEnabled && activeTab === "opname" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-teal-700">
                  Opname
                </h2>
                <ul className="space-y-3">
                  {filteredIngredients.length === 0 ? (
                    <li className="rounded-xl border border-slate-200/80 bg-white px-4 py-6 text-center text-sm text-slate-600">
                      Tidak ditemukan.
                    </li>
                  ) : null}
                  {filteredIngredients.map((ing) => {
                    const line = lines[ing.id] ?? DEFAULT_LINE;
                    const owner = opnameLineOwners[ing.id];
                    const ownedByOther = isOwnedByOther(owner);
                    const opnameSummaries = opnameEntrySummaries[ing.id] ?? [];
                    return (
                      <li
                        key={ing.id}
                        className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]"
                      >
                        <div className="mb-3">
                          <p className="font-semibold text-slate-900">{ing.name}</p>
                          {owner ? (
                            <p className={`mt-1 text-xs font-medium ${ownedByOther ? "text-amber-900" : "text-teal-700"}`}>
                              {formatOwnerLabel(owner)}
                            </p>
                          ) : null}
                          {renderEntrySummaries(opnameSummaries, ing.unit)}
                        </div>
                        <label className="block">
                          <span className="mb-1 block text-xs text-slate-600">
                            Opname ({ing.unit})
                          </span>
                          <p className="mb-2 text-xs font-medium text-teal-700">
                            {formatSystemStockGuide(ing)}
                          </p>
                          <input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            disabled={locked || ownedByOther}
                            value={line.closingStock}
                            onChange={(e) => updateClosingStock(ing.id, e.target.value)}
                            placeholder="Kosong"
                            className={INPUT_CLASS}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {activeTabEnabled && activeTab === "premix" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-teal-700">
                  Premix
                </h2>
                {premixItems.length === 0 ? (
                  <p className="rounded-xl border border-slate-200/80 bg-white px-4 py-6 text-center text-sm text-slate-600">
                    Belum ada premix.
                  </p>
                ) : filteredPremixItems.length === 0 ? (
                  <p className="rounded-xl border border-slate-200/80 bg-white px-4 py-6 text-center text-sm text-slate-600">
                    Tidak ditemukan.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {filteredPremixItems.map((premix) => {
                      const recipe = getActivePremixRecipe(premix);
                      const qtyValue = premixQuantities[premix.id] ?? "";
                      const qty = parseQty(qtyValue);
                      const yieldQty = Number(recipe?.yield_quantity ?? 1);
                      const outputQty = qty * yieldQty;
                      const owner = premixLineOwners[premix.id];
                      const ownedByOther = isOwnedByOther(owner);
                      const inputDisabled = locked || ownedByOther;
                      const premixSummaries = premixEntrySummaries[premix.id] ?? [];
                      const savedEditablePremixQty = editableSummaryQuantity(premixSummaries);

                      return (
                        <li
                          key={premix.id}
                          className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]"
                        >
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">{premix.name}</p>
                              <p className="text-xs text-slate-600">
                                {yieldQty.toLocaleString("id-ID")} {premix.unit}
                              </p>
                              {owner ? (
                                <p className={`mt-1 text-xs font-medium ${ownedByOther ? "text-amber-900" : "text-teal-700"}`}>
                                  {formatOwnerLabel(owner)}
                                </p>
                              ) : null}
                              {renderEntrySummaries(premixSummaries, "batch")}
                            </div>
                            <Beaker className="h-5 w-5 shrink-0 text-teal-700" />
                          </div>

                          <label className="block">
                            <span className="mb-1 block text-xs text-slate-600">
                              Jumlah
                            </span>
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={inputDisabled}
                                onClick={() => adjustPremixQty(premix.id, -1)}
                                className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-800 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Minus className="h-5 w-5" />
                              </button>
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="any"
                                disabled={inputDisabled || !recipe}
                                value={qtyValue}
                                onChange={(e) => updatePremixQty(premix.id, e.target.value)}
                                placeholder="Kosong"
                                className={`${INPUT_CLASS} text-center`}
                              />
                              <button
                                type="button"
                                disabled={inputDisabled || !recipe}
                                onClick={() => adjustPremixQty(premix.id, 1)}
                                className="flex h-12 w-12 items-center justify-center rounded-lg border border-teal-200 bg-teal-50 text-teal-700 active:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Plus className="h-5 w-5" />
                              </button>
                            </div>
                          </label>
                          {qty > 0 && recipe ? (
                            <p className="mt-2 text-xs font-medium text-teal-700">
                              Output {outputQty.toLocaleString("id-ID")} {premix.unit}
                            </p>
                          ) : null}
                          {!recipe ? (
                            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              Belum ada resep.
                            </p>
                          ) : recipe.recipe_component.length > 0 ? (
                            <div className="mt-3 rounded-lg border border-slate-200/80 bg-white p-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Bahan</p>
                              <ul className="space-y-1.5 text-xs">
                                {recipe.recipe_component.map((component) => {
                                  const componentIng = component.ingredient;
                                  const liveComponentIng = componentIng
                                    ? ingredientById.get(componentIng.id) ?? componentIng
                                    : null;
                                  const required = Number(component.qty_per_batch) * qty;
                                  const receiveDelta = liveComponentIng
                                    ? getPendingReceiveStockDeltaForIngredient(liveComponentIng)
                                    : 0;
                                  const baseStock = liveComponentIng
                                    ? getOpnameBaseStockQtyForIngredient(liveComponentIng)
                                    : { quantity: 0, source: "master" as const };
                                  const savedEditableUsage =
                                    Number(component.qty_per_batch) * savedEditablePremixQty;
                                  const available = liveComponentIng
                                    ? baseStock.quantity + receiveDelta + savedEditableUsage
                                    : 0;
                                  const unlimited = liveComponentIng?.is_stock_tracked === false;
                                  const enough = unlimited || required <= available;
                                  return (
                                    <li
                                      key={component.ingredient_id}
                                      className="flex justify-between gap-3 text-slate-700"
                                    >
                                      <span>{liveComponentIng?.name ?? componentIng?.name ?? component.ingredient_id}</span>
                                      <span className="flex flex-col items-end text-right">
                                        <span className={enough ? "text-slate-600" : "text-rose-700"}>
                                          {required.toLocaleString("id-ID")} {liveComponentIng?.unit ?? componentIng?.unit ?? ""}{" "}
                                          {unlimited
                                            ? "(non-stok)"
                                            : `/ tersedia ${available.toLocaleString("id-ID")}`}
                                        </span>
                                        {!unlimited && receiveDelta !== 0 ? (
                                          <span className={`text-[11px] ${receiveDelta > 0 ? "text-teal-700" : "text-amber-900"}`}>
                                            {baseStock.source === "opname" ? "opname" : "stok"}{" "}
                                            {baseStock.quantity.toLocaleString("id-ID")}{" "}
                                            {receiveDelta > 0 ? "+ receive" : "- koreksi receive"}{" "}
                                            {Math.abs(receiveDelta).toLocaleString("id-ID")}
                                          </span>
                                        ) : !unlimited && savedEditableUsage > 0 ? (
                                          <span className="text-[11px] text-teal-700">
                                            {baseStock.source === "opname" ? "opname" : "stok"}{" "}
                                            {baseStock.quantity.toLocaleString("id-ID")} + premix tersimpan{" "}
                                            {savedEditableUsage.toLocaleString("id-ID")}
                                          </span>
                                        ) : !unlimited && baseStock.source === "opname" ? (
                                          <span className="text-[11px] text-teal-700">
                                            Opname {baseStock.quantity.toLocaleString("id-ID")}
                                          </span>
                                        ) : null}
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

            {activeTabEnabled && activeTab === "issue" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-red-700">
                  Remake
                </h2>
                {filteredIssueMenus.length === 0 ? (
                  <p className="rounded-xl border border-slate-200/80 bg-white px-4 py-6 text-center text-sm text-slate-600">
                    Tidak ditemukan.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {filteredIssueMenus.map((menu) => {
                      const issue = menuIssues[menu.id] ?? createDefaultMenuIssue();
                      const issueQty = parseQty(issue.quantity);
                      const showIssueResponsibility = issueQty > 0;
                      const isServiceDeductibleIssue = isServiceDeductibleMenuIssueReason(issue.reason);
                      const hasRecipe = getActiveRecipeLines(menu).length > 0;
                      const owner = issueLineOwners[menu.id];
                      const ownedByOther = isOwnedByOther(owner);
                      const inputDisabled = locked || ownedByOther;
                      const issueSummaries = issueEntrySummaries[menu.id] ?? [];
                      const issuePhotoItems = buildStoredPhotoItems(
                        issue.photoUrl,
                        issue.photoPublicId
                      );
                      return (
                        <li
                          key={menu.id}
                          className="rounded-xl border border-slate-200/80 bg-white p-4"
                        >
                          <div className="mb-3">
                            <p className="font-semibold text-slate-900">{menu.menu_name}</p>
                            {!hasRecipe ? <p className="text-xs text-slate-600">Tanpa resep</p> : null}
                            {owner ? (
                              <p className={`mt-1 text-xs font-medium ${ownedByOther ? "text-amber-900" : "text-teal-700"}`}>
                                {formatOwnerLabel(owner)}
                              </p>
                            ) : null}
                            {renderEntrySummaries(issueSummaries, "porsi")}
                          </div>
                          <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
                            <label className="block">
                              <span className="mb-1 block text-xs text-slate-600">Qty</span>
                              <input
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step={1}
                                disabled={inputDisabled}
                                value={issue.quantity}
                                onChange={(e) =>
                                  updateMenuIssue(menu.id, { quantity: e.target.value })
                                }
                                placeholder="-"
                                className={INPUT_CLASS}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-xs text-slate-600">Alasan</span>
                              <select
                                disabled={inputDisabled}
                                value={issue.reason}
                                onChange={(e) => {
                                  const nextReason = normalizeIssueReason(e.target.value);
                                  updateMenuIssue(menu.id, {
                                    reason: nextReason,
                                    ...(isServiceDeductibleMenuIssueReason(nextReason)
                                      ? {}
                                      : { lossResponsibilityScope: "unknown", responsibleStaffId: "" }),
                                  });
                                }}
                                className="min-h-12 w-full rounded-lg border border-slate-200/80 bg-white px-3 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
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
                            <span className="mb-1 block text-xs text-slate-600">
                              Catatan
                            </span>
                            <input
                              type="text"
                              disabled={inputDisabled}
                              value={issue.note}
                              onChange={(e) =>
                                updateMenuIssue(menu.id, { note: e.target.value })
                              }
                              placeholder="Contoh: tamu minta diganti karena terlalu asin"
                              className="min-h-11 w-full rounded-lg border border-slate-200/80 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                          </label>
                          {showIssueResponsibility ? (
                            <div
                              className={`mt-3 rounded-lg border p-3 transition ${
                                isServiceDeductibleIssue
                                  ? "border-amber-200 bg-amber-50"
                                  : "border-teal-200 bg-teal-50"
                              }`}
                            >
                              {isServiceDeductibleIssue ? (
                                <>
                                  <span className="mb-1 block text-xs font-semibold text-amber-900">
                                    PIC potongan service remake
                                  </span>
                                  <select
                                    disabled={inputDisabled || uploadingPhotoFor === `issue-${menu.id}`}
                                    value={
                                      issue.lossResponsibilityScope === "staff" && issue.responsibleStaffId
                                        ? `staff:${issue.responsibleStaffId}`
                                        : issue.lossResponsibilityScope === "staff"
                                          ? "unknown"
                                          : issue.lossResponsibilityScope
                                    }
                                    onChange={(event) => updateMenuIssueResponsibility(menu.id, event.target.value)}
                                    className="min-h-10 w-full rounded-lg border border-slate-200/80 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <option value="unknown">Abu-abu / belum jelas PIC - potong team dept</option>
                                    <option value="general">General team error - potong team dept</option>
                                    {departmentStaffOptions.map((staffOption) => (
                                      <option key={staffOption.id} value={`staff:${staffOption.id}`}>
                                        {staffOption.name} - potong pribadi
                                      </option>
                                    ))}
                                  </select>
                                  <p className="mt-1 text-xs leading-relaxed text-amber-900">
                                    Yang input remake tidak otomatis disalahkan. Pilih nama hanya kalau PIC kesalahannya sudah jelas.
                                  </p>
                                </>
                              ) : (
                                <p className="text-xs leading-relaxed text-teal-700">
                                  Complaint tamu / quality note: tetap tercatat sebagai remake, tapi tidak masuk potongan service.
                                </p>
                              )}
                            </div>
                          ) : null}
                          <div className="mt-3 rounded-lg border border-slate-200/80 bg-white p-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <span className="text-xs font-medium text-slate-600">
                                Foto
                              </span>
                            </div>
                            {issuePhotoItems.length > 0 ? (
                              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {issuePhotoItems.map((photo, photoIndex) => (
                                  <div
                                    key={`${photo.url}-${photoIndex}`}
                                    className="rounded-lg border border-slate-200/80 bg-white p-2"
                                  >
                                    <a href={photo.url} target="_blank" rel="noreferrer">
                                      <img
                                        src={photo.url}
                                        alt={`Bukti remake ${menu.menu_name} ${photoIndex + 1}`}
                                        className="aspect-square w-full rounded-md object-cover ring-1 ring-slate-200/80"
                                      />
                                    </a>
                                    <div className="mt-2 flex items-center justify-between gap-2">
                                      <a
                                        href={photo.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="truncate text-xs font-medium text-teal-700 hover:text-teal-700"
                                      >
                                        Foto {photoIndex + 1}
                                      </a>
                                      <button
                                        type="button"
                                        disabled={inputDisabled || uploadingPhotoFor === `issue-${menu.id}`}
                                        onClick={() => removeMenuIssuePhoto(menu.id, photoIndex)}
                                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-rose-700 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                        aria-label={`Hapus foto remake ${photoIndex + 1}`}
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50 px-3 text-sm font-medium text-slate-800 active:bg-slate-100">
                              {uploadingPhotoFor === `issue-${menu.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Camera className="h-4 w-4" />
                              )}
                              {uploadingPhotoFor === `issue-${menu.id}`
                                ? "Upload foto..."
                                : issuePhotoItems.length > 0
                                  ? "Tambah foto"
                                  : "Upload foto"}
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                disabled={inputDisabled || uploadingPhotoFor === `issue-${menu.id}`}
                                onChange={(e) => {
                                  void uploadMenuIssuePhotos(
                                    menu.id,
                                    Array.from(e.target.files ?? [])
                                  );
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

            {activeTabEnabled && activeTab === "sold" ? (
              <section>
                <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-teal-700">
                  Menu
                </h2>
                {menus.length === 0 ? (
                  <p className="rounded-xl border border-slate-200/80 bg-white px-4 py-6 text-center text-sm text-slate-600">
                    Belum ada menu.
                  </p>
                ) : filteredMenus.length === 0 ? (
                  <p className="rounded-xl border border-slate-200/80 bg-white px-4 py-6 text-center text-sm text-slate-600">
                    Tidak ditemukan.
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
                          className="rounded-xl border border-slate-200/80 bg-white px-4 py-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-slate-900">{menu.menu_name}</p>
                              <p className="text-xs text-slate-600">
                                Rp {Number(menu.price).toLocaleString("id-ID")}
                              </p>
                            </div>
                            <div className="shrink-0">
                              <span className="mb-1 block text-right text-xs text-slate-600">
                                Qty
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={locked}
                                  onClick={() => adjustSoldQty(menu.id, -1)}
                                  aria-label={`Kurangi ${menu.menu_name}`}
                                  className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-800 active:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
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
                                  className="min-h-12 w-16 rounded-lg border border-slate-200/80 bg-white px-1 text-center text-lg font-semibold tabular-nums text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                                />
                                <button
                                  type="button"
                                  disabled={locked}
                                  onClick={() => adjustSoldQty(menu.id, 1)}
                                  aria-label={`Tambah ${menu.menu_name}`}
                                  className="flex h-12 w-12 items-center justify-center rounded-lg border border-teal-200 bg-teal-600/20 text-teal-700 active:bg-teal-600/35 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Plus className="h-5 w-5" />
                                </button>
                              </div>
                            </div>
                          </div>
                          {menuSoldEntries.length > 0 ? (
                            <div className="mt-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2">
                              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                                <span className="font-medium text-slate-600">Akumulasi</span>
                                <span className="font-semibold tabular-nums text-teal-700">
                                  {formatQty(totalSold)}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {menuSoldEntries.map((entry) => (
                                  <span
                                    key={`${menu.id}-${entry.staffId ?? entry.staffName}`}
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                      entry.staffId === staff?.id
                                        ? "bg-teal-50 text-teal-700"
                                        : "bg-slate-100 text-slate-700"
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
        <WorksheetStickyActionBar variant={embedded ? "admin" : "staff"}>
          <div className={`grid w-full gap-2 ${canFinalizeWorksheet ? "sm:grid-cols-2" : ""}`}>
            <button
              type="button"
              disabled={isSavingAll || isSubmitting || outstockHasBlockingErrors}
              onClick={stickySaveAll}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 text-center text-sm font-bold leading-tight text-teal-700 active:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingAll ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
              ) : (
                <ClipboardList className="h-5 w-5 shrink-0" />
              )}
              <span>{isSavingAll ? "Menyimpan…" : "Simpan Semua"}</span>
            </button>

            {canFinalizeWorksheet ? (
              <button
                type="button"
                disabled={isSubmitting || isSavingAll}
                onClick={stickySubmit}
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 text-center text-sm font-bold leading-tight text-white shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] active:bg-teal-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:shadow-none"
              >
                {isSubmitting ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Lock className="h-5 w-5 shrink-0" />
                )}
                <span>{isSubmitting ? "Submit…" : "Submit"}</span>
              </button>
            ) : null}
          </div>
        </WorksheetStickyActionBar>
      ) : null}
    </main>
  );
}

export const WorksheetClosing = forwardRef<WorksheetClosingHandle, WorksheetClosingProps>(
  WorksheetClosingInner
);
WorksheetClosing.displayName = "WorksheetClosing";
