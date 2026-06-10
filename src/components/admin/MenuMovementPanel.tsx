"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, BarChart3, Download, Loader2, Search, Sparkles, X } from "lucide-react";
import {
  SALES_MENU_CATEGORY_OPTIONS,
  classifySalesMenuCategory,
  salesMenuCategoryLabel,
  salesMenuCategorySortValue,
  type SalesMenuCategory,
} from "@/lib/menu/salesCategory";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, MenuItemRow } from "@/lib/types/database";
import { formatBusinessDateLabel } from "@/lib/utils/dateHelper";

type MenuMovementPanelProps = {
  startDate: string;
  endDate: string;
  refreshKey: number;
};

type SoldLineJoined = {
  quantity_sold: number;
  menu_item_id: string;
  worksheet_session: { business_date: string; department: Department } | { business_date: string; department: Department }[] | null;
};

type MenuMovementRow = {
  id: string;
  name: string;
  department: Department;
  salesCategory: SalesMenuCategory;
  isActive: boolean;
  unitPrice: number;
  quantitySold: number;
  previousWeekQuantitySold: number;
  previousMonthQuantitySold: number;
  revenue: number;
  previousWeekRevenue: number;
  previousMonthRevenue: number;
  metricValue: number;
  previousWeekMetricValue: number;
  previousMonthMetricValue: number;
  sharePercent: number;
  weekChangePercent: number | null;
  monthChangePercent: number | null;
  rank: number;
  rankTotal: number;
  grade: MenuMovementGrade;
  percentile: number;
};

type MenuMovementGrade = "A" | "B" | "C" | "D";
type MovementMetric = "qty" | "revenue";
type GradeFilter = MenuMovementGrade | "all";
type CategoryFilter = SalesMenuCategory | "all";
type ActiveFilter = "all" | "active" | "inactive";
type SortKey = "rank" | "name" | "category" | "sold" | "share" | "week" | "month" | "revenue" | "grade";
type SortDirection = "asc" | "desc";

const GRADE_LABEL: Record<MenuMovementGrade, string> = {
  A: "Top Performer",
  B: "Good Contributor",
  C: "Slow Moving",
  D: "Dead Stock",
};

const GRADE_CLASS: Record<MenuMovementGrade, string> = {
  A: "border-emerald-500/35 bg-emerald-500/10 text-emerald-100",
  B: "border-sky-500/35 bg-sky-500/10 text-sky-100",
  C: "border-amber-500/35 bg-amber-500/10 text-amber-100",
  D: "border-red-500/35 bg-red-500/10 text-red-100",
};

const GRADE_OPTIONS: { id: GradeFilter; label: string }[] = [
  { id: "all", label: "Semua grade" },
  { id: "A", label: "Grade A" },
  { id: "B", label: "Grade B" },
  { id: "C", label: "Grade C" },
  { id: "D", label: "Grade D" },
];

const ACTIVE_OPTIONS: { id: ActiveFilter; label: string }[] = [
  { id: "all", label: "Semua menu" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
];

const CATEGORY_OPTIONS: { id: CategoryFilter; label: string }[] = [
  { id: "all", label: "Semua kategori" },
  ...SALES_MENU_CATEGORY_OPTIONS.map((category) => ({
    id: category,
    label: salesMenuCategoryLabel(category),
  })),
];

const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "rank", label: "Rank" },
  { id: "category", label: "Kategori" },
  { id: "sold", label: "Sold" },
  { id: "share", label: "Kontribusi" },
  { id: "week", label: "Vs Week" },
  { id: "month", label: "Vs Month" },
  { id: "revenue", label: "Revenue" },
  { id: "grade", label: "Grade" },
  { id: "name", label: "Nama" },
];

function formatQty(value: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

function formatRupiahCompact(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatRupiah(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatBusinessDateLabel(startDate);
  return `${formatBusinessDateLabel(startDate)} - ${formatBusinessDateLabel(endDate)}`;
}

function addIsoDays(isoDate: string, days: number): string {
  const [year, month, date] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + days, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}

function addIsoMonths(isoDate: string, months: number): string {
  const [year, month, date] = isoDate.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const lastDateInTargetMonth = new Date(
    Date.UTC(targetYear, normalizedMonthIndex + 1, 0, 12, 0, 0),
  ).getUTCDate();
  const next = new Date(
    Date.UTC(targetYear, normalizedMonthIndex, Math.min(date, lastDateInTargetMonth), 12, 0, 0),
  );
  return next.toISOString().slice(0, 10);
}

function departmentLabel(department: Department): string {
  return department === "bar" ? "Bar" : "Kitchen";
}

function computeChangePercent(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

function formatChangePercent(value: number | null): string {
  if (value === null) return "Baru";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function changeTextClass(value: number | null): string {
  if (value === null) return "text-emerald-300";
  if (value > 0) return "text-emerald-300";
  if (value < 0) return "text-red-300";
  return "text-zinc-400";
}

function formatMetricValue(value: number, metric: MovementMetric): string {
  return metric === "revenue" ? formatRupiahCompact(value) : formatQty(value);
}

function gradeSortValue(grade: MenuMovementGrade): number {
  return { A: 1, B: 2, C: 3, D: 4 }[grade];
}

function compareNullableChange(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function getMenuRecommendation(row: MenuMovementRow): string {
  if (row.grade === "A" && (row.weekChangePercent ?? 0) >= 0) {
    return "Jaga stok bahan dan konsistensi service.";
  }
  if (row.grade === "A") {
    return "Masih kuat, tapi cek penyebab turun minggu ini.";
  }
  if (row.grade === "B") {
    return "Layak dipush ringan lewat pairing atau staff suggest.";
  }
  if (row.grade === "C") {
    return "Review placement menu dan foto/description.";
  }
  if (row.quantitySold === 0) {
    return "Candidate evaluasi: promo, rework, atau archive.";
  }
  return "Low moving: coba bundling atau batasi stok prep.";
}

function gradeFromPercentile(percentile: number): MenuMovementGrade {
  if (percentile <= 20) return "A";
  if (percentile <= 50) return "B";
  if (percentile <= 80) return "C";
  return "D";
}

function buildMenuMovementRows({
  menus,
  currentQtyByMenuId,
  weekQtyByMenuId,
  monthQtyByMenuId,
  metric,
}: {
  menus: MenuItemRow[];
  currentQtyByMenuId: Map<string, number>;
  weekQtyByMenuId: Map<string, number>;
  monthQtyByMenuId: Map<string, number>;
  metric: MovementMetric;
}): MenuMovementRow[] {
  const rows = menus.map((menu) => {
    const quantitySold = currentQtyByMenuId.get(menu.id) ?? 0;
    const previousWeekQuantitySold = weekQtyByMenuId.get(menu.id) ?? 0;
    const previousMonthQuantitySold = monthQtyByMenuId.get(menu.id) ?? 0;
    const unitPrice = Number(menu.price);
    const revenue = quantitySold * unitPrice;
    const previousWeekRevenue = previousWeekQuantitySold * unitPrice;
    const previousMonthRevenue = previousMonthQuantitySold * unitPrice;
    const metricValue = metric === "revenue" ? revenue : quantitySold;
    const previousWeekMetricValue = metric === "revenue" ? previousWeekRevenue : previousWeekQuantitySold;
    const previousMonthMetricValue = metric === "revenue" ? previousMonthRevenue : previousMonthQuantitySold;
    return {
      id: menu.id,
      name: menu.menu_name,
      department: menu.department,
      salesCategory: classifySalesMenuCategory(menu.menu_name, menu.department),
      isActive: menu.is_active,
      unitPrice,
      quantitySold,
      previousWeekQuantitySold,
      previousMonthQuantitySold,
      revenue,
      previousWeekRevenue,
      previousMonthRevenue,
      metricValue,
      previousWeekMetricValue,
      previousMonthMetricValue,
      sharePercent: 0,
      weekChangePercent: computeChangePercent(metricValue, previousWeekMetricValue),
      monthChangePercent: computeChangePercent(metricValue, previousMonthMetricValue),
      rank: 0,
      rankTotal: 0,
      grade: "D" as MenuMovementGrade,
      percentile: 100,
    };
  });

  const rankingGroups = new Map<string, MenuMovementRow[]>();
  for (const row of rows) {
    const key = `${row.department}:${row.salesCategory}`;
    const group = rankingGroups.get(key) ?? [];
    group.push(row);
    rankingGroups.set(key, group);
  }

  for (const categoryRowsRaw of rankingGroups.values()) {
    const categoryRows = [...categoryRowsRaw].sort((a, b) => {
      const metricCmp = b.metricValue - a.metricValue;
      if (metricCmp !== 0) return metricCmp;
      const revenueCmp = b.revenue - a.revenue;
      if (revenueCmp !== 0) return revenueCmp;
      const qtyCmp = b.quantitySold - a.quantitySold;
      if (qtyCmp !== 0) return qtyCmp;
      return a.name.localeCompare(b.name);
    });
    const categoryTotalMetric = categoryRows.reduce((sum, row) => sum + row.metricValue, 0);
    const rankTotal = categoryRows.length;

    categoryRows.forEach((row, index) => {
      if (categoryTotalMetric <= 0) {
        row.rank = index + 1;
        row.rankTotal = rankTotal;
        row.percentile = 100;
        row.grade = "D";
        row.sharePercent = 0;
        return;
      }

      const percentile = rankTotal <= 1 ? 0 : (index / (rankTotal - 1)) * 100;
      row.rank = index + 1;
      row.rankTotal = rankTotal;
      row.percentile = percentile;
      row.grade = gradeFromPercentile(percentile);
      row.sharePercent = categoryTotalMetric > 0 ? (row.metricValue / categoryTotalMetric) * 100 : 0;
    });
  }

  return rows.sort((a, b) => {
    const deptCmp = a.department.localeCompare(b.department);
    if (deptCmp !== 0) return deptCmp;
    const categoryCmp = salesMenuCategorySortValue(a.salesCategory) - salesMenuCategorySortValue(b.salesCategory);
    if (categoryCmp !== 0) return categoryCmp;
    return a.rank - b.rank;
  });
}

async function loadQtyByMenuIdForRange(
  supabase: ReturnType<typeof getSupabaseClient>,
  rangeStart: string,
  rangeEnd: string,
): Promise<{ qtyByMenuId: Map<string, number>; error: string | null }> {
  const { data: sessions, error: sessionErr } = await supabase
    .from("worksheet_session")
    .select("id, business_date, department")
    .gte("business_date", rangeStart)
    .lte("business_date", rangeEnd);

  if (sessionErr) return { qtyByMenuId: new Map(), error: sessionErr.message };

  const sessionIds = (sessions ?? []).map((session) => session.id);
  const qtyByMenuId = new Map<string, number>();

  if (sessionIds.length === 0) return { qtyByMenuId, error: null };

  const { data: soldLines, error: soldErr } = await supabase
    .from("worksheet_sold_line")
    .select(
      `
      menu_item_id,
      quantity_sold,
      worksheet_session:session_id ( business_date, department )
    `
    )
    .in("session_id", sessionIds);

  if (soldErr) return { qtyByMenuId: new Map(), error: soldErr.message };

  for (const line of (soldLines ?? []) as SoldLineJoined[]) {
    const qty = Number(line.quantity_sold);
    if (qty <= 0) continue;
    qtyByMenuId.set(line.menu_item_id, (qtyByMenuId.get(line.menu_item_id) ?? 0) + qty);
  }

  return { qtyByMenuId, error: null };
}

export function MenuMovementPanel({ startDate, endDate, refreshKey }: MenuMovementPanelProps) {
  const supabase = getSupabaseClient();
  const [departmentFilter, setDepartmentFilter] = useState<Department | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [metric, setMetric] = useState<MovementMetric>("qty");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [searchTerm, setSearchTerm] = useState("");
  const [rows, setRows] = useState<MenuMovementRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: menus, error: menuErr } = await supabase
      .from("menu_item")
      .select("*")
      .order("department", { ascending: true })
      .order("menu_name", { ascending: true });

    if (menuErr) {
      setError(menuErr.message);
      setRows([]);
      setIsLoading(false);
      return;
    }

    const menuMap = new Map<string, MenuItemRow>((menus ?? []).map((menu) => [menu.id, menu]));
    const weekStartDate = addIsoDays(startDate, -7);
    const weekEndDate = addIsoDays(endDate, -7);
    const monthStartDate = addIsoMonths(startDate, -1);
    const monthEndDate = addIsoMonths(endDate, -1);

    const [currentResult, weekResult, monthResult] = await Promise.all([
      loadQtyByMenuIdForRange(supabase, startDate, endDate),
      loadQtyByMenuIdForRange(supabase, weekStartDate, weekEndDate),
      loadQtyByMenuIdForRange(supabase, monthStartDate, monthEndDate),
    ]);

    const loadError = currentResult.error ?? weekResult.error ?? monthResult.error;
    if (loadError) {
      setError(loadError);
      setRows([]);
      setIsLoading(false);
      return;
    }

    setRows(
      buildMenuMovementRows({
        menus: Array.from(menuMap.values()),
        currentQtyByMenuId: currentResult.qtyByMenuId,
        weekQtyByMenuId: weekResult.qtyByMenuId,
        monthQtyByMenuId: monthResult.qtyByMenuId,
        metric,
      }),
    );
    setIsLoading(false);
  }, [endDate, metric, startDate, supabase]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (departmentFilter !== "all" && row.department !== departmentFilter) return false;
      if (categoryFilter !== "all" && row.salesCategory !== categoryFilter) return false;
      if (gradeFilter !== "all" && row.grade !== gradeFilter) return false;
      if (activeFilter === "active" && !row.isActive) return false;
      if (activeFilter === "inactive" && row.isActive) return false;
      if (!normalizedSearch) return true;
      return [
        row.name,
        departmentLabel(row.department),
        salesMenuCategoryLabel(row.salesCategory),
        row.grade,
        GRADE_LABEL[row.grade],
        getMenuRecommendation(row),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [activeFilter, categoryFilter, departmentFilter, gradeFilter, rows, searchTerm]);

  const gradeCountRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (departmentFilter !== "all" && row.department !== departmentFilter) return false;
      if (categoryFilter !== "all" && row.salesCategory !== categoryFilter) return false;
      if (activeFilter === "active" && !row.isActive) return false;
      if (activeFilter === "inactive" && row.isActive) return false;
      if (!normalizedSearch) return true;
      return [
        row.name,
        departmentLabel(row.department),
        salesMenuCategoryLabel(row.salesCategory),
        row.grade,
        GRADE_LABEL[row.grade],
        getMenuRecommendation(row),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [activeFilter, categoryFilter, departmentFilter, rows, searchTerm]);

  const rankedRows = useMemo(
    () => {
      const sorted = [...filteredRows].sort((a, b) => {
        if (sortKey === "name") return a.name.localeCompare(b.name);
        if (sortKey === "category") {
          return salesMenuCategorySortValue(a.salesCategory) - salesMenuCategorySortValue(b.salesCategory);
        }
        if (sortKey === "sold") return a.quantitySold - b.quantitySold;
        if (sortKey === "share") return a.sharePercent - b.sharePercent;
        if (sortKey === "week") return compareNullableChange(a.weekChangePercent, b.weekChangePercent);
        if (sortKey === "month") return compareNullableChange(a.monthChangePercent, b.monthChangePercent);
        if (sortKey === "revenue") return a.revenue - b.revenue;
        if (sortKey === "grade") return gradeSortValue(a.grade) - gradeSortValue(b.grade);

        const deptCmp = a.department.localeCompare(b.department);
        if (deptCmp !== 0) return deptCmp;
        const categoryCmp = salesMenuCategorySortValue(a.salesCategory) - salesMenuCategorySortValue(b.salesCategory);
        if (categoryCmp !== 0) return categoryCmp;
        return a.rank - b.rank;
      });
      return sortDirection === "asc" ? sorted : sorted.reverse();
    },
    [filteredRows, sortDirection, sortKey]
  );

  const menuCount = filteredRows.length;
  const zeroSoldCount = filteredRows.filter((row) => row.quantitySold === 0).length;
  const weekStartDate = addIsoDays(startDate, -7);
  const weekEndDate = addIsoDays(endDate, -7);
  const monthStartDate = addIsoMonths(startDate, -1);
  const monthEndDate = addIsoMonths(endDate, -1);
  const gradeCounts = gradeCountRows.reduce<Record<MenuMovementGrade, number>>(
    (acc, row) => {
      acc[row.grade] += 1;
      return acc;
    },
    { A: 0, B: 0, C: 0, D: 0 },
  );
  const visibleTotalSold = rankedRows.reduce((sum, row) => sum + row.quantitySold, 0);
  const visibleTotalRevenue = rankedRows.reduce((sum, row) => sum + row.revenue, 0);

  const handleSortKeyChange = (nextSortKey: SortKey) => {
    setSortKey(nextSortKey);
    setSortDirection(
      nextSortKey === "rank" || nextSortKey === "name" || nextSortKey === "category" || nextSortKey === "grade"
        ? "asc"
        : "desc",
    );
  };

  const handleExport = async () => {
    if (rankedRows.length === 0) return;

    setIsExporting(true);
    setError(null);
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Sales Grading");

      sheet.columns = [
        { header: "Rank", key: "rank", width: 10 },
        { header: "Total Rank", key: "rankTotal", width: 12 },
        { header: "Menu", key: "menu", width: 32 },
        { header: "Department", key: "department", width: 14 },
        { header: "Sales Category", key: "salesCategory", width: 18 },
        { header: "Status", key: "status", width: 12 },
        { header: "Qty Sold", key: "sold", width: 12 },
        { header: "Unit Price", key: "unitPrice", width: 14 },
        { header: "Revenue", key: "revenue", width: 16 },
        { header: "Contribution %", key: "share", width: 16 },
        { header: "Percentile", key: "percentile", width: 12 },
        { header: "Grade", key: "grade", width: 10 },
        { header: "Grade Label", key: "gradeLabel", width: 20 },
        { header: "Vs Week %", key: "weekChange", width: 14 },
        { header: "Prev Week Qty", key: "prevWeekQty", width: 14 },
        { header: "Prev Week Revenue", key: "prevWeekRevenue", width: 18 },
        { header: "Vs Month %", key: "monthChange", width: 14 },
        { header: "Prev Month Qty", key: "prevMonthQty", width: 15 },
        { header: "Prev Month Revenue", key: "prevMonthRevenue", width: 20 },
        { header: "Current Range", key: "currentRange", width: 24 },
        { header: "Week Compare Range", key: "weekRange", width: 24 },
        { header: "Month Compare Range", key: "monthRange", width: 24 },
        { header: "Metric", key: "metric", width: 12 },
        { header: "Recommendation", key: "recommendation", width: 44 },
      ];
      sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      sheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF111827" },
      };
      sheet.views = [{ state: "frozen", ySplit: 1 }];

      for (const row of rankedRows) {
        sheet.addRow({
          rank: row.rank,
          rankTotal: row.rankTotal,
          menu: row.name,
          department: departmentLabel(row.department),
          salesCategory: salesMenuCategoryLabel(row.salesCategory),
          status: row.isActive ? "Active" : "Inactive",
          sold: row.quantitySold,
          unitPrice: row.unitPrice,
          revenue: row.revenue,
          share: row.sharePercent / 100,
          percentile: row.percentile / 100,
          grade: row.grade,
          gradeLabel: GRADE_LABEL[row.grade],
          weekChange: row.weekChangePercent === null ? "Baru" : row.weekChangePercent / 100,
          prevWeekQty: row.previousWeekQuantitySold,
          prevWeekRevenue: row.previousWeekRevenue,
          monthChange: row.monthChangePercent === null ? "Baru" : row.monthChangePercent / 100,
          prevMonthQty: row.previousMonthQuantitySold,
          prevMonthRevenue: row.previousMonthRevenue,
          currentRange: `${startDate} - ${endDate}`,
          weekRange: `${weekStartDate} - ${weekEndDate}`,
          monthRange: `${monthStartDate} - ${monthEndDate}`,
          metric: metric === "qty" ? "Qty" : "Revenue",
          recommendation: getMenuRecommendation(row),
        });
      }

      sheet.getColumn("unitPrice").numFmt = '"Rp" #,##0';
      sheet.getColumn("revenue").numFmt = '"Rp" #,##0';
      sheet.getColumn("share").numFmt = "0.0%";
      sheet.getColumn("percentile").numFmt = "0.0%";
      sheet.getColumn("weekChange").numFmt = "0.0%";
      sheet.getColumn("prevWeekRevenue").numFmt = '"Rp" #,##0';
      sheet.getColumn("monthChange").numFmt = "0.0%";
      sheet.getColumn("prevMonthRevenue").numFmt = '"Rp" #,##0';

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `sales-grading-${startDate}-to-${endDate}.xlsx`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Gagal export sales grading.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl shadow-black/20 sm:p-5">
      <div className="flex flex-col gap-4 border-b border-zinc-800 pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-400/25 bg-emerald-400/10">
              <BarChart3 className="h-5 w-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-white">Sales Menu Grading</h3>
                <span className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">
                  {metric === "qty" ? "Qty Mode" : "Revenue Mode"}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {formatDateRange(startDate, endDate)} · compare week {formatDateRange(weekStartDate, weekEndDate)} · month{" "}
                {formatDateRange(monthStartDate, monthEndDate)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Ranking dan grade dihitung di kategori sales masing-masing.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={rankedRows.length === 0 || isExporting}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export XLSX
          </button>
        </div>

        <div className="grid gap-2 xl:grid-cols-[minmax(220px,1fr)_auto] xl:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Cari menu, grade, atau rekomendasi..."
              className="min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2 pl-10 pr-10 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Bersihkan pencarian"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="grid grid-cols-2 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
              {(["qty", "revenue"] as MovementMetric[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMetric(item)}
                  className={`min-h-8 rounded-md px-3 text-xs font-bold transition ${
                    metric === item
                      ? "bg-emerald-400 text-zinc-950"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  }`}
                >
                  {item === "qty" ? "Qty" : "Revenue"}
                </button>
              ))}
            </div>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value as Department | "all")}
              className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-white outline-none focus:border-emerald-400"
            >
              <option value="all">Semua dept</option>
              <option value="bar">Bar</option>
              <option value="kitchen">Kitchen</option>
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
              className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-white outline-none focus:border-emerald-400"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value as GradeFilter)}
              className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-white outline-none focus:border-emerald-400"
            >
              {GRADE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
              className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-white outline-none focus:border-emerald-400"
            >
              {ACTIVE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={sortKey}
              onChange={(e) => handleSortKeyChange(e.target.value as SortKey)}
              className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-semibold text-white outline-none focus:border-emerald-400"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  Sort: {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortDirection === "asc" ? "Asc" : "Desc"}
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memuat movement menu...
        </div>
      ) : error ? (
        <p className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 md:grid-cols-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Visible Menu</p>
              <p className="mt-1 text-2xl font-bold text-zinc-50">{rankedRows.length}</p>
              <p className="text-xs text-zinc-500">dari {rows.length} menu database</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Total Sold</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-50">{formatQty(visibleTotalSold)}</p>
              <p className="text-xs text-zinc-500">{zeroSoldCount}/{menuCount} zero sold</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Revenue</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-50">{formatRupiahCompact(visibleTotalRevenue)}</p>
              <p className="text-xs text-zinc-500">gross dari menu terlihat</p>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Metric Basis</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-50">
                {formatMetricValue(metric === "revenue" ? visibleTotalRevenue : visibleTotalSold, metric)}
              </p>
              <p className="text-xs text-zinc-500">ranking, share, dan compare</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            {(["A", "B", "C", "D"] as MenuMovementGrade[]).map((grade) => (
              <button
                key={grade}
                type="button"
                onClick={() => setGradeFilter((current) => (current === grade ? "all" : grade))}
                className={`rounded-lg border px-3 py-2 text-left transition hover:-translate-y-0.5 ${GRADE_CLASS[grade]} ${
                  gradeFilter === grade ? "ring-1 ring-white/30" : ""
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide">Grade {grade}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{gradeCounts[grade]}</p>
                <p className="text-xs opacity-80">{GRADE_LABEL[grade]}</p>
              </button>
            ))}
          </div>

          {rankedRows.length === 0 ? (
            <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-10 text-center text-sm text-zinc-500">
              Tidak ada menu yang cocok dengan filter aktif.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/45">
              <div className="max-h-[660px] overflow-auto">
                <table className="min-w-[1360px] w-full text-left text-sm">
                  <thead className="sticky top-0 z-10 bg-zinc-950 text-[11px] uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-3 font-semibold">Rank</th>
                      <th className="px-3 py-3 font-semibold">Menu</th>
                      <th className="px-3 py-3 font-semibold">Kategori Sales</th>
                      <th className="px-3 py-3 text-right font-semibold">Sold</th>
                      <th className="px-3 py-3 text-right font-semibold">Kontribusi {metric === "qty" ? "Qty" : "Revenue"}</th>
                      <th className="px-3 py-3 text-right font-semibold">Vs Week</th>
                      <th className="px-3 py-3 text-right font-semibold">Vs Month</th>
                      <th className="px-3 py-3 text-right font-semibold">Revenue</th>
                      <th className="px-3 py-3 font-semibold">Grade</th>
                      <th className="px-3 py-3 font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {rankedRows.map((row) => (
                      <tr key={row.id} className="text-zinc-300 transition hover:bg-zinc-900/55">
                        <td className="px-3 py-3">
                          <span className="font-semibold text-zinc-100">#{row.rank}</span>
                          <span className="ml-1 text-xs text-zinc-500">/ {row.rankTotal}</span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-zinc-100">{row.name}</p>
                            <p className="mt-0.5 text-xs text-zinc-500">
                              {row.isActive ? "Active" : "Inactive"} · {formatRupiah(row.unitPrice)}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-zinc-200">{salesMenuCategoryLabel(row.salesCategory)}</div>
                          <div className="mt-0.5 text-xs text-zinc-500">{departmentLabel(row.department)}</div>
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-zinc-100">
                          {formatQty(row.quantitySold)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <div>{row.sharePercent.toFixed(1)}%</div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-emerald-400"
                              style={{ width: `${Math.min(row.sharePercent, 100)}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <div className={`font-semibold ${changeTextClass(row.weekChangePercent)}`}>
                            {formatChangePercent(row.weekChangePercent)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            prev {formatMetricValue(row.previousWeekMetricValue, metric)}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          <div className={`font-semibold ${changeTextClass(row.monthChangePercent)}`}>
                            {formatChangePercent(row.monthChangePercent)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-500">
                            prev {formatMetricValue(row.previousMonthMetricValue, metric)}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-zinc-400">
                          {formatRupiahCompact(row.revenue)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`inline-flex min-h-8 items-center gap-2 rounded-lg border px-2.5 text-xs font-bold ${GRADE_CLASS[row.grade]}`}
                          >
                            {row.grade}
                            <span className="font-medium opacity-80">{GRADE_LABEL[row.grade]}</span>
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex max-w-[280px] items-start gap-2 text-xs leading-relaxed text-zinc-400">
                            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                            <span>{getMenuRecommendation(row)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
