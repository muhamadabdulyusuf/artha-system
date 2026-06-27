"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Loader2, RefreshCw, Save } from "lucide-react";
import { canManageStaffAccounts } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, StaffRole } from "@/lib/types/database";

type ServiceStaff = {
  id: string;
  name: string;
  role: StaffRole;
  department: Department | null;
  is_active: boolean;
};

type ServicePoint = {
  point: number;
  isEligible: boolean;
};

type WorksheetSessionLite = {
  id: string;
  business_date: string;
  department: Department;
};

type RevenueLineJoin = {
  session_id: string;
  quantity_sold: number;
  menu_item: { price: number } | { price: number }[] | null;
};

type IngredientJoin = {
  id: string;
  name: string;
  department: Department;
  unit: string;
  default_unit_price: number;
};

type StaffJoin = { name: string } | { name: string }[] | null;

type OutLineJoin = {
  session_id: string;
  quantity: number;
  note: string;
  staff_id: string | null;
  outflow_type: "operational" | "spoil" | null;
  loss_responsibility_scope: "general" | "unknown" | "staff" | null;
  responsible_staff_id: string | null;
  ingredient: IngredientJoin | IngredientJoin[] | null;
  staff: StaffJoin;
  responsible_staff: StaffJoin;
};

type LedgerJoin = {
  business_date: string;
  ingredient_id: string;
  adjustment_qty: number;
  ingredient: IngredientJoin | IngredientJoin[] | null;
};

type OpnameLineJoin = {
  session_id: string;
  ingredient_id: string;
  staff_id: string | null;
  staff: StaffJoin;
};

type MenuJoin = {
  id: string;
  menu_name: string;
  department: Department;
  price: number;
};

type MenuIssueJoin = {
  session_id: string;
  menu_item_id: string;
  quantity: number;
  reason: string;
  note: string;
  staff_id: string | null;
  loss_responsibility_scope: "general" | "unknown" | "staff" | null;
  responsible_staff_id: string | null;
  menu_item: MenuJoin | MenuJoin[] | null;
  staff: StaffJoin;
  responsible_staff: StaffJoin;
};

type RecipeVersionLite = {
  id: string;
  menu_item_id: string;
};

type RecipeLineCostJoin = {
  recipe_version_id: string;
  quantity_per_serving: number;
  ingredient: Pick<IngredientJoin, "default_unit_price"> | Pick<IngredientJoin, "default_unit_price">[] | null;
};

type DeductionSource = "spoil" | "opname_minus" | "human_error";

type DeductionRow = {
  id: string;
  source: DeductionSource;
  department: Department;
  staffId: string | null;
  staffName: string | null;
  date: string;
  itemName: string;
  qtyLabel: string;
  amount: number;
  note: string;
};

type StaffSettlementRow = {
  staff: ServiceStaff;
  point: number;
  isEligible: boolean;
  baseShare: number;
  sharedDeduction: number;
  personalDeduction: number;
  netService: number;
};

type DepartmentSettlement = {
  department: Department;
  revenue: number;
  servicePool: number;
  sharedDeduction: number;
  personalDeduction: number;
  totalDeduction: number;
  netService: number;
  totalPoints: number;
  rows: StaffSettlementRow[];
};

type NoticeState = { variant: "success" | "error"; message: string } | null;

const DEFAULT_POINTS: ServicePoint = { point: 1, isEligible: true };
const HUMAN_ERROR_REASONS = new Set(["too_salty", "undercooked", "burnt", "hair", "wrong_order", "spilled", "staff_error", "other"]);

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function formatQty(value: number, unit: string): string {
  return `${Number(value.toFixed(4)).toLocaleString("id-ID")} ${unit}`;
}

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthRange(monthKey: string): { startDate: string; endDate: string } {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${yearText}-${monthText}-01`,
    endDate: `${yearText}-${monthText}-${String(lastDay).padStart(2, "0")}`,
  };
}

function formatMonthLabel(monthKey: string): string {
  const [yearText, monthText] = monthKey.split("-");
  return new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(
    new Date(Number(yearText), Number(monthText) - 1, 1)
  );
}

function resolveOne<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function staffNameFromJoin(staff: StaffJoin): string | null {
  return resolveOne(staff)?.name ?? null;
}

function normalizePoint(value: string): number | null {
  const parsed = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100) / 100;
}

function pointInput(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

function roleDepartment(role: StaffRole, department: Department | null): Department | null {
  if (role === "bar_staff") return "bar";
  if (role === "kitchen_staff") return "kitchen";
  return department;
}

function deductionSourceLabel(source: DeductionSource): string {
  if (source === "spoil") return "Spoil / Outstock";
  if (source === "opname_minus") return "Opname Minus";
  return "Human Error";
}

export function ServiceSettlementPanel() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const session = getStaffSession();
  const canManageService = canManageStaffAccounts(session?.role);
  const [monthKey, setMonthKey] = useState(() => getCurrentMonthKey());
  const [servicePercent, setServicePercent] = useState(0);
  const [staffRows, setStaffRows] = useState<ServiceStaff[]>([]);
  const [points, setPoints] = useState<Record<string, ServicePoint>>({});
  const [pointInputs, setPointInputs] = useState<Record<string, string>>({});
  const [revenueByDept, setRevenueByDept] = useState<Record<Department, number>>({ bar: 0, kitchen: 0 });
  const [deductions, setDeductions] = useState<DeductionRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);

  const monthLabel = formatMonthLabel(monthKey);

  const settlement = useMemo<Record<Department, DepartmentSettlement>>(() => {
    const personalDeductionByStaff = new Map<string, number>();
    const sharedDeductionByDept: Record<Department, number> = { bar: 0, kitchen: 0 };

    for (const row of deductions) {
      if (row.staffId) {
        personalDeductionByStaff.set(row.staffId, (personalDeductionByStaff.get(row.staffId) ?? 0) + row.amount);
      } else {
        sharedDeductionByDept[row.department] += row.amount;
      }
    }

    const next: Record<Department, DepartmentSettlement> = {
      bar: {
        department: "bar",
        revenue: revenueByDept.bar,
        servicePool: revenueByDept.bar * (servicePercent / 100),
        sharedDeduction: sharedDeductionByDept.bar,
        personalDeduction: 0,
        totalDeduction: 0,
        netService: 0,
        totalPoints: 0,
        rows: [],
      },
      kitchen: {
        department: "kitchen",
        revenue: revenueByDept.kitchen,
        servicePool: revenueByDept.kitchen * (servicePercent / 100),
        sharedDeduction: sharedDeductionByDept.kitchen,
        personalDeduction: 0,
        totalDeduction: 0,
        netService: 0,
        totalPoints: 0,
        rows: [],
      },
    };

    for (const department of ["bar", "kitchen"] as Department[]) {
      const staffInDept = staffRows.filter((staff) => staff.is_active && roleDepartment(staff.role, staff.department) === department);
      const totalPoints = staffInDept.reduce((sum, staff) => {
        const point = points[staff.id] ?? DEFAULT_POINTS;
        return point.isEligible ? sum + point.point : sum;
      }, 0);
      next[department].totalPoints = totalPoints;

      next[department].rows = staffInDept.map((staff) => {
        const point = points[staff.id] ?? DEFAULT_POINTS;
        const ratio = point.isEligible && totalPoints > 0 ? point.point / totalPoints : 0;
        const baseShare = next[department].servicePool * ratio;
        const sharedDeduction = next[department].sharedDeduction * ratio;
        const personalDeduction = personalDeductionByStaff.get(staff.id) ?? 0;
        const netService = Math.max(0, baseShare - sharedDeduction - personalDeduction);

        return {
          staff,
          point: point.point,
          isEligible: point.isEligible,
          baseShare,
          sharedDeduction,
          personalDeduction,
          netService,
        };
      });

      next[department].personalDeduction = next[department].rows.reduce((sum, row) => sum + row.personalDeduction, 0);
      next[department].totalDeduction = next[department].sharedDeduction + next[department].personalDeduction;
      next[department].netService = next[department].rows.reduce((sum, row) => sum + row.netService, 0);
    }

    return next;
  }, [deductions, points, revenueByDept, servicePercent, staffRows]);

  const totalSummary = useMemo(() => {
    const departments = Object.values(settlement);
    return {
      servicePool: departments.reduce((sum, dept) => sum + dept.servicePool, 0),
      deductions: departments.reduce((sum, dept) => sum + dept.totalDeduction, 0),
      netService: departments.reduce((sum, dept) => sum + dept.netService, 0),
      records: deductions.length,
    };
  }, [deductions.length, settlement]);

  const loadSettlement = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    const [{ data: setting, error: settingError }, { data: staffData, error: staffError }, { data: pointData, error: pointError }] =
      await Promise.all([
        supabase.from("service_charge_setting").select("service_percent").eq("id", "default").maybeSingle(),
        supabase
          .from("staff")
          .select("id, name, role, department, is_active")
          .in("role", ["bar_staff", "kitchen_staff"])
          .order("department", { ascending: true })
          .order("name", { ascending: true }),
        supabase.from("service_share_point").select("staff_id, point, is_eligible"),
      ]);

    if (settingError) {
      setNotice({ variant: "error", message: `Gagal memuat persen service. Run migration 045 dulu: ${settingError.message}` });
    }
    if (staffError) {
      setNotice({ variant: "error", message: `Gagal memuat staff service: ${staffError.message}` });
      setIsLoading(false);
      return;
    }
    if (pointError) {
      setNotice({ variant: "error", message: `Gagal memuat point service. Run migration 046 dulu: ${pointError.message}` });
    }

    const nextServicePercent = Number(setting?.service_percent ?? 0);
    const nextStaff = (staffData ?? []) as ServiceStaff[];
    const nextPoints: Record<string, ServicePoint> = {};
    for (const staff of nextStaff) nextPoints[staff.id] = { ...DEFAULT_POINTS };
    for (const row of pointData ?? []) {
      nextPoints[row.staff_id] = {
        point: Number(row.point ?? 1),
        isEligible: Boolean(row.is_eligible),
      };
    }

    setServicePercent(nextServicePercent);
    setStaffRows(nextStaff);
    setPoints(nextPoints);
    setPointInputs(Object.fromEntries(nextStaff.map((staff) => [staff.id, pointInput(nextPoints[staff.id]?.point ?? 1)])));

    const { startDate, endDate } = getMonthRange(monthKey);
    const { data: sessionData, error: sessionError } = await supabase
      .from("worksheet_session")
      .select("id, business_date, department")
      .gte("business_date", startDate)
      .lte("business_date", endDate);

    if (sessionError) {
      setRevenueByDept({ bar: 0, kitchen: 0 });
      setDeductions([]);
      setNotice({ variant: "error", message: `Gagal memuat worksheet periode service: ${sessionError.message}` });
      setIsLoading(false);
      return;
    }

    const sessions = (sessionData ?? []) as WorksheetSessionLite[];
    const sessionIds = sessions.map((item) => item.id);
    const sessionById = new Map(sessions.map((item) => [item.id, item]));

    if (sessionIds.length === 0) {
      setRevenueByDept({ bar: 0, kitchen: 0 });
      setDeductions([]);
      setIsLoading(false);
      return;
    }

    const [salesResult, outResult, ledgerResult, opnameResult, issueResult] = await Promise.all([
      supabase
        .from("worksheet_sold_line")
        .select("session_id, quantity_sold, menu_item:menu_item_id ( price )")
        .in("session_id", sessionIds),
      supabase
        .from("worksheet_out_line")
        .select("session_id, quantity, note, staff_id, outflow_type, loss_responsibility_scope, responsible_staff_id, ingredient:ingredient_id ( id, name, department, unit, default_unit_price ), staff:staff_id ( name ), responsible_staff:responsible_staff_id ( name )")
        .in("session_id", sessionIds),
      supabase
        .from("stock_ledger")
        .select("business_date, ingredient_id, adjustment_qty, ingredient:ingredient_id ( id, name, department, unit, default_unit_price )")
        .gte("business_date", startDate)
        .lte("business_date", endDate)
        .lt("adjustment_qty", 0),
      supabase
        .from("worksheet_opname_line")
        .select("session_id, ingredient_id, staff_id, staff:staff_id ( name )")
        .in("session_id", sessionIds),
      supabase
        .from("worksheet_menu_issue_line")
        .select("session_id, menu_item_id, quantity, reason, note, staff_id, loss_responsibility_scope, responsible_staff_id, menu_item:menu_item_id ( id, menu_name, department, price ), staff:staff_id ( name ), responsible_staff:responsible_staff_id ( name )")
        .in("session_id", sessionIds),
    ]);

    const firstError = [salesResult.error, outResult.error, ledgerResult.error, opnameResult.error, issueResult.error].find(Boolean);
    if (firstError) {
      setRevenueByDept({ bar: 0, kitchen: 0 });
      setDeductions([]);
      setNotice({ variant: "error", message: `Gagal generate service settlement: ${firstError.message}` });
      setIsLoading(false);
      return;
    }

    const nextRevenueByDept: Record<Department, number> = { bar: 0, kitchen: 0 };
    for (const line of (salesResult.data ?? []) as RevenueLineJoin[]) {
      const sessionRow = sessionById.get(line.session_id);
      const menu = resolveOne(line.menu_item);
      if (!sessionRow || !menu) continue;
      const qty = Number(line.quantity_sold ?? 0);
      nextRevenueByDept[sessionRow.department] += qty * Number(menu.price ?? 0);
    }

    const nextDeductions: DeductionRow[] = [];
    for (const line of (outResult.data ?? []) as OutLineJoin[]) {
      if (line.outflow_type !== "spoil") continue;
      const sessionRow = sessionById.get(line.session_id);
      const ingredient = resolveOne(line.ingredient);
      const qty = Number(line.quantity ?? 0);
      if (!sessionRow || !ingredient || qty <= 0) continue;
      const amount = qty * Number(ingredient.default_unit_price ?? 0);
      const isPersonalLoss = line.loss_responsibility_scope === "staff" && Boolean(line.responsible_staff_id);
      nextDeductions.push({
        id: `spoil:${line.session_id}:${ingredient.id}:${line.staff_id ?? "dept"}`,
        source: "spoil",
        department: sessionRow.department,
        staffId: isPersonalLoss ? line.responsible_staff_id : null,
        staffName: isPersonalLoss ? staffNameFromJoin(line.responsible_staff) : null,
        date: sessionRow.business_date,
        itemName: ingredient.name,
        qtyLabel: formatQty(qty, ingredient.unit),
        amount,
        note:
          line.loss_responsibility_scope === "staff"
            ? line.note || "Out stock / spoil pribadi"
            : line.loss_responsibility_scope === "general"
              ? line.note || "General operasional, potong team"
              : line.note || "Abu-abu, potong team",
      });
    }

    const opnameOwners = new Map<string, { staffId: string | null; staffName: string | null }[]>();
    for (const row of (opnameResult.data ?? []) as OpnameLineJoin[]) {
      const sessionRow = sessionById.get(row.session_id);
      if (!sessionRow) continue;
      const key = `${sessionRow.business_date}:${sessionRow.department}:${row.ingredient_id}`;
      opnameOwners.set(key, [
        ...(opnameOwners.get(key) ?? []),
        { staffId: row.staff_id, staffName: staffNameFromJoin(row.staff) },
      ]);
    }

    for (const row of (ledgerResult.data ?? []) as LedgerJoin[]) {
      const ingredient = resolveOne(row.ingredient);
      const adjustmentQty = Number(row.adjustment_qty ?? 0);
      if (!ingredient || adjustmentQty >= 0) continue;
      const key = `${row.business_date}:${ingredient.department}:${row.ingredient_id}`;
      const owners = (opnameOwners.get(key) ?? []).filter((owner) => owner.staffId);
      const uniqueOwners = new Map(owners.map((owner) => [owner.staffId, owner]));
      const owner = uniqueOwners.size === 1 ? Array.from(uniqueOwners.values())[0] : null;
      const missingQty = Math.abs(adjustmentQty);
      nextDeductions.push({
        id: `opname:${row.business_date}:${ingredient.id}`,
        source: "opname_minus",
        department: ingredient.department,
        staffId: owner?.staffId ?? null,
        staffName: owner?.staffName ?? null,
        date: row.business_date,
        itemName: ingredient.name,
        qtyLabel: formatQty(missingQty, ingredient.unit),
        amount: missingQty * Number(ingredient.default_unit_price ?? 0),
        note: owner ? "Selisih minus opname, owner tunggal" : "Selisih minus opname department",
      });
    }

    const issueRows = ((issueResult.data ?? []) as MenuIssueJoin[]).filter(
      (row) => Number(row.quantity ?? 0) > 0 && HUMAN_ERROR_REASONS.has(row.reason)
    );
    const menuIds = Array.from(new Set(issueRows.map((row) => row.menu_item_id)));
    const menuCostById = new Map<string, number>();

    if (menuIds.length > 0) {
      const { data: versions } = await supabase
        .from("menu_recipe_version")
        .select("id, menu_item_id")
        .in("menu_item_id", menuIds)
        .eq("is_active", true);

      const activeVersions = (versions ?? []) as RecipeVersionLite[];
      const versionIds = activeVersions.map((version) => version.id);
      const versionToMenu = new Map(activeVersions.map((version) => [version.id, version.menu_item_id]));

      if (versionIds.length > 0) {
        const { data: recipeLines } = await supabase
          .from("recipe_line")
          .select("recipe_version_id, quantity_per_serving, ingredient:ingredient_id ( default_unit_price )")
          .in("recipe_version_id", versionIds);

        for (const line of (recipeLines ?? []) as RecipeLineCostJoin[]) {
          const menuId = versionToMenu.get(line.recipe_version_id);
          const ingredient = resolveOne(line.ingredient);
          if (!menuId || !ingredient) continue;
          const lineCost = Number(line.quantity_per_serving ?? 0) * Number(ingredient.default_unit_price ?? 0);
          menuCostById.set(menuId, (menuCostById.get(menuId) ?? 0) + lineCost);
        }
      }
    }

    for (const issue of issueRows) {
      const sessionRow = sessionById.get(issue.session_id);
      const menu = resolveOne(issue.menu_item);
      const qty = Number(issue.quantity ?? 0);
      if (!sessionRow || !menu || qty <= 0) continue;
      const unitCost = menuCostById.get(issue.menu_item_id) ?? Number(menu.price ?? 0);
      const isPersonalLoss = issue.loss_responsibility_scope === "staff" && Boolean(issue.responsible_staff_id);
      nextDeductions.push({
        id: `issue:${issue.session_id}:${issue.menu_item_id}:${issue.reason}:${issue.responsible_staff_id ?? "dept"}`,
        source: "human_error",
        department: sessionRow.department,
        staffId: isPersonalLoss ? issue.responsible_staff_id : null,
        staffName: isPersonalLoss ? staffNameFromJoin(issue.responsible_staff) : null,
        date: sessionRow.business_date,
        itemName: menu.menu_name,
        qtyLabel: `${Number(qty.toFixed(4)).toLocaleString("id-ID")} menu`,
        amount: qty * unitCost,
        note:
          issue.loss_responsibility_scope === "staff"
            ? issue.note || "Remake human error pribadi"
            : issue.loss_responsibility_scope === "general"
              ? issue.note || "Remake human error team"
              : issue.note || "Remake human error abu-abu",
      });
    }

    setRevenueByDept(nextRevenueByDept);
    setDeductions(nextDeductions);
    setIsLoading(false);
  }, [monthKey, supabase]);

  useEffect(() => {
    void loadSettlement();
  }, [loadSettlement]);

  const savePoint = async (staffId: string, isEligible = points[staffId]?.isEligible ?? true) => {
    if (!canManageService) {
      setNotice({ variant: "error", message: "Hanya Master Admin yang bisa mengubah point service." });
      return;
    }
    const point = normalizePoint(pointInputs[staffId] ?? "1");
    if (point == null) {
      setNotice({ variant: "error", message: "Point service wajib angka 0 atau lebih." });
      return;
    }

    setSavingStaffId(staffId);
    setNotice(null);
    const { error } = await supabase.from("service_share_point").upsert(
      {
        staff_id: staffId,
        point,
        is_eligible: isEligible,
        updated_by_staff_id: session?.id ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "staff_id" }
    );

    if (error) {
      setNotice({ variant: "error", message: `Gagal menyimpan point service: ${error.message}` });
    } else {
      setPoints((current) => ({ ...current, [staffId]: { point, isEligible } }));
      setPointInputs((current) => ({ ...current, [staffId]: pointInput(point) }));
      setNotice({ variant: "success", message: "Point service staff tersimpan." });
    }
    setSavingStaffId(null);
  };

  const toggleEligibility = async (staffId: string, eligible: boolean) => {
    setPoints((current) => ({
      ...current,
      [staffId]: {
        ...(current[staffId] ?? DEFAULT_POINTS),
        isEligible: eligible,
      },
    }));
    await savePoint(staffId, eligible);
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <Calculator className="h-5 w-5 text-teal-700" />
            <h2 className="text-lg font-bold text-slate-900">Service Settlement & Loss Deduction</h2>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
            Generate service share otomatis dari revenue, lalu potong spoil, opname minus, dan human error sesuai department atau staff penanggung jawab.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="month"
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value || getCurrentMonthKey())}
            className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500"
          />
          <button
            type="button"
            onClick={() => void loadSettlement()}
            disabled={isLoading}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-teal-200 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Generate
          </button>
        </div>
      </div>

      {notice ? (
        <p
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.variant === "success"
              ? "border-teal-200 bg-teal-50 text-teal-700"
              : "border-red-500/40 bg-red-500/10 text-red-700"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Periode</p>
          <p className="mt-2 text-xl font-bold text-slate-900">{monthLabel}</p>
          <p className="mt-1 text-xs text-slate-600">Service aktif {servicePercent.toLocaleString("id-ID")}%</p>
        </div>
        <div className="rounded-lg border border-teal-200 bg-teal-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Service Pool</p>
          <p className="mt-2 text-2xl font-bold text-teal-700">{formatRupiah(totalSummary.servicePool)}</p>
        </div>
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">Total Potongan</p>
          <p className="mt-2 text-2xl font-bold text-red-700">{formatRupiah(totalSummary.deductions)}</p>
          <p className="mt-1 text-xs text-red-700">{totalSummary.records} record loss</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Net Service</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{formatRupiah(totalSummary.netService)}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex min-h-48 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
          Generate service settlement...
        </div>
      ) : (
        <div className="space-y-4">
          {(["bar", "kitchen"] as Department[]).map((department) => {
            const dept = settlement[department];
            const deptDeductions = deductions
              .filter((row) => row.department === department)
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 8);
            const personalDeductionGroups = Array.from(
              deductions
                .filter((row) => row.department === department && row.staffId)
                .reduce((map, row) => {
                  const key = row.staffId ?? "unknown";
                  const current = map.get(key) ?? {
                    staffName: row.staffName ?? "Staff tidak diketahui",
                    total: 0,
                    rows: [] as DeductionRow[],
                  };
                  current.total += row.amount;
                  current.rows.push(row);
                  map.set(key, current);
                  return map;
                }, new Map<string, { staffName: string; total: number; rows: DeductionRow[] }>())
                .values()
            ).sort((a, b) => b.total - a.total);

            return (
              <section key={department} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{department === "bar" ? "Bar" : "Kitchen"}</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Revenue {formatRupiah(dept.revenue)} · Pool {formatRupiah(dept.servicePool)} · Point {dept.totalPoints.toLocaleString("id-ID")}
                      </p>
                    </div>
                    <div className="text-left lg:text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Net Service Dept</p>
                      <p className="mt-1 text-xl font-bold text-slate-900">{formatRupiah(dept.netService)}</p>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-600">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Staff</th>
                        <th className="px-4 py-3 font-semibold">Point</th>
                        <th className="px-4 py-3 text-right font-semibold">Gross Share</th>
                        <th className="px-4 py-3 text-right font-semibold">Potong Dept</th>
                        <th className="px-4 py-3 text-right font-semibold">Potong Pribadi</th>
                        <th className="px-4 py-3 text-right font-semibold">Net Service</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dept.rows.map((row) => (
                        <tr key={row.staff.id} className="align-middle transition-colors hover:bg-slate-50/80">
                          <td className="px-4 py-3">
                            <p className="font-semibold text-slate-900">{row.staff.name}</p>
                            <label className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={row.isEligible}
                                disabled={!canManageService || savingStaffId === row.staff.id}
                                onChange={(event) => void toggleEligibility(row.staff.id, event.target.checked)}
                                className="h-4 w-4 accent-cyan-400"
                              />
                              Eligible service
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <input
                                inputMode="decimal"
                                value={pointInputs[row.staff.id] ?? "1"}
                                disabled={!canManageService || savingStaffId === row.staff.id}
                                onChange={(event) =>
                                  setPointInputs((current) => ({ ...current, [row.staff.id]: event.target.value }))
                                }
                                className="h-9 w-20 rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-900 outline-none focus:border-teal-500 disabled:opacity-60"
                              />
                              <button
                                type="button"
                                onClick={() => void savePoint(row.staff.id)}
                                disabled={!canManageService || savingStaffId === row.staff.id}
                                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 px-2 text-slate-700 hover:border-teal-200 disabled:opacity-50"
                                aria-label={`Simpan point service ${row.staff.name}`}
                              >
                                {savingStaffId === row.staff.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                              </button>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{formatRupiah(row.baseShare)}</td>
                          <td className="px-4 py-3 text-right text-red-700">{formatRupiah(row.sharedDeduction)}</td>
                          <td className="px-4 py-3 text-right text-red-700">{formatRupiah(row.personalDeduction)}</td>
                          <td className="px-4 py-3 text-right font-bold text-teal-700">{formatRupiah(row.netService)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-slate-200 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Rekap Potongan Pribadi</h4>
                      <p className="mt-0.5 text-xs text-slate-600">
                        Loss yang punya PIC otomatis masuk ke potongan service orang tersebut.
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-red-700">{formatRupiah(dept.personalDeduction)}</p>
                  </div>

                  {personalDeductionGroups.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                      Belum ada potongan pribadi. Loss tanpa PIC tetap masuk sebagai potongan department.
                    </p>
                  ) : (
                    <div className="grid gap-3 xl:grid-cols-2">
                      {personalDeductionGroups.map((group) => (
                        <section key={group.staffName} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                          <div className="mb-2 flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-900">{group.staffName}</p>
                              <p className="text-xs text-slate-600">{group.rows.length} record kesalahan pribadi</p>
                            </div>
                            <p className="shrink-0 text-sm font-bold text-red-700">{formatRupiah(group.total)}</p>
                          </div>
                          <div className="space-y-1">
                            {group.rows.slice(0, 4).map((row) => (
                              <div key={row.id} className="flex items-start justify-between gap-3 text-xs">
                                <p className="min-w-0 text-slate-600">
                                  <span className="font-semibold text-slate-700">{deductionSourceLabel(row.source)}</span>
                                  {" · "}
                                  {row.itemName} ({row.qtyLabel})
                                </p>
                                <p className="shrink-0 font-semibold text-red-700">{formatRupiah(row.amount)}</p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-bold text-slate-900">Top Potongan Otomatis</h4>
                    <p className="text-xs text-slate-600">
                      Dept {formatRupiah(dept.sharedDeduction)} · Pribadi {formatRupiah(dept.personalDeduction)}
                    </p>
                  </div>
                  {deptDeductions.length === 0 ? (
                    <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                      Belum ada spoil, opname minus, atau human error untuk periode ini.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {deptDeductions.map((row) => (
                        <div key={row.id} className="grid gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm md:grid-cols-[1.1fr_1fr_auto] md:items-center">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{row.itemName}</p>
                            <p className="text-xs text-slate-600">
                              {row.date} · {row.qtyLabel} · {deductionSourceLabel(row.source)}
                            </p>
                          </div>
                          <p className="min-w-0 text-xs text-slate-600">
                            {row.staffName ? `PIC pribadi: ${row.staffName}` : "Potongan department"} · {row.note}
                          </p>
                          <p className="text-right font-bold text-red-700">{formatRupiah(row.amount)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
