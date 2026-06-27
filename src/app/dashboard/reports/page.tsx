"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Calculator,
  ChevronDown,
  Download,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Store,
  Trash2,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import type { StaffRole } from "@/lib/types/database";

type ReportField =
  | "grossSales"
  | "discounts"
  | "refunds"
  | "gratuityAmount"
  | "gratuityPercent"
  | "taxAmount"
  | "taxPercent"
  | "rounding";

type ReportDepartment = "bar" | "kitchen";
type ReportTabId =
  | "sales-summary"
  | "gross-profit"
  | "item-sales"
  | "service-charge"
  | "overtime-staff"
  | "complaint-case";

interface GrossProfitCostRow {
  id: string;
  category: string;
  actualCost: string;
  adjustment: string;
  note: string;
}

interface ItemSalesRow {
  id: string;
  menuName: string;
  department: string;
  quantity: string;
  unitPrice: string;
  note: string;
}

interface ServiceChargeStaffRow {
  id: string;
  staffName: string;
  role: string;
  point: string;
  adjustment: string;
  note: string;
}

interface OvertimeStaffRow {
  id: string;
  staffName: string;
  role: string;
  staffType: string;
  hours: string;
  rate: string;
  note: string;
}

interface ComplaintCaseRow {
  id: string;
  time: string;
  severity: string;
  caseTitle: string;
  owner: string;
  status: string;
  action: string;
}

interface GrossProfitSummary {
  totalCost: number;
  grossProfit: number;
  foodCostPercent: number;
  grossMarginPercent: number;
}

interface ItemSalesSummary {
  totalQuantity: number;
  totalRevenue: number;
  activeRows: number;
}

interface ServiceChargeSettlementRow extends ServiceChargeStaffRow {
  pointValue: number;
  grossShare: number;
  adjustmentValue: number;
  netShare: number;
}

interface ServiceChargeSummary {
  totalPoint: number;
  totalGrossShare: number;
  totalAdjustment: number;
  totalNetShare: number;
}

interface OvertimeSummary {
  totalHours: number;
  totalPay: number;
  activeRows: number;
}

interface ComplaintSummary {
  totalCases: number;
  openCases: number;
  highSeverityCases: number;
}

interface SalesSummaryDraft {
  grossSales: string;
  discounts: string;
  refunds: string;
  gratuityAmount: string;
  gratuityPercent: string;
  gratuityAuto: boolean;
  taxAmount: string;
  taxPercent: string;
  taxAuto: boolean;
  rounding: string;
  departmentSettlements: DepartmentSettlementDraft[];
  grossProfitRows: GrossProfitCostRow[];
  itemSalesRows: ItemSalesRow[];
  serviceChargeRows: ServiceChargeStaffRow[];
  overtimeRows: OvertimeStaffRow[];
  complaintRows: ComplaintCaseRow[];
  updatedAt: string | null;
}

interface FinancialSummary {
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  gratuityAmount: number;
  taxAmount: number;
  rounding: number;
  totalLossDeduction: number;
  netServiceAfterLoss: number;
  totalCollected: number;
}

interface DepartmentSettlementDraft {
  department: ReportDepartment;
  revenueBase: string;
  lossDeduction: string;
  note: string;
}

interface DepartmentSettlementSummary {
  department: ReportDepartment;
  label: string;
  revenueBaseInput: string;
  revenueBase: number;
  servicePool: number;
  lossDeductionInput: string;
  lossDeduction: number;
  netService: number;
  note: string;
}

type ReportNavItem = {
  id: ReportTabId;
  label: string;
  description: string;
};

const REPORT_ROLES: StaffRole[] = ["master_admin", "admin", "op_manager"];
const STORAGE_PREFIX = "artha_reports_sales_summary";
const OUTLET_OPTIONS = ["Outlet 1", "Outlet 2", "Outlet 3"];
const DEPARTMENT_OPTIONS: { id: ReportDepartment; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "kitchen", label: "Kitchen" },
];

const REPORT_NAV_ITEMS: ReportNavItem[] = [
  { id: "sales-summary", label: "Sales Summary", description: "Moka POS entry & manual revenue" },
  { id: "gross-profit", label: "Gross Profit", description: "Daily gross margin & food cost calculation" },
  { id: "item-sales", label: "Item Sales", description: "Menu movement quantity from Moka" },
  { id: "service-charge", label: "Service Charge", description: "Staff gross share & net settlement" },
  { id: "overtime-staff", label: "Overtime Staff", description: "Daily staff overtime & DW tracking" },
  { id: "complaint-case", label: "Complaint & Case", description: "Real-time daily guest feedback & issues" },
];

function isReportTabId(value: string | null): value is ReportTabId {
  return REPORT_NAV_ITEMS.some((item) => item.id === value);
}

const REPORT_FIELD_KEYS: ReportField[] = [
  "grossSales",
  "discounts",
  "refunds",
  "gratuityAmount",
  "gratuityPercent",
  "taxAmount",
  "taxPercent",
  "rounding",
];

const DEFAULT_GROSS_PROFIT_ROWS: GrossProfitCostRow[] = [
  { id: "food-ingredients", category: "Food Ingredients", actualCost: "", adjustment: "", note: "" },
  { id: "beverage-ingredients", category: "Beverage Ingredients", actualCost: "", adjustment: "", note: "" },
  { id: "packaging", category: "Packaging", actualCost: "", adjustment: "", note: "" },
  { id: "waste-spoilage", category: "Waste / Spoilage", actualCost: "", adjustment: "", note: "" },
];

const DEFAULT_ITEM_SALES_ROWS: ItemSalesRow[] = Array.from({ length: 6 }, (_, index) => ({
  id: `item-sales-${index + 1}`,
  menuName: "",
  department: "",
  quantity: "",
  unitPrice: "",
  note: "",
}));

const DEFAULT_SERVICE_CHARGE_ROWS: ServiceChargeStaffRow[] = Array.from({ length: 6 }, (_, index) => ({
  id: `service-staff-${index + 1}`,
  staffName: "",
  role: "",
  point: "",
  adjustment: "",
  note: "",
}));

const DEFAULT_OVERTIME_ROWS: OvertimeStaffRow[] = Array.from({ length: 6 }, (_, index) => ({
  id: `overtime-${index + 1}`,
  staffName: "",
  role: "",
  staffType: "",
  hours: "",
  rate: "",
  note: "",
}));

const DEFAULT_COMPLAINT_ROWS: ComplaintCaseRow[] = Array.from({ length: 5 }, (_, index) => ({
  id: `case-${index + 1}`,
  time: "",
  severity: "",
  caseTitle: "",
  owner: "",
  status: "",
  action: "",
}));

const DEFAULT_DRAFT: SalesSummaryDraft = {
  grossSales: "",
  discounts: "",
  refunds: "",
  gratuityAmount: "",
  gratuityPercent: "5",
  gratuityAuto: true,
  taxAmount: "",
  taxPercent: "10",
  taxAuto: true,
  rounding: "0",
  departmentSettlements: [
    { department: "bar", revenueBase: "", lossDeduction: "", note: "" },
    { department: "kitchen", revenueBase: "", lossDeduction: "", note: "" },
  ],
  grossProfitRows: DEFAULT_GROSS_PROFIT_ROWS.map((row) => ({ ...row })),
  itemSalesRows: DEFAULT_ITEM_SALES_ROWS.map((row) => ({ ...row })),
  serviceChargeRows: DEFAULT_SERVICE_CHARGE_ROWS.map((row) => ({ ...row })),
  overtimeRows: DEFAULT_OVERTIME_ROWS.map((row) => ({ ...row })),
  complaintRows: DEFAULT_COMPLAINT_ROWS.map((row) => ({ ...row })),
  updatedAt: null,
};

function getTodayIso(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getStorageKey(outlet: string, businessDate: string): string {
  return `${STORAGE_PREFIX}:${outlet}:${businessDate}`;
}

function parseAmount(value: string): number {
  const normalized = value.replace(/[^\d-]/g, "");
  if (normalized === "" || normalized === "-") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePercent(value: string): number {
  const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
  if (normalized === "" || normalized === "-") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDecimal(value: string): number {
  const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
  if (normalized === "" || normalized === "-") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function formatDateDisplay(value: string): string {
  if (!value) return "-";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return "Belum tersimpan";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function calculateSummary(draft: SalesSummaryDraft): FinancialSummary {
  const grossSales = parseAmount(draft.grossSales);
  const discounts = parseAmount(draft.discounts);
  const refunds = parseAmount(draft.refunds);
  const netSales = grossSales - discounts - refunds;
  const gratuityAmount = draft.gratuityAuto
    ? netSales * (parsePercent(draft.gratuityPercent) / 100)
    : parseAmount(draft.gratuityAmount);
  const taxAmount = draft.taxAuto
    ? (netSales + gratuityAmount) * (parsePercent(draft.taxPercent) / 100)
    : parseAmount(draft.taxAmount);
  const rounding = parseAmount(draft.rounding);
  const totalLossDeduction = draft.departmentSettlements.reduce((sum, row) => sum + parseAmount(row.lossDeduction), 0);

  return {
    grossSales,
    discounts,
    refunds,
    netSales,
    gratuityAmount,
    taxAmount,
    rounding,
    totalLossDeduction,
    netServiceAfterLoss: gratuityAmount - totalLossDeduction,
    totalCollected: netSales + gratuityAmount + taxAmount + rounding,
  };
}

function departmentLabel(department: ReportDepartment): string {
  return DEPARTMENT_OPTIONS.find((option) => option.id === department)?.label ?? department;
}

function getDefaultDepartmentSettlements(): DepartmentSettlementDraft[] {
  return DEFAULT_DRAFT.departmentSettlements.map((row) => ({ ...row }));
}

function getDefaultReportDraft(): SalesSummaryDraft {
  return {
    ...DEFAULT_DRAFT,
    departmentSettlements: DEFAULT_DRAFT.departmentSettlements.map((row) => ({ ...row })),
    grossProfitRows: DEFAULT_GROSS_PROFIT_ROWS.map((row) => ({ ...row })),
    itemSalesRows: DEFAULT_ITEM_SALES_ROWS.map((row) => ({ ...row })),
    serviceChargeRows: DEFAULT_SERVICE_CHARGE_ROWS.map((row) => ({ ...row })),
    overtimeRows: DEFAULT_OVERTIME_ROWS.map((row) => ({ ...row })),
    complaintRows: DEFAULT_COMPLAINT_ROWS.map((row) => ({ ...row })),
  };
}

function createRowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeDepartmentSettlements(value: unknown): DepartmentSettlementDraft[] {
  const source = Array.isArray(value) ? value : [];

  return DEPARTMENT_OPTIONS.map((department) => {
    const existing = source.find((item): item is Partial<DepartmentSettlementDraft> => {
      return (
        item != null &&
        typeof item === "object" &&
        "department" in item &&
        (item as Partial<DepartmentSettlementDraft>).department === department.id
      );
    });

    return {
      department: department.id,
      revenueBase: typeof existing?.revenueBase === "string" ? existing.revenueBase : "",
      lossDeduction: typeof existing?.lossDeduction === "string" ? existing.lossDeduction : "",
      note: typeof existing?.note === "string" ? existing.note : "",
    };
  });
}

function normalizeGrossProfitRows(value: unknown): GrossProfitCostRow[] {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return DEFAULT_GROSS_PROFIT_ROWS.map((row) => ({ ...row }));

  return rows.map((row, index) => {
    const item = row as Partial<GrossProfitCostRow>;
    return {
      id: asString(item.id) || `gross-profit-${index + 1}`,
      category: asString(item.category),
      actualCost: asString(item.actualCost),
      adjustment: asString(item.adjustment),
      note: asString(item.note),
    };
  });
}

function normalizeItemSalesRows(value: unknown): ItemSalesRow[] {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return DEFAULT_ITEM_SALES_ROWS.map((row) => ({ ...row }));

  return rows.map((row, index) => {
    const item = row as Partial<ItemSalesRow>;
    return {
      id: asString(item.id) || `item-sales-${index + 1}`,
      menuName: asString(item.menuName),
      department: asString(item.department),
      quantity: asString(item.quantity),
      unitPrice: asString(item.unitPrice),
      note: asString(item.note),
    };
  });
}

function normalizeServiceChargeRows(value: unknown): ServiceChargeStaffRow[] {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return DEFAULT_SERVICE_CHARGE_ROWS.map((row) => ({ ...row }));

  return rows.map((row, index) => {
    const item = row as Partial<ServiceChargeStaffRow>;
    return {
      id: asString(item.id) || `service-staff-${index + 1}`,
      staffName: asString(item.staffName),
      role: asString(item.role),
      point: asString(item.point),
      adjustment: asString(item.adjustment),
      note: asString(item.note),
    };
  });
}

function normalizeOvertimeRows(value: unknown): OvertimeStaffRow[] {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return DEFAULT_OVERTIME_ROWS.map((row) => ({ ...row }));

  return rows.map((row, index) => {
    const item = row as Partial<OvertimeStaffRow>;
    return {
      id: asString(item.id) || `overtime-${index + 1}`,
      staffName: asString(item.staffName),
      role: asString(item.role),
      staffType: asString(item.staffType),
      hours: asString(item.hours),
      rate: asString(item.rate),
      note: asString(item.note),
    };
  });
}

function normalizeComplaintRows(value: unknown): ComplaintCaseRow[] {
  const rows = Array.isArray(value) ? value : [];
  if (rows.length === 0) return DEFAULT_COMPLAINT_ROWS.map((row) => ({ ...row }));

  return rows.map((row, index) => {
    const item = row as Partial<ComplaintCaseRow>;
    return {
      id: asString(item.id) || `case-${index + 1}`,
      time: asString(item.time),
      severity: asString(item.severity),
      caseTitle: asString(item.caseTitle),
      owner: asString(item.owner),
      status: asString(item.status),
      action: asString(item.action),
    };
  });
}

function normalizeDraft(value: SalesSummaryDraft): SalesSummaryDraft {
  return {
    ...DEFAULT_DRAFT,
    ...value,
    departmentSettlements: normalizeDepartmentSettlements(value.departmentSettlements),
    grossProfitRows: normalizeGrossProfitRows(value.grossProfitRows),
    itemSalesRows: normalizeItemSalesRows(value.itemSalesRows),
    serviceChargeRows: normalizeServiceChargeRows(value.serviceChargeRows),
    overtimeRows: normalizeOvertimeRows(value.overtimeRows),
    complaintRows: normalizeComplaintRows(value.complaintRows),
  };
}

function calculateDepartmentSettlementRows(draft: SalesSummaryDraft, summary: FinancialSummary): DepartmentSettlementSummary[] {
  const rows = normalizeDepartmentSettlements(draft.departmentSettlements);
  const totalRevenueBase = rows.reduce((sum, row) => sum + parseAmount(row.revenueBase), 0);

  return rows.map((row) => {
    const revenueBase = parseAmount(row.revenueBase);
    const shareRatio = totalRevenueBase > 0 ? revenueBase / totalRevenueBase : 0;
    const servicePool = summary.gratuityAmount * shareRatio;
    const lossDeduction = parseAmount(row.lossDeduction);

    return {
      department: row.department,
      label: departmentLabel(row.department),
      revenueBaseInput: row.revenueBase,
      revenueBase,
      servicePool,
      lossDeductionInput: row.lossDeduction,
      lossDeduction,
      netService: servicePool - lossDeduction,
      note: row.note,
    };
  });
}

function calculateGrossProfitSummary(rows: GrossProfitCostRow[], summary: FinancialSummary): GrossProfitSummary {
  const totalCost = rows.reduce((sum, row) => sum + parseAmount(row.actualCost) + parseAmount(row.adjustment), 0);
  const grossProfit = summary.netSales - totalCost;
  const foodCostPercent = summary.netSales > 0 ? (totalCost / summary.netSales) * 100 : 0;
  const grossMarginPercent = summary.netSales > 0 ? (grossProfit / summary.netSales) * 100 : 0;

  return {
    totalCost,
    grossProfit,
    foodCostPercent,
    grossMarginPercent,
  };
}

function calculateItemSalesSummary(rows: ItemSalesRow[]): ItemSalesSummary {
  return rows.reduce<ItemSalesSummary>(
    (summary, row) => {
      const quantity = parseDecimal(row.quantity);
      const revenue = quantity * parseAmount(row.unitPrice);
      return {
        totalQuantity: summary.totalQuantity + quantity,
        totalRevenue: summary.totalRevenue + revenue,
        activeRows: summary.activeRows + (row.menuName.trim() || quantity > 0 || revenue > 0 ? 1 : 0),
      };
    },
    { totalQuantity: 0, totalRevenue: 0, activeRows: 0 }
  );
}

function calculateServiceChargeSettlementRows(
  rows: ServiceChargeStaffRow[],
  summary: FinancialSummary
): { rows: ServiceChargeSettlementRow[]; summary: ServiceChargeSummary } {
  const totalPoint = rows.reduce((sum, row) => sum + parseDecimal(row.point), 0);
  const settlementRows = rows.map((row) => {
    const pointValue = parseDecimal(row.point);
    const grossShare = totalPoint > 0 ? summary.netServiceAfterLoss * (pointValue / totalPoint) : 0;
    const adjustmentValue = parseAmount(row.adjustment);
    const netShare = grossShare + adjustmentValue;

    return {
      ...row,
      pointValue,
      grossShare,
      adjustmentValue,
      netShare,
    };
  });

  return {
    rows: settlementRows,
    summary: settlementRows.reduce<ServiceChargeSummary>(
      (acc, row) => ({
        totalPoint: acc.totalPoint + row.pointValue,
        totalGrossShare: acc.totalGrossShare + row.grossShare,
        totalAdjustment: acc.totalAdjustment + row.adjustmentValue,
        totalNetShare: acc.totalNetShare + row.netShare,
      }),
      { totalPoint: 0, totalGrossShare: 0, totalAdjustment: 0, totalNetShare: 0 }
    ),
  };
}

function calculateOvertimeSummary(rows: OvertimeStaffRow[]): OvertimeSummary {
  return rows.reduce<OvertimeSummary>(
    (summary, row) => {
      const hours = parseDecimal(row.hours);
      const pay = hours * parseAmount(row.rate);
      return {
        totalHours: summary.totalHours + hours,
        totalPay: summary.totalPay + pay,
        activeRows: summary.activeRows + (row.staffName.trim() || hours > 0 || pay > 0 ? 1 : 0),
      };
    },
    { totalHours: 0, totalPay: 0, activeRows: 0 }
  );
}

function calculateComplaintSummary(rows: ComplaintCaseRow[]): ComplaintSummary {
  return rows.reduce<ComplaintSummary>(
    (summary, row) => {
      const hasCase = Boolean(row.caseTitle.trim() || row.action.trim());
      const status = row.status.toLowerCase();
      const severity = row.severity.toLowerCase();

      return {
        totalCases: summary.totalCases + (hasCase ? 1 : 0),
        openCases: summary.openCases + (hasCase && status !== "resolved" && status !== "closed" ? 1 : 0),
        highSeverityCases: summary.highSeverityCases + (hasCase && (severity === "high" || severity === "critical") ? 1 : 0),
      };
    },
    { totalCases: 0, openCases: 0, highSeverityCases: 0 }
  );
}

function isSalesSummaryDraft(value: unknown): value is SalesSummaryDraft {
  if (value == null || typeof value !== "object") return false;
  const draft = value as Partial<Record<keyof SalesSummaryDraft, unknown>>;
  return (
    REPORT_FIELD_KEYS.every((key) => typeof draft[key] === "string") &&
    typeof draft.gratuityAuto === "boolean" &&
    typeof draft.taxAuto === "boolean" &&
    (draft.updatedAt === null || typeof draft.updatedAt === "string")
  );
}

function loadStoredDraft(outlet: string, businessDate: string): SalesSummaryDraft {
  if (typeof window === "undefined") return getDefaultReportDraft();
  const raw = window.localStorage.getItem(getStorageKey(outlet, businessDate));
  if (!raw) return getDefaultReportDraft();

  try {
    const parsed: unknown = JSON.parse(raw);
    return isSalesSummaryDraft(parsed) ? normalizeDraft(parsed) : getDefaultReportDraft();
  } catch {
    return getDefaultReportDraft();
  }
}

function saveStoredDraft(outlet: string, businessDate: string, draft: SalesSummaryDraft): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getStorageKey(outlet, businessDate), JSON.stringify(draft));
}

type CsvCell = string | number;

function stringifyCsvRows(rows: CsvCell[][]): string {
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function buildExportCsv(outlet: string, businessDate: string, draft: SalesSummaryDraft, summary: FinancialSummary): string {
  const departmentRows = calculateDepartmentSettlementRows(draft, summary);
  const rows: CsvCell[][] = [
    ["Report", "Sales Summary"],
    ["Outlet", outlet],
    ["Date", formatDateDisplay(businessDate)],
    ["Gross Sales", summary.grossSales],
    ["Discounts", summary.discounts],
    ["Refunds", summary.refunds],
    ["Net Sales", summary.netSales],
    ["Gratuity", summary.gratuityAmount],
    ["Gratuity Percent", draft.gratuityAuto ? `${draft.gratuityPercent}%` : "Manual"],
    ["Tax", summary.taxAmount],
    ["Tax Percent", draft.taxAuto ? `${draft.taxPercent}%` : "Manual"],
    ["Rounding", summary.rounding],
    ["Total Collected", summary.totalCollected],
    [""],
    ["Service Settlement & Loss Deduction"],
    ["Department", "Revenue Base", "Detected Service Pool", "Loss Deduction", "Net Service", "Note"],
    ...departmentRows.map((row) => [
      row.label,
      row.revenueBase,
      row.servicePool,
      row.lossDeduction,
      row.netService,
      row.note || "-",
    ]),
    ["Total Loss Deduction", summary.totalLossDeduction],
    ["Net Service After Loss", summary.netServiceAfterLoss],
    ["Updated At", draft.updatedAt ?? "-"],
  ];

  return stringifyCsvRows(rows);
}

function buildActiveReportCsv(
  activeTab: ReportTabId,
  outlet: string,
  businessDate: string,
  draft: SalesSummaryDraft,
  summary: FinancialSummary
): string {
  if (activeTab === "sales-summary") return buildExportCsv(outlet, businessDate, draft, summary);

  const baseRows: CsvCell[][] = [
    ["Outlet", outlet],
    ["Date", formatDateDisplay(businessDate)],
    ["Updated At", draft.updatedAt ?? "-"],
    [""],
  ];

  if (activeTab === "gross-profit") {
    const grossProfitSummary = calculateGrossProfitSummary(draft.grossProfitRows, summary);
    return stringifyCsvRows([
      ["Report", "Gross Profit"],
      ...baseRows,
      ["Net Sales", summary.netSales],
      ["Total Cost", grossProfitSummary.totalCost],
      ["Gross Profit", grossProfitSummary.grossProfit],
      ["Food Cost %", formatPercent(grossProfitSummary.foodCostPercent)],
      ["Gross Margin %", formatPercent(grossProfitSummary.grossMarginPercent)],
      [""],
      ["Category", "Actual Cost", "Adjustment", "Total Cost", "Note"],
      ...draft.grossProfitRows.map((row) => [
        row.category || "-",
        parseAmount(row.actualCost),
        parseAmount(row.adjustment),
        parseAmount(row.actualCost) + parseAmount(row.adjustment),
        row.note || "-",
      ]),
    ]);
  }

  if (activeTab === "item-sales") {
    const itemSalesSummary = calculateItemSalesSummary(draft.itemSalesRows);
    return stringifyCsvRows([
      ["Report", "Item Sales"],
      ...baseRows,
      ["Active Menu", itemSalesSummary.activeRows],
      ["Total Qty", itemSalesSummary.totalQuantity],
      ["Menu Revenue", itemSalesSummary.totalRevenue],
      [""],
      ["Menu", "Department", "Qty", "Unit Price", "Revenue", "Note"],
      ...draft.itemSalesRows.map((row) => {
        const quantity = parseDecimal(row.quantity);
        const unitPrice = parseAmount(row.unitPrice);
        return [row.menuName || "-", row.department || "-", quantity, unitPrice, quantity * unitPrice, row.note || "-"];
      }),
    ]);
  }

  if (activeTab === "service-charge") {
    const settlement = calculateServiceChargeSettlementRows(draft.serviceChargeRows, summary);
    return stringifyCsvRows([
      ["Report", "Service Charge"],
      ...baseRows,
      ["Service Pool", summary.netServiceAfterLoss],
      ["Total Point", settlement.summary.totalPoint],
      ["Total Adjustment", settlement.summary.totalAdjustment],
      ["Net Settlement", settlement.summary.totalNetShare],
      [""],
      ["Staff", "Role", "Point", "Gross Share", "Adjustment", "Net Share", "Note"],
      ...settlement.rows.map((row) => [
        row.staffName || "-",
        row.role || "-",
        row.pointValue,
        row.grossShare,
        row.adjustmentValue,
        row.netShare,
        row.note || "-",
      ]),
    ]);
  }

  if (activeTab === "overtime-staff") {
    const overtimeSummary = calculateOvertimeSummary(draft.overtimeRows);
    return stringifyCsvRows([
      ["Report", "Overtime Staff"],
      ...baseRows,
      ["Active Staff", overtimeSummary.activeRows],
      ["Total Hours", overtimeSummary.totalHours],
      ["Total Pay", overtimeSummary.totalPay],
      [""],
      ["Staff", "Role", "Type", "Hours", "Rate", "Total", "Note"],
      ...draft.overtimeRows.map((row) => {
        const hours = parseDecimal(row.hours);
        const rate = parseAmount(row.rate);
        return [row.staffName || "-", row.role || "-", row.staffType || "-", hours, rate, hours * rate, row.note || "-"];
      }),
    ]);
  }

  const complaintSummary = calculateComplaintSummary(draft.complaintRows);
  return stringifyCsvRows([
    ["Report", "Complaint & Case"],
    ...baseRows,
    ["Total Case", complaintSummary.totalCases],
    ["Open Case", complaintSummary.openCases],
    ["High Severity", complaintSummary.highSeverityCases],
    [""],
    ["Time", "Severity", "Case", "Owner", "Status", "Action"],
    ...draft.complaintRows.map((row) => [
      row.time || "-",
      row.severity || "-",
      row.caseTitle || "-",
      row.owner || "-",
      row.status || "-",
      row.action || "-",
    ]),
  ]);
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function currencyInputValue(value: string, fallbackValue?: number): string {
  if (value.trim()) return value;
  if (fallbackValue == null || fallbackValue === 0) return "";
  return String(Math.round(fallbackValue));
}

function spreadsheetRowClass(tone: "default" | "subtotal" | "total" = "default"): string {
  const base = "grid min-w-[780px] grid-cols-[minmax(220px,1fr)_220px_minmax(280px,1.2fr)] transition-colors";
  if (tone === "total") return `${base} bg-teal-50/70 border-t-2 border-b-2 border-teal-600 hover:bg-teal-50`;
  if (tone === "subtotal") return `${base} bg-slate-50 hover:bg-slate-100/70`;
  return `${base} odd:bg-white even:bg-slate-50/50 hover:bg-teal-50/40`;
}

function SpreadsheetHeader() {
  return (
    <div className="grid min-w-[780px] grid-cols-[minmax(220px,1fr)_220px_minmax(280px,1.2fr)] bg-slate-100 border-b-2 border-slate-300">
      <div className="text-slate-700 font-bold text-xs uppercase tracking-wider py-3 px-4 text-left border-r border-slate-200">
        Metrik Keuangan
      </div>
      <div className="text-slate-700 font-bold text-xs uppercase tracking-wider py-3 px-4 text-right border-r border-slate-200">
        Nilai (IDR)
      </div>
      <div className="text-slate-700 font-bold text-xs uppercase tracking-wider py-3 px-4 text-left">
        Keterangan / Rumus
      </div>
    </div>
  );
}

function ReportsNavigationPanel({
  activeTab,
  onChangeTab,
}: {
  activeTab: ReportTabId;
  onChangeTab: (tab: ReportTabId) => void;
}) {
  const [isReportsOpen, setIsReportsOpen] = useState(false);

  return (
    <aside className="bg-white border border-slate-200 rounded-xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] lg:sticky lg:top-6 lg:col-span-3 lg:h-fit">
      <button
        type="button"
        onClick={() => setIsReportsOpen(!isReportsOpen)}
        aria-expanded={isReportsOpen}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Reports</span>
          <span className="mt-1 block truncate text-sm font-bold text-slate-900">
            {REPORT_NAV_ITEMS.find((item) => item.id === activeTab)?.label ?? "Backoffice Reports"}
          </span>
        </span>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-900 transition-transform duration-200 ${
            isReportsOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isReportsOpen && (
        <div className="pl-4 space-y-1 transition-all duration-300">
          <div className="mb-2 mt-3 border-l border-slate-200 pl-3">
            <p className="text-xs font-medium leading-5 text-slate-700">Manual sync sheet untuk validasi data Moka POS.</p>
          </div>
          <nav className="space-y-1" aria-label="Reports navigation">
            {REPORT_NAV_ITEMS.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeTab(item.id)}
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "w-full bg-teal-50 font-semibold border-l-4 border-l-teal-600 px-4 py-3 rounded-r-lg text-sm flex flex-col text-left"
                      : "w-full text-slate-900 hover:bg-slate-50 border-b border-slate-100 px-4 py-3 text-sm font-medium flex flex-col transition-colors text-left"
                  }
                >
                  <span className="text-slate-900 font-medium">{item.label}</span>
                  <span className="mt-1 text-slate-500 text-xs">{item.description}</span>
                </button>
              );
            })}
          </nav>
        </div>
      )}
    </aside>
  );
}

function SpreadsheetCurrencyInput({
  value,
  onChange,
  disabled = false,
  placeholder = "0",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      inputMode="numeric"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="bg-white border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-900 text-sm font-mono px-2 py-1 rounded outline-none w-48 text-right disabled:bg-slate-50 disabled:text-slate-900 placeholder:text-slate-400"
    />
  );
}

function SpreadsheetInputRow({
  label,
  detail,
  value,
  onChange,
  children,
}: {
  label: string;
  detail: string;
  value: string;
  onChange: (value: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className={spreadsheetRowClass()}>
      <div className="border-b border-r border-slate-200/80 py-2.5 px-4 flex items-center">
        <p className="text-slate-900 font-medium text-sm">{label}</p>
      </div>
      <div className="border-b border-r border-slate-200/80 py-2.5 px-4 flex justify-end items-center">
        <SpreadsheetCurrencyInput value={value} onChange={onChange} />
      </div>
      <div className="border-b border-slate-200/80 py-2.5 px-4 flex flex-col justify-center gap-2">
        <p className="text-xs leading-5 text-slate-600">{detail}</p>
        {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </div>
  );
}

function SpreadsheetCalculatedRow({
  label,
  detail,
  value,
  grand = false,
}: {
  label: string;
  detail: string;
  value: number;
  grand?: boolean;
}) {
  const firstCellClass = grand
    ? "border-r border-teal-200/80 py-2.5 px-4 flex items-center"
    : "border-b border-r border-slate-200/80 py-2.5 px-4 flex items-center";
  const valueCellClass = grand
    ? "border-r border-teal-200/80 py-2.5 px-4 flex justify-end items-center"
    : "border-b border-r border-slate-200/80 py-2.5 px-4 flex justify-end items-center";
  const detailCellClass = grand
    ? "py-2.5 px-4 flex items-center"
    : "border-b border-slate-200/80 py-2.5 px-4 flex items-center";

  return (
    <div className={spreadsheetRowClass(grand ? "total" : "subtotal")}>
      <div className={firstCellClass}>
        <p className={grand ? "text-teal-700 font-extrabold text-base" : "font-bold text-slate-900 text-sm"}>{label}</p>
      </div>
      <div className={valueCellClass}>
        <p className={grand ? "text-teal-700 font-extrabold text-lg font-mono" : "font-bold text-slate-900 text-sm font-mono"}>
          {formatRupiah(value)}
        </p>
      </div>
      <div className={detailCellClass}>
        <p className={grand ? "text-xs font-semibold leading-5 text-teal-700" : "text-xs leading-5 text-slate-600"}>{detail}</p>
      </div>
    </div>
  );
}

function PercentControl({
  label,
  value,
  active,
  onPercentChange,
  onToggleAuto,
}: {
  label: string;
  value: string;
  active: boolean;
  onPercentChange: (value: string) => void;
  onToggleAuto: () => void;
}) {
  return (
    <div className="inline-flex min-h-8 items-center gap-2 rounded border border-slate-300 bg-white px-2 py-1">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(event) => onPercentChange(event.target.value)}
        className="h-7 w-16 rounded border border-slate-300 bg-white px-2 text-right text-xs font-mono font-semibold text-slate-900 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
      />
      <span className="text-xs font-semibold text-slate-600">%</span>
      <button
        type="button"
        onClick={onToggleAuto}
        className={`rounded px-2 py-1 text-xs font-semibold transition ${
          active ? "bg-teal-600 text-white hover:bg-teal-700" : "bg-white text-slate-700 hover:bg-slate-100"
        }`}
      >
        {active ? "Auto" : "Manual"}
      </button>
    </div>
  );
}

function SettlementAmountInput({
  value,
  onChange,
  placeholder = "0",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      inputMode="numeric"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="bg-white border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-900 text-sm font-mono px-2 py-1 rounded outline-none w-full text-right placeholder:text-slate-400"
    />
  );
}

function ServiceSettlementSection({
  settlementRows,
  totalLossDeduction,
  netServiceAfterLoss,
  onChangeDepartment,
}: {
  settlementRows: DepartmentSettlementSummary[];
  totalLossDeduction: number;
  netServiceAfterLoss: number;
  onChangeDepartment: (department: ReportDepartment, patch: Partial<Omit<DepartmentSettlementDraft, "department">>) => void;
}) {
  return (
    <section className="border-t-2 border-slate-300 bg-white">
      <div className="flex min-w-[980px] items-center justify-between gap-4 border-b-2 border-slate-300 bg-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Calculator className="h-4 w-4 text-teal-700" />
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Service Settlement & Loss Deduction</h3>
            <p className="mt-0.5 text-xs text-slate-600">
              Service pool dari Gratuity dibaca per department melalui revenue base.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 text-right">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">Total Loss</p>
            <p className="font-mono text-sm font-bold text-red-700">{formatRupiah(totalLossDeduction)}</p>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">Net Service</p>
            <p className="font-mono text-sm font-extrabold text-slate-900">{formatRupiah(netServiceAfterLoss)}</p>
          </div>
        </div>
      </div>

      <div className="grid min-w-[980px] grid-cols-[160px_180px_180px_180px_180px_minmax(220px,1fr)] bg-slate-100 border-b-2 border-slate-300">
        {["Department", "Revenue Base", "Service Pool", "Loss Deduction", "Net Service", "Note"].map((label, index) => (
          <div
            key={label}
            className={`text-slate-700 font-bold text-xs uppercase tracking-wider py-3 px-4 border-r border-slate-200 ${
              index > 0 && index < 5 ? "text-right" : "text-left"
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      <div>
        {settlementRows.map((row) => (
          <div
            key={row.department}
            className="grid min-w-[980px] grid-cols-[160px_180px_180px_180px_180px_minmax(220px,1fr)] odd:bg-white even:bg-slate-50/50 hover:bg-teal-50/40 transition-colors"
          >
            <div className="border-b border-r border-slate-200/80 py-2.5 px-4 flex flex-col justify-center">
              <span className="text-slate-900 font-bold text-sm">{row.label}</span>
              <span className="text-xs font-medium text-slate-600">Dept: {row.department}</span>
            </div>
            <div className="border-b border-r border-slate-200/80 py-2.5 px-4 flex justify-end items-center">
              <SettlementAmountInput
                value={row.revenueBaseInput}
                onChange={(value) => onChangeDepartment(row.department, { revenueBase: value })}
              />
            </div>
            <div className="border-b border-r border-slate-200/80 py-2.5 px-4 flex justify-end items-center">
              <p className="text-slate-900 font-medium text-sm font-mono">{formatRupiah(row.servicePool)}</p>
            </div>
            <div className="border-b border-r border-slate-200/80 py-2.5 px-4 flex justify-end items-center">
              <SettlementAmountInput
                value={row.lossDeductionInput}
                onChange={(value) => onChangeDepartment(row.department, { lossDeduction: value })}
              />
            </div>
            <div className="border-b border-r border-slate-200/80 py-2.5 px-4 flex justify-end items-center">
              <p className="text-slate-900 font-extrabold text-sm font-mono">{formatRupiah(row.netService)}</p>
            </div>
            <div className="border-b border-slate-200/80 py-2.5 px-4 flex items-center">
              <input
                value={row.note}
                onChange={(event) => onChangeDepartment(row.department, { note: event.target.value })}
                placeholder="Spoil / opname / human error"
                className="bg-white border border-slate-300 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 text-slate-900 text-sm px-2 py-1 rounded outline-none w-full placeholder:text-slate-400"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReportMetricCard({
  label,
  value,
  detail,
  tone = "slate",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "slate" | "teal" | "red" | "amber";
}) {
  const toneClass =
    tone === "teal"
      ? "border-teal-200 bg-teal-50 text-teal-700"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-red-700"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-white text-slate-900";

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <p className="text-[11px] font-bold uppercase tracking-wider">{label}</p>
      <p className="mt-1 font-mono text-lg font-extrabold">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-600">{detail}</p>
    </div>
  );
}

function SheetInput({
  value,
  onChange,
  placeholder,
  align = "left",
  inputMode = "text",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  align?: "left" | "right";
  inputMode?: "text" | "numeric" | "decimal";
}) {
  return (
    <input
      value={value}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className={`h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 ${
        align === "right" ? "text-right font-mono" : "text-left"
      }`}
    />
  );
}

function SheetSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full rounded border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function DeleteRowButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 w-9 items-center justify-center rounded border border-slate-300 bg-white text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
      aria-label="Hapus baris"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

function ReportSheetSection({
  kicker,
  title,
  description,
  actionLabel,
  onAddRow,
  children,
  metrics,
}: {
  kicker: string;
  title: string;
  description: string;
  actionLabel: string;
  onAddRow: () => void;
  children: React.ReactNode;
  metrics: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-300 bg-white px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{kicker}</p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
        <button
          type="button"
          onClick={onAddRow}
          className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 active:scale-[0.98]"
        >
          <Plus className="h-3.5 w-3.5" />
          {actionLabel}
        </button>
      </div>
      <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics}
      </div>
      <div className="overflow-x-auto scrollbar-thin">{children}</div>
    </section>
  );
}

function SheetHeaderCell({ label, align = "left" }: { label: string; align?: "left" | "right" | "center" }) {
  const alignClass = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <div className={`border-r border-slate-200 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-700 ${alignClass}`}>
      {label}
    </div>
  );
}

function GrossProfitReportSection({
  rows,
  financialSummary,
  grossProfitSummary,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}: {
  rows: GrossProfitCostRow[];
  financialSummary: FinancialSummary;
  grossProfitSummary: GrossProfitSummary;
  onUpdateRow: (id: string, patch: Partial<Omit<GrossProfitCostRow, "id">>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
}) {
  return (
    <ReportSheetSection
      kicker="Gross Profit"
      title="Daily Gross Margin & Food Cost"
      description="Perhitungan keuntungan kotor harian dari Net Sales dikurangi biaya bahan dan koreksi operasional."
      actionLabel="Tambah Cost"
      onAddRow={onAddRow}
      metrics={
        <>
          <ReportMetricCard label="Net Sales" value={formatRupiah(financialSummary.netSales)} detail="Dari Sales Summary" />
          <ReportMetricCard label="Total Cost" value={formatRupiah(grossProfitSummary.totalCost)} detail="COGS + adjustment" tone="amber" />
          <ReportMetricCard label="Gross Profit" value={formatRupiah(grossProfitSummary.grossProfit)} detail="Net Sales - Total Cost" tone="teal" />
          <ReportMetricCard label="Gross Margin" value={formatPercent(grossProfitSummary.grossMarginPercent)} detail="Margin terhadap Net Sales" />
        </>
      }
    >
      <div className="grid min-w-[1000px] grid-cols-[220px_180px_180px_minmax(260px,1fr)_64px] border-b-2 border-slate-300 bg-slate-100">
        <SheetHeaderCell label="Cost Category" />
        <SheetHeaderCell label="Actual Cost" align="right" />
        <SheetHeaderCell label="Adjustment" align="right" />
        <SheetHeaderCell label="Note" />
        <SheetHeaderCell label="" align="center" />
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid min-w-[1000px] grid-cols-[220px_180px_180px_minmax(260px,1fr)_64px] border-b border-slate-200/80 odd:bg-white even:bg-slate-50/50"
        >
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.category} onChange={(value) => onUpdateRow(row.id, { category: value })} placeholder="Food Ingredients" />
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput
              value={row.actualCost}
              onChange={(value) => onUpdateRow(row.id, { actualCost: value })}
              placeholder="0"
              align="right"
              inputMode="numeric"
            />
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput
              value={row.adjustment}
              onChange={(value) => onUpdateRow(row.id, { adjustment: value })}
              placeholder="0"
              align="right"
              inputMode="numeric"
            />
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.note} onChange={(value) => onUpdateRow(row.id, { note: value })} placeholder="Invoice / waste / correction" />
          </div>
          <div className="flex items-center justify-center px-3 py-2.5">
            <DeleteRowButton onClick={() => onRemoveRow(row.id)} disabled={rows.length <= 1} />
          </div>
        </div>
      ))}
      <div className="grid min-w-[1000px] grid-cols-[220px_180px_180px_minmax(260px,1fr)_64px] border-t-2 border-teal-600 bg-teal-50">
        <div className="border-r border-teal-200 px-4 py-3 text-sm font-extrabold text-teal-700">Total</div>
        <div className="border-r border-teal-200 px-4 py-3 text-right font-mono text-sm font-extrabold text-teal-700">
          {formatRupiah(grossProfitSummary.totalCost)}
        </div>
        <div className="border-r border-teal-200 px-4 py-3 text-right font-mono text-sm font-extrabold text-teal-700">
          {formatPercent(grossProfitSummary.foodCostPercent)}
        </div>
        <div className="px-4 py-3 text-xs font-semibold text-teal-700">Food cost ratio terhadap Net Sales</div>
        <div />
      </div>
    </ReportSheetSection>
  );
}

function ItemSalesReportSection({
  rows,
  summary,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}: {
  rows: ItemSalesRow[];
  summary: ItemSalesSummary;
  onUpdateRow: (id: string, patch: Partial<Omit<ItemSalesRow, "id">>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
}) {
  return (
    <ReportSheetSection
      kicker="Item Sales"
      title="Menu Movement Quantity"
      description="Input qty menu dari Moka untuk rekonsiliasi revenue dan basis pemotongan stok bahan baku."
      actionLabel="Tambah Menu"
      onAddRow={onAddRow}
      metrics={
        <>
          <ReportMetricCard label="Active Menu" value={formatNumber(summary.activeRows)} detail="Baris menu terisi" />
          <ReportMetricCard label="Total Qty" value={formatNumber(summary.totalQuantity)} detail="Total menu terjual" tone="teal" />
          <ReportMetricCard label="Menu Revenue" value={formatRupiah(summary.totalRevenue)} detail="Qty x harga input" />
          <ReportMetricCard label="Avg Revenue" value={formatRupiah(summary.totalQuantity > 0 ? summary.totalRevenue / summary.totalQuantity : 0)} detail="Revenue per item" />
        </>
      }
    >
      <div className="grid min-w-[1180px] grid-cols-[minmax(220px,1fr)_160px_130px_170px_170px_minmax(220px,1fr)_64px] border-b-2 border-slate-300 bg-slate-100">
        <SheetHeaderCell label="Menu" />
        <SheetHeaderCell label="Dept" />
        <SheetHeaderCell label="Qty" align="right" />
        <SheetHeaderCell label="Unit Price" align="right" />
        <SheetHeaderCell label="Revenue" align="right" />
        <SheetHeaderCell label="Note" />
        <SheetHeaderCell label="" align="center" />
      </div>
      {rows.map((row) => {
        const revenue = parseDecimal(row.quantity) * parseAmount(row.unitPrice);
        return (
          <div
            key={row.id}
            className="grid min-w-[1180px] grid-cols-[minmax(220px,1fr)_160px_130px_170px_170px_minmax(220px,1fr)_64px] border-b border-slate-200/80 odd:bg-white even:bg-slate-50/50"
          >
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetInput value={row.menuName} onChange={(value) => onUpdateRow(row.id, { menuName: value })} placeholder="Nama menu" />
            </div>
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetSelect
                value={row.department}
                onChange={(value) => onUpdateRow(row.id, { department: value })}
                options={["Bar", "Kitchen"]}
                placeholder="Dept"
              />
            </div>
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetInput value={row.quantity} onChange={(value) => onUpdateRow(row.id, { quantity: value })} placeholder="0" align="right" inputMode="decimal" />
            </div>
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetInput value={row.unitPrice} onChange={(value) => onUpdateRow(row.id, { unitPrice: value })} placeholder="0" align="right" inputMode="numeric" />
            </div>
            <div className="flex items-center justify-end border-r border-slate-200 px-4 py-2.5">
              <span className="font-mono text-sm font-bold text-slate-900">{formatRupiah(revenue)}</span>
            </div>
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetInput value={row.note} onChange={(value) => onUpdateRow(row.id, { note: value })} placeholder="Promo / void / bundle" />
            </div>
            <div className="flex items-center justify-center px-3 py-2.5">
              <DeleteRowButton onClick={() => onRemoveRow(row.id)} disabled={rows.length <= 1} />
            </div>
          </div>
        );
      })}
    </ReportSheetSection>
  );
}

function ServiceChargeReportSection({
  rows,
  summary,
  servicePool,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}: {
  rows: ServiceChargeSettlementRow[];
  summary: ServiceChargeSummary;
  servicePool: number;
  onUpdateRow: (id: string, patch: Partial<Omit<ServiceChargeStaffRow, "id">>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
}) {
  return (
    <ReportSheetSection
      kicker="Service Charge"
      title="Staff Gross Share & Net Settlement"
      description="Rekap pembagian service charge harian untuk tim berdasarkan point, koreksi, dan potongan."
      actionLabel="Tambah Staff"
      onAddRow={onAddRow}
      metrics={
        <>
          <ReportMetricCard label="Service Pool" value={formatRupiah(servicePool)} detail="Net service setelah loss" tone="teal" />
          <ReportMetricCard label="Total Point" value={formatNumber(summary.totalPoint)} detail="Basis pembagian" />
          <ReportMetricCard label="Adjustment" value={formatRupiah(summary.totalAdjustment)} detail="Koreksi settlement" tone="amber" />
          <ReportMetricCard label="Net Settlement" value={formatRupiah(summary.totalNetShare)} detail="Total diterima tim" />
        </>
      }
    >
      <div className="grid min-w-[1240px] grid-cols-[minmax(180px,1fr)_150px_110px_170px_170px_170px_minmax(220px,1fr)_64px] border-b-2 border-slate-300 bg-slate-100">
        <SheetHeaderCell label="Staff" />
        <SheetHeaderCell label="Role" />
        <SheetHeaderCell label="Point" align="right" />
        <SheetHeaderCell label="Gross Share" align="right" />
        <SheetHeaderCell label="Adjustment" align="right" />
        <SheetHeaderCell label="Net Share" align="right" />
        <SheetHeaderCell label="Note" />
        <SheetHeaderCell label="" align="center" />
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid min-w-[1240px] grid-cols-[minmax(180px,1fr)_150px_110px_170px_170px_170px_minmax(220px,1fr)_64px] border-b border-slate-200/80 odd:bg-white even:bg-slate-50/50"
        >
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.staffName} onChange={(value) => onUpdateRow(row.id, { staffName: value })} placeholder="Nama staff" />
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.role} onChange={(value) => onUpdateRow(row.id, { role: value })} placeholder="Bar / Kitchen" />
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.point} onChange={(value) => onUpdateRow(row.id, { point: value })} placeholder="0" align="right" inputMode="decimal" />
          </div>
          <div className="flex items-center justify-end border-r border-slate-200 px-4 py-2.5">
            <span className="font-mono text-sm font-bold text-slate-900">{formatRupiah(row.grossShare)}</span>
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.adjustment} onChange={(value) => onUpdateRow(row.id, { adjustment: value })} placeholder="0" align="right" inputMode="numeric" />
          </div>
          <div className="flex items-center justify-end border-r border-slate-200 px-4 py-2.5">
            <span className="font-mono text-sm font-extrabold text-teal-700">{formatRupiah(row.netShare)}</span>
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.note} onChange={(value) => onUpdateRow(row.id, { note: value })} placeholder="Kasbon / penalty / bonus" />
          </div>
          <div className="flex items-center justify-center px-3 py-2.5">
            <DeleteRowButton onClick={() => onRemoveRow(row.id)} disabled={rows.length <= 1} />
          </div>
        </div>
      ))}
    </ReportSheetSection>
  );
}

function OvertimeStaffReportSection({
  rows,
  summary,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}: {
  rows: OvertimeStaffRow[];
  summary: OvertimeSummary;
  onUpdateRow: (id: string, patch: Partial<Omit<OvertimeStaffRow, "id">>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
}) {
  return (
    <ReportSheetSection
      kicker="Overtime Staff"
      title="Daily Staff Overtime & DW Tracking"
      description="Pencatatan lembur staff dan daily worker dengan jam, rate, serta total pembayaran harian."
      actionLabel="Tambah Staff"
      onAddRow={onAddRow}
      metrics={
        <>
          <ReportMetricCard label="Active Staff" value={formatNumber(summary.activeRows)} detail="Baris staff terisi" />
          <ReportMetricCard label="Total Hours" value={formatNumber(summary.totalHours)} detail="Jam lembur/DW" tone="teal" />
          <ReportMetricCard label="Total Pay" value={formatRupiah(summary.totalPay)} detail="Hours x rate" />
          <ReportMetricCard label="Avg Pay" value={formatRupiah(summary.activeRows > 0 ? summary.totalPay / summary.activeRows : 0)} detail="Rata-rata per orang" />
        </>
      }
    >
      <div className="grid min-w-[1220px] grid-cols-[minmax(180px,1fr)_150px_150px_110px_170px_170px_minmax(220px,1fr)_64px] border-b-2 border-slate-300 bg-slate-100">
        <SheetHeaderCell label="Staff" />
        <SheetHeaderCell label="Role" />
        <SheetHeaderCell label="Type" />
        <SheetHeaderCell label="Hours" align="right" />
        <SheetHeaderCell label="Rate" align="right" />
        <SheetHeaderCell label="Total" align="right" />
        <SheetHeaderCell label="Note" />
        <SheetHeaderCell label="" align="center" />
      </div>
      {rows.map((row) => {
        const total = parseDecimal(row.hours) * parseAmount(row.rate);
        return (
          <div
            key={row.id}
            className="grid min-w-[1220px] grid-cols-[minmax(180px,1fr)_150px_150px_110px_170px_170px_minmax(220px,1fr)_64px] border-b border-slate-200/80 odd:bg-white even:bg-slate-50/50"
          >
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetInput value={row.staffName} onChange={(value) => onUpdateRow(row.id, { staffName: value })} placeholder="Nama staff" />
            </div>
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetInput value={row.role} onChange={(value) => onUpdateRow(row.id, { role: value })} placeholder="Role" />
            </div>
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetSelect
                value={row.staffType}
                onChange={(value) => onUpdateRow(row.id, { staffType: value })}
                options={["Staff", "Daily Worker"]}
                placeholder="Type"
              />
            </div>
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetInput value={row.hours} onChange={(value) => onUpdateRow(row.id, { hours: value })} placeholder="0" align="right" inputMode="decimal" />
            </div>
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetInput value={row.rate} onChange={(value) => onUpdateRow(row.id, { rate: value })} placeholder="0" align="right" inputMode="numeric" />
            </div>
            <div className="flex items-center justify-end border-r border-slate-200 px-4 py-2.5">
              <span className="font-mono text-sm font-bold text-slate-900">{formatRupiah(total)}</span>
            </div>
            <div className="border-r border-slate-200 px-4 py-2.5">
              <SheetInput value={row.note} onChange={(value) => onUpdateRow(row.id, { note: value })} placeholder="Shift / event / backup" />
            </div>
            <div className="flex items-center justify-center px-3 py-2.5">
              <DeleteRowButton onClick={() => onRemoveRow(row.id)} disabled={rows.length <= 1} />
            </div>
          </div>
        );
      })}
    </ReportSheetSection>
  );
}

function ComplaintCaseReportSection({
  rows,
  summary,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
}: {
  rows: ComplaintCaseRow[];
  summary: ComplaintSummary;
  onUpdateRow: (id: string, patch: Partial<Omit<ComplaintCaseRow, "id">>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
}) {
  return (
    <ReportSheetSection
      kicker="Complaint & Case"
      title="Real-Time Guest Feedback & Issues"
      description="Log kasus, keluhan pelanggan, dan catatan insiden outlet untuk kontrol follow-up harian."
      actionLabel="Tambah Case"
      onAddRow={onAddRow}
      metrics={
        <>
          <ReportMetricCard label="Total Case" value={formatNumber(summary.totalCases)} detail="Kasus terisi" />
          <ReportMetricCard label="Open Case" value={formatNumber(summary.openCases)} detail="Belum resolved" tone="amber" />
          <ReportMetricCard label="High Severity" value={formatNumber(summary.highSeverityCases)} detail="High/Critical" tone="red" />
          <ReportMetricCard label="Resolved" value={formatNumber(summary.totalCases - summary.openCases)} detail="Closed/Resolved" tone="teal" />
        </>
      }
    >
      <div className="grid min-w-[1120px] grid-cols-[110px_130px_minmax(240px,1fr)_150px_140px_minmax(260px,1fr)_64px] border-b-2 border-slate-300 bg-slate-100">
        <SheetHeaderCell label="Time" />
        <SheetHeaderCell label="Severity" />
        <SheetHeaderCell label="Case" />
        <SheetHeaderCell label="Owner" />
        <SheetHeaderCell label="Status" />
        <SheetHeaderCell label="Action" />
        <SheetHeaderCell label="" align="center" />
      </div>
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid min-w-[1120px] grid-cols-[110px_130px_minmax(240px,1fr)_150px_140px_minmax(260px,1fr)_64px] border-b border-slate-200/80 odd:bg-white even:bg-slate-50/50"
        >
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.time} onChange={(value) => onUpdateRow(row.id, { time: value })} placeholder="14:30" />
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetSelect
              value={row.severity}
              onChange={(value) => onUpdateRow(row.id, { severity: value })}
              options={["Low", "Medium", "High", "Critical"]}
              placeholder="Severity"
            />
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.caseTitle} onChange={(value) => onUpdateRow(row.id, { caseTitle: value })} placeholder="Keluhan / insiden" />
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.owner} onChange={(value) => onUpdateRow(row.id, { owner: value })} placeholder="PIC" />
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetSelect
              value={row.status}
              onChange={(value) => onUpdateRow(row.id, { status: value })}
              options={["Open", "In Progress", "Resolved", "Closed"]}
              placeholder="Status"
            />
          </div>
          <div className="border-r border-slate-200 px-4 py-2.5">
            <SheetInput value={row.action} onChange={(value) => onUpdateRow(row.id, { action: value })} placeholder="Follow-up / kompensasi / catatan" />
          </div>
          <div className="flex items-center justify-center px-3 py-2.5">
            <DeleteRowButton onClick={() => onRemoveRow(row.id)} disabled={rows.length <= 1} />
          </div>
        </div>
      ))}
    </ReportSheetSection>
  );
}

function ReportsContent() {
  const [outlet, setOutlet] = useState(OUTLET_OPTIONS[0]);
  const [businessDate, setBusinessDate] = useState(getTodayIso);
  const [activeTab, setActiveTab] = useState<ReportTabId>("sales-summary");
  const [draft, setDraft] = useState<SalesSummaryDraft>(getDefaultReportDraft);
  const [ready, setReady] = useState(false);
  const [loadedKey, setLoadedKey] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (isReportTabId(tab)) setActiveTab(tab);
  }, []);

  useEffect(() => {
    const nextKey = getStorageKey(outlet, businessDate);
    setDraft(loadStoredDraft(outlet, businessDate));
    setLoadedKey(nextKey);
    setReady(true);
  }, [businessDate, outlet]);

  useEffect(() => {
    const currentKey = getStorageKey(outlet, businessDate);
    if (!ready) return;
    if (loadedKey !== currentKey) return;
    saveStoredDraft(outlet, businessDate, draft);
  }, [businessDate, draft, loadedKey, outlet, ready]);

  const summary = useMemo(() => calculateSummary(draft), [draft]);
  const settlementRows = useMemo(() => calculateDepartmentSettlementRows(draft, summary), [draft, summary]);
  const grossProfitSummary = useMemo(() => calculateGrossProfitSummary(draft.grossProfitRows, summary), [draft.grossProfitRows, summary]);
  const itemSalesSummary = useMemo(() => calculateItemSalesSummary(draft.itemSalesRows), [draft.itemSalesRows]);
  const serviceChargeSettlement = useMemo(
    () => calculateServiceChargeSettlementRows(draft.serviceChargeRows, summary),
    [draft.serviceChargeRows, summary]
  );
  const overtimeSummary = useMemo(() => calculateOvertimeSummary(draft.overtimeRows), [draft.overtimeRows]);
  const complaintSummary = useMemo(() => calculateComplaintSummary(draft.complaintRows), [draft.complaintRows]);
  const activeReport = REPORT_NAV_ITEMS.find((item) => item.id === activeTab) ?? REPORT_NAV_ITEMS[0];

  const setField = (field: ReportField, value: string) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
      ...(field === "gratuityAmount" ? { gratuityAuto: false } : {}),
      ...(field === "taxAmount" ? { taxAuto: false } : {}),
      updatedAt: new Date().toISOString(),
    }));
  };

  const setAutoField = (field: "gratuityAuto" | "taxAuto", value: boolean) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateDepartmentSettlement = (
    department: ReportDepartment,
    patch: Partial<Omit<DepartmentSettlementDraft, "department">>
  ) => {
    setDraft((current) => ({
      ...current,
      departmentSettlements: normalizeDepartmentSettlements(current.departmentSettlements).map((row) =>
        row.department === department ? { ...row, ...patch } : row
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const updateGrossProfitRow = (id: string, patch: Partial<Omit<GrossProfitCostRow, "id">>) => {
    setDraft((current) => ({
      ...current,
      grossProfitRows: normalizeGrossProfitRows(current.grossProfitRows).map((row) => (row.id === id ? { ...row, ...patch } : row)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const addGrossProfitRow = () => {
    setDraft((current) => ({
      ...current,
      grossProfitRows: [
        ...normalizeGrossProfitRows(current.grossProfitRows),
        { id: createRowId("gross-profit"), category: "", actualCost: "", adjustment: "", note: "" },
      ],
      updatedAt: new Date().toISOString(),
    }));
  };

  const removeGrossProfitRow = (id: string) => {
    setDraft((current) => {
      const rows = normalizeGrossProfitRows(current.grossProfitRows);
      return {
        ...current,
        grossProfitRows: rows.length > 1 ? rows.filter((row) => row.id !== id) : rows,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const updateItemSalesRow = (id: string, patch: Partial<Omit<ItemSalesRow, "id">>) => {
    setDraft((current) => ({
      ...current,
      itemSalesRows: normalizeItemSalesRows(current.itemSalesRows).map((row) => (row.id === id ? { ...row, ...patch } : row)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const addItemSalesRow = () => {
    setDraft((current) => ({
      ...current,
      itemSalesRows: [
        ...normalizeItemSalesRows(current.itemSalesRows),
        { id: createRowId("item-sales"), menuName: "", department: "", quantity: "", unitPrice: "", note: "" },
      ],
      updatedAt: new Date().toISOString(),
    }));
  };

  const removeItemSalesRow = (id: string) => {
    setDraft((current) => {
      const rows = normalizeItemSalesRows(current.itemSalesRows);
      return {
        ...current,
        itemSalesRows: rows.length > 1 ? rows.filter((row) => row.id !== id) : rows,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const updateServiceChargeRow = (id: string, patch: Partial<Omit<ServiceChargeStaffRow, "id">>) => {
    setDraft((current) => ({
      ...current,
      serviceChargeRows: normalizeServiceChargeRows(current.serviceChargeRows).map((row) => (row.id === id ? { ...row, ...patch } : row)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const addServiceChargeRow = () => {
    setDraft((current) => ({
      ...current,
      serviceChargeRows: [
        ...normalizeServiceChargeRows(current.serviceChargeRows),
        { id: createRowId("service-staff"), staffName: "", role: "", point: "", adjustment: "", note: "" },
      ],
      updatedAt: new Date().toISOString(),
    }));
  };

  const removeServiceChargeRow = (id: string) => {
    setDraft((current) => {
      const rows = normalizeServiceChargeRows(current.serviceChargeRows);
      return {
        ...current,
        serviceChargeRows: rows.length > 1 ? rows.filter((row) => row.id !== id) : rows,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const updateOvertimeRow = (id: string, patch: Partial<Omit<OvertimeStaffRow, "id">>) => {
    setDraft((current) => ({
      ...current,
      overtimeRows: normalizeOvertimeRows(current.overtimeRows).map((row) => (row.id === id ? { ...row, ...patch } : row)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const addOvertimeRow = () => {
    setDraft((current) => ({
      ...current,
      overtimeRows: [
        ...normalizeOvertimeRows(current.overtimeRows),
        { id: createRowId("overtime"), staffName: "", role: "", staffType: "", hours: "", rate: "", note: "" },
      ],
      updatedAt: new Date().toISOString(),
    }));
  };

  const removeOvertimeRow = (id: string) => {
    setDraft((current) => {
      const rows = normalizeOvertimeRows(current.overtimeRows);
      return {
        ...current,
        overtimeRows: rows.length > 1 ? rows.filter((row) => row.id !== id) : rows,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const updateComplaintRow = (id: string, patch: Partial<Omit<ComplaintCaseRow, "id">>) => {
    setDraft((current) => ({
      ...current,
      complaintRows: normalizeComplaintRows(current.complaintRows).map((row) => (row.id === id ? { ...row, ...patch } : row)),
      updatedAt: new Date().toISOString(),
    }));
  };

  const addComplaintRow = () => {
    setDraft((current) => ({
      ...current,
      complaintRows: [
        ...normalizeComplaintRows(current.complaintRows),
        { id: createRowId("case"), time: "", severity: "", caseTitle: "", owner: "", status: "", action: "" },
      ],
      updatedAt: new Date().toISOString(),
    }));
  };

  const removeComplaintRow = (id: string) => {
    setDraft((current) => {
      const rows = normalizeComplaintRows(current.complaintRows);
      return {
        ...current,
        complaintRows: rows.length > 1 ? rows.filter((row) => row.id !== id) : rows,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const resetDraft = () => {
    setDraft({
      ...getDefaultReportDraft(),
      updatedAt: new Date().toISOString(),
    });
  };

  const exportCurrentReport = () => {
    const csv = buildActiveReportCsv(activeTab, outlet, businessDate, draft, summary);
    const reportSlug = activeReport.label.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and");
    downloadCsv(`artha-${reportSlug}-${outlet.toLowerCase().replaceAll(" ", "-")}-${businessDate}.csv`, csv);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid w-full max-w-[1600px] grid-cols-1 gap-6 p-6 lg:grid-cols-12 lg:items-start">
        <ReportsNavigationPanel activeTab={activeTab} onChangeTab={setActiveTab} />

        <section className="min-w-0 space-y-6 lg:col-span-9">
          <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
                  <ReceiptText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Link
                      href="/admin/master-data"
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Admin
                    </Link>
                    <span className="rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                      LocalStorage Sync
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">{activeReport.label}</h1>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    {activeReport.description}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <span className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                  <Save className="h-3.5 w-3.5 text-teal-700" />
                  {formatUpdatedAt(draft.updatedAt)}
                </span>

                <label className="relative">
                  <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <select
                    value={outlet}
                    onChange={(event) => setOutlet(event.target.value)}
                    className="min-h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-100 sm:w-40"
                  >
                    {OUTLET_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input
                    type="date"
                    value={businessDate}
                    onChange={(event) => setBusinessDate(event.target.value || getTodayIso())}
                    className="min-h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-1 focus:ring-teal-100 sm:w-44"
                  />
                </label>

                <button
                  type="button"
                  onClick={resetDraft}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </button>

                <button
                  type="button"
                  onClick={exportCurrentReport}
                  className="inline-flex min-h-10 items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-1.5 text-sm font-medium rounded-lg shadow-sm transition-all active:scale-[0.98]"
                >
                  <Download className="h-4 w-4" />
                  Export
                </button>
              </div>
            </div>
          </header>

          {activeTab === "sales-summary" ? (
          <section className="bg-white border border-slate-300 rounded-lg overflow-hidden shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-300 bg-white px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Sales Summary</p>
                <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
                  {outlet} · {formatDateDisplay(businessDate)}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">Spreadsheet input manual Moka POS dengan kalkulasi Artha.</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex min-h-9 items-center gap-2 rounded border border-teal-200 bg-teal-50 px-3 text-xs font-semibold text-teal-700">
                  Total Collected: {formatRupiah(summary.totalCollected)}
                </span>
                <span className="inline-flex min-h-9 items-center gap-2 rounded border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                  Net Service: {formatRupiah(summary.netServiceAfterLoss)}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-thin">
              <SpreadsheetHeader />
              <SpreadsheetInputRow
                label="Gross Sales"
                detail="Input manual omzet kotor dari Moka POS."
                value={draft.grossSales}
                onChange={(value) => setField("grossSales", value)}
              />
              <SpreadsheetInputRow
                label="Discounts"
                detail="Input manual total diskon transaksi."
                value={draft.discounts}
                onChange={(value) => setField("discounts", value)}
              />
              <SpreadsheetInputRow
                label="Refunds"
                detail="Input manual refund / void yang mengurangi sales."
                value={draft.refunds}
                onChange={(value) => setField("refunds", value)}
              />

              <SpreadsheetCalculatedRow
                label="Net Sales"
                detail="Formula: Gross Sales - Discounts - Refunds."
                value={summary.netSales}
              />

              <SpreadsheetInputRow
                label="Gratuity (Service Charge)"
                detail="Input nominal service atau gunakan persentase otomatis dari Net Sales."
                value={currencyInputValue(draft.gratuityAmount, summary.gratuityAmount)}
                onChange={(value) => setField("gratuityAmount", value)}
              >
                <PercentControl
                  label="Service"
                  value={draft.gratuityPercent}
                  active={draft.gratuityAuto}
                  onPercentChange={(value) => {
                    setField("gratuityPercent", value);
                    setAutoField("gratuityAuto", true);
                  }}
                  onToggleAuto={() => setAutoField("gratuityAuto", !draft.gratuityAuto)}
                />
              </SpreadsheetInputRow>

              <SpreadsheetInputRow
                label="Tax"
                detail="Input nominal tax atau gunakan formula otomatis dari Net Sales + Service."
                value={currencyInputValue(draft.taxAmount, summary.taxAmount)}
                onChange={(value) => setField("taxAmount", value)}
              >
                <PercentControl
                  label="Tax"
                  value={draft.taxPercent}
                  active={draft.taxAuto}
                  onPercentChange={(value) => {
                    setField("taxPercent", value);
                    setAutoField("taxAuto", true);
                  }}
                  onToggleAuto={() => setAutoField("taxAuto", !draft.taxAuto)}
                />
              </SpreadsheetInputRow>

              <SpreadsheetInputRow
                label="Rounding"
                detail="Input manual pembulatan dari mesin kasir atau settlement."
                value={draft.rounding}
                onChange={(value) => setField("rounding", value)}
              />

              <SpreadsheetCalculatedRow
                label="Total Collected"
                detail="Formula: Net Sales + Gratuity + Tax + Rounding."
                value={summary.totalCollected}
                grand
              />

              <ServiceSettlementSection
                settlementRows={settlementRows}
                totalLossDeduction={summary.totalLossDeduction}
                netServiceAfterLoss={summary.netServiceAfterLoss}
                onChangeDepartment={updateDepartmentSettlement}
              />
            </div>
          </section>
          ) : null}

          {activeTab === "gross-profit" ? (
            <GrossProfitReportSection
              rows={draft.grossProfitRows}
              financialSummary={summary}
              grossProfitSummary={grossProfitSummary}
              onUpdateRow={updateGrossProfitRow}
              onAddRow={addGrossProfitRow}
              onRemoveRow={removeGrossProfitRow}
            />
          ) : null}

          {activeTab === "item-sales" ? (
            <ItemSalesReportSection
              rows={draft.itemSalesRows}
              summary={itemSalesSummary}
              onUpdateRow={updateItemSalesRow}
              onAddRow={addItemSalesRow}
              onRemoveRow={removeItemSalesRow}
            />
          ) : null}

          {activeTab === "service-charge" ? (
            <ServiceChargeReportSection
              rows={serviceChargeSettlement.rows}
              summary={serviceChargeSettlement.summary}
              servicePool={summary.netServiceAfterLoss}
              onUpdateRow={updateServiceChargeRow}
              onAddRow={addServiceChargeRow}
              onRemoveRow={removeServiceChargeRow}
            />
          ) : null}

          {activeTab === "overtime-staff" ? (
            <OvertimeStaffReportSection
              rows={draft.overtimeRows}
              summary={overtimeSummary}
              onUpdateRow={updateOvertimeRow}
              onAddRow={addOvertimeRow}
              onRemoveRow={removeOvertimeRow}
            />
          ) : null}

          {activeTab === "complaint-case" ? (
            <ComplaintCaseReportSection
              rows={draft.complaintRows}
              summary={complaintSummary}
              onUpdateRow={updateComplaintRow}
              onAddRow={addComplaintRow}
              onRemoveRow={removeComplaintRow}
            />
          ) : null}
        </section>
      </div>
    </main>
  );
}

export default function ReportsDashboardPage() {
  return (
    <ProtectedRoute allowedRoles={REPORT_ROLES}>
      <ReportsContent />
    </ProtectedRoute>
  );
}
