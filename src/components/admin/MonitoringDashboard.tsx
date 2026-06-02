"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Download,
  Loader2,
  Lock,
  Package,
  RefreshCw,
  Search,
  Send,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
import type {
  Department,
  IngredientRow,
  DemandEventRow,
  MenuCategory,
  MenuItemRow,
  RecipeLineForCalc,
  StockLedgerRow,
  WorksheetEditRequestRow,
  SupplierIngredientPriceRow,
  SupplierRow,
} from "@/lib/types/database";
import {
  SUPPLIER_WHATSAPP_NOT_CONFIGURED_MSG,
  isSupplierWhatsAppPhoneConfigured,
  normalizeWhatsAppPhoneNumber,
} from "@/lib/purchase-order/whatsapp";
import { formatBusinessDateLabel, resolveBusinessDate } from "@/lib/utils/dateHelper";
import { MenuMovementPanel } from "@/components/admin/MenuMovementPanel";
import { OpnameApprovalPanel } from "@/components/admin/OpnameApprovalPanel";
import { StockAdjustmentPanel } from "@/components/admin/StockAdjustmentPanel";

const WIB_TIMEZONE = "Asia/Jakarta";
const SPILLAGE_RATIO_THRESHOLD = 0.15;
const RUNWAY_HISTORY_DAYS = 7;
const DEMAND_SCENARIO_MULTIPLIER: Record<DemandScenario, number> = {
  normal: 1,
  weekend_holiday: 1.5,
  promo_kol: 2,
};

const DEMAND_SCENARIO_LABEL: Record<DemandScenario, string> = {
  normal: "Normal",
  weekend_holiday: "Weekend / Libur",
  promo_kol: "Promo / KOL",
};

type StockLedgerExportRow = {
  business_date: string;
  ingredient_id: string;
  ingredient_name: string;
  department: Department;
  unit: string;
  opening_stock: number;
  in_qty: number;
  theoretical_usage: number;
  adjustment_qty: number;
  closing_stock: number;
  current_stock: number;
  minimum_stock: number;
  primary_supplier_id: string | null;
  primary_supplier_name: string;
  variance_qty: number;
  Catatan_Out_Stock: string;
  Foto_Out_Stock: string;
  Bukti_Foto_Excel: string;
};

type InventorySummaryRow = {
  ingredient_id: string;
  ingredient_name: string;
  department: Department;
  unit: string;
  current_stock: number;
  live_stock: number;
  live_delta: number;
  minimum_stock: number;
  stock_status: "LOW STOCK" | "OK";
  primary_supplier_name: string;
};

type LiveStockRow = {
  ingredientId: string;
  ingredientName: string;
  department: Department;
  unit: string;
  officialStock: number;
  receiveQty: number;
  premixOutputQty: number;
  premixUsageQty: number;
  menuUsageQty: number;
  issueUsageQty: number;
  outQty: number;
  opnameQty: number | null;
  liveStock: number;
  liveDelta: number;
  minimumStock: number;
  status: "LOW STOCK" | "OK";
  sourceCount: number;
};

type SalesExportRow = {
  session_date: string;
  menu_name: string;
  category: MenuCategory;
  quantity_sold: number;
  unit_price: number;
  total_gross_revenue: number;
};

type SoldLineJoined = {
  quantity_sold: number;
  menu_item: Pick<MenuItemRow, "id" | "menu_name" | "department" | "price">;
  worksheet_session: { business_date: string; department: Department };
};

type OutLineJoined = {
  ingredient_id: string;
  quantity: number;
  note: string;
  photo_url: string | null;
  worksheet_session: { business_date: string; department: Department };
};

type ReceiveAuditJoined = {
  id: string;
  ingredient_id: string;
  staff_id: string | null;
  quantity: number;
  created_at: string;
  ingredient:
    | Pick<IngredientRow, "id" | "name" | "unit" | "purchase_unit">
    | Pick<IngredientRow, "id" | "name" | "unit" | "purchase_unit">[]
    | null;
  staff: { name: string } | { name: string }[] | null;
  worksheet_session:
    | { business_date: string; department: Department }
    | { business_date: string; department: Department }[]
    | null;
};

type ReceiveAuditRow = {
  id: string;
  businessDate: string;
  department: Department;
  ingredientName: string;
  quantity: number;
  unit: string;
  staffName: string;
  createdAt: string;
};

type TopSellingEntry = {
  menu_name: string;
  quantity_sold: number;
  sharePercent: number;
};

type LedgerTableRow = StockLedgerExportRow & {
  spillageAlert: boolean;
  outStockNote: string;
  isLowStock: boolean;
};

type RunwayEntry = {
  ingredientName: string;
  unit: string;
  currentStock: number;
  averageDailyUsage: number;
  daysRemaining: number;
  urgency: "safe" | "warning" | "critical";
};

type DemandScenario = "normal" | "weekend_holiday" | "promo_kol";

type SalesDemandRow = {
  ingredientId: string;
  ingredientName: string;
  department: Department;
  unit: string;
  currentStock: number;
  minimumStock: number;
  dailyUsage: Record<string, number>;
  totalUsage: number;
  averageDailyUsage: number;
  peakDailyUsage: number;
  recommendedOrderQty: number;
  supplierName: string;
};

type CogsAlert = {
  ingredientName: string;
  previousPrice: number;
  currentPrice: number;
  changePercent: number;
};

type PoLineDraft = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: string;
  unitPrice: number;
};

type SupplierPriceCatalog = SupplierIngredientPriceRow & {
  ingredient: Pick<IngredientRow, "id" | "name" | "unit" | "department">;
};

type SupplierPriceJoinRow = SupplierIngredientPriceRow & {
  ingredient:
    | Pick<IngredientRow, "id" | "name" | "unit" | "department">
    | Pick<IngredientRow, "id" | "name" | "unit" | "department">[]
    | null;
};

type SupplierPriceCogsJoinRow = {
  ingredient_id: string;
  supplier_id: string;
  unit_price: number;
  valid_from: string;
  ingredient: { name: string } | { name: string }[] | null;
  supplier: { id: string; name: string; phone_number: string | null } | { id: string; name: string; phone_number: string | null }[] | null;
};

type PrimarySupplierAssignment = {
  supplierId: string;
  supplierName: string;
  phoneNumber: string | null;
  unitPrice: number;
};

type LowStockOrderLine = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  quantity: number;
  currentStock: number;
  minimumStock: number;
};

type LowStockOrderGroup = {
  supplierId: string;
  supplierName: string;
  phoneNumber: string | null;
  lines: LowStockOrderLine[];
};

type SupplierPoCard = {
  supplier: SupplierRow;
  orderGroup: LowStockOrderGroup | null;
  lineCount: number;
};

type LowStockInventoryRow = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  primarySupplierId: string | null;
  primarySupplierName: string;
  primarySupplierPhone: string | null;
};

type MenuIssueJoined = {
  id: string;
  menu_item_id: string;
  quantity: number;
  reason: string;
  note: string;
  photo_url: string | null;
  created_at: string;
  menu_item:
    | Pick<MenuItemRow, "id" | "menu_name" | "department" | "price">
    | Pick<MenuItemRow, "id" | "menu_name" | "department" | "price">[]
    | null;
  worksheet_session:
    | { business_date: string; department: Department }
    | { business_date: string; department: Department }[]
    | null;
};

type MenuIssueReportRow = {
  id: string;
  businessDate: string;
  department: Department;
  menuName: string;
  quantity: number;
  reason: string;
  reasonLabel: string;
  note: string;
  photoUrl: string;
  createdAt: string;
};

type WorksheetEditRequestJoined = WorksheetEditRequestRow & {
  staff: { name: string } | { name: string }[] | null;
  worksheet_session:
    | { status: string; submitted_at: string | null }
    | { status: string; submitted_at: string | null }[]
    | null;
};

type WorksheetEditRequestReportRow = WorksheetEditRequestRow & {
  staffName: string;
  sessionStatus: string;
};

type DemandEventReportRow = DemandEventRow & {
  baselineQty: number;
  eventQty: number;
  actualUpliftPct: number | null;
  effectiveness: "pending" | "effective" | "underperform" | "neutral";
};

type DemandEventForm = {
  title: string;
  eventType: string;
  department: "" | Department;
  startDate: string;
  endDate: string;
  expectedUpliftPct: string;
  notes: string;
};

type PublicHolidayApiRow = {
  date: string;
  localName?: string;
  name?: string;
};

type WorksheetSessionMonitorRow = {
  id: string;
  business_date: string;
  department: Department;
  status: string | null;
};

type PremixRecipeRow = {
  id: string;
  yield_quantity: number;
};

type PremixComponentRow = {
  recipe_id: string;
  ingredient_id: string;
  qty_per_batch: number;
};

type MonitoringTabId = "overview" | "demand" | "inventory" | "sales" | "control" | "export";

const MONITORING_TABS: { id: MonitoringTabId; label: string; icon: typeof Package }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "demand", label: "Demand & Order", icon: ShoppingCart },
  { id: "inventory", label: "Inventory", icon: Package },
  { id: "sales", label: "Sales", icon: TrendingUp },
  { id: "control", label: "Control", icon: AlertTriangle },
  { id: "export", label: "Export", icon: Download },
];

const MENU_ISSUE_REASON_LABEL: Record<string, string> = {
  too_salty: "Terlalu asin",
  undercooked: "Kurang matang",
  burnt: "Gosong",
  hair: "Ada rambut",
  wrong_order: "Salah order",
  spilled: "Jatuh / tumpah",
  guest_complaint: "Complaint tamu",
  staff_error: "Staff error",
  other: "Lainnya",
};

const DEMAND_EVENT_TYPE_LABEL: Record<string, string> = {
  promo: "Promo",
  kol: "KOL",
  national_holiday: "Libur Nasional",
  private_event: "Private Event",
  school_holiday: "Libur Sekolah",
  other: "Lainnya",
};

const FINAL_WORKSHEET_STATUSES = new Set(["SUBMITTED", "ADJUSTED", "LOCKED", "PENDING_APPROVAL_ADMIN"]);

type IngredientWithPrimarySupplier = IngredientRow & {
  supplier?: { id: string; name: string; phone_number: string | null } | null;
};

function departmentToCategory(department: Department): MenuCategory {
  return department === "bar" ? "beverage" : "food";
}

function computeTheoreticalTarget(ledger: Pick<StockLedgerRow, "opening_stock" | "in_qty" | "theoretical_usage">): number {
  return Number(ledger.opening_stock) + Number(ledger.in_qty) - Number(ledger.theoretical_usage);
}

function computeVarianceQty(ledger: StockLedgerRow): number {
  return Number(ledger.closing_stock) - computeTheoreticalTarget(ledger);
}

function isSpillageExceeded(ledger: StockLedgerRow): boolean {
  const wasteQty = Number(ledger.adjustment_qty);
  if (wasteQty >= 0) return false;
  const theoretical = Number(ledger.theoretical_usage);
  const absWaste = Math.abs(wasteQty);
  const threshold = Math.max(theoretical * SPILLAGE_RATIO_THRESHOLD, 1);
  return absWaste > threshold;
}

function getWibWeekdayIndex(now: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: WIB_TIMEZONE,
    weekday: "short",
  }).format(now);

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[weekday] ?? 0;
}

/** Jumat, Sabtu, Minggu (setelah Kamis 23:59 WIB) — PO baru dikunci. */
function isThursdayLastOrderClosed(now: Date = new Date()): boolean {
  const day = getWibWeekdayIndex(now);
  return day === 5 || day === 6 || day === 0;
}

function escapeCsvField(value: string | number): string {
  const raw = String(value);
  if (raw.includes(",") || raw.includes('"') || raw.includes("\n")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function rowsToCsv<T extends Record<string, string | number | null>>(rows: T[], columns: (keyof T)[]): string {
  const header = columns.map((col) => escapeCsvField(String(col))).join(",");
  const body = rows
    .map((row) => columns.map((col) => escapeCsvField(row[col] ?? "")).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

function firstCsvUrl(value: string): string {
  return value
    .split(";")
    .map((url) => url.trim())
    .find(Boolean) ?? "";
}

function addToNumericMap(map: Map<string, number>, key: string, value: number): void {
  if (!Number.isFinite(value) || value === 0) return;
  map.set(key, (map.get(key) ?? 0) + value);
}

function receiveQtyToStockUnit(
  ingredient: Pick<IngredientRow, "purchase_to_stock_factor"> | undefined,
  quantity: number
): number {
  const factor = Number(ingredient?.purchase_to_stock_factor ?? 1);
  return quantity * (Number.isFinite(factor) && factor > 0 ? factor : 1);
}

function excelHyperlinkFormula(url: string): string {
  if (!url) return "";
  const safeUrl = url.replace(/"/g, '""');
  return `=HYPERLINK("${safeUrl}","Lihat Foto")`;
}

function downloadCsvFile(filename: string, csvContent: string): void {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function downloadHtmlExcelFile(filename: string, htmlContent: string): void {
  const blob = new Blob([`\uFEFF${htmlContent}`], {
    type: "application/vnd.ms-excel;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function buildStockEvidenceExcelHtml(rows: StockLedgerExportRow[]): string {
  const bodyRows = rows
    .flatMap((row) => {
      const photoUrls = row.Foto_Out_Stock.split(";")
        .map((url) => url.trim())
        .filter(Boolean);
      if (photoUrls.length === 0) {
        return [
          `
          <tr>
            <td>${escapeHtml(row.business_date)}</td>
            <td>${escapeHtml(row.ingredient_name)}</td>
            <td>${escapeHtml(row.department)}</td>
            <td>${escapeHtml(row.unit)}</td>
            <td>${escapeHtml(row.adjustment_qty)}</td>
            <td>${escapeHtml(row.Catatan_Out_Stock)}</td>
            <td></td>
          </tr>`,
        ];
      }

      return photoUrls.map(
        (url, index) => `
          <tr>
            <td>${escapeHtml(row.business_date)}</td>
            <td>${escapeHtml(row.ingredient_name)}</td>
            <td>${escapeHtml(row.department)}</td>
            <td>${escapeHtml(row.unit)}</td>
            <td>${escapeHtml(row.adjustment_qty)}</td>
            <td>${escapeHtml(row.Catatan_Out_Stock)}</td>
            <td>
              <img src="${escapeHtml(url)}" width="120" height="120" alt="Bukti ${escapeHtml(
                row.ingredient_name
              )} ${index + 1}" />
            </td>
          </tr>`
      );
    })
    .join("");

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 12px; }
          th, td { border: 1px solid #999; padding: 8px; vertical-align: top; }
          th { background: #111827; color: #fff; }
          img { object-fit: cover; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              <th>Tanggal</th>
              <th>Bahan</th>
              <th>Dept</th>
              <th>Unit</th>
              <th>Adjustment</th>
              <th>Catatan Out Stock</th>
              <th>Foto Bukti</th>
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </body>
    </html>`;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(blob);
  });
}

function resolveExcelImageExtension(contentType: string): "jpeg" | "png" | "gif" {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("gif")) return "gif";
  return "jpeg";
}

async function downloadInventoryXlsx(filename: string, rows: StockLedgerExportRow[]): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Inventory Ledger");

  sheet.columns = [
    { header: "Tanggal", key: "date", width: 14 },
    { header: "Bahan", key: "ingredient", width: 28 },
    { header: "Dept", key: "department", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Opening", key: "opening", width: 14 },
    { header: "Receive", key: "receive", width: 14 },
    { header: "Menu Usage", key: "usage", width: 14 },
    { header: "Adjustment", key: "adjustment", width: 14 },
    { header: "Closing", key: "closing", width: 14 },
    { header: "Variance", key: "variance", width: 14 },
    { header: "Min Stock", key: "minimum", width: 14 },
    { header: "Supplier", key: "supplier", width: 22 },
    { header: "Catatan Out Stock", key: "note", width: 36 },
    { header: "Foto Bukti", key: "photo", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111827" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const ledger of rows) {
    const photoUrls = ledger.Foto_Out_Stock.split(";")
      .map((url) => url.trim())
      .filter(Boolean);
    const rowPhotoUrls = photoUrls.length > 0 ? photoUrls : [""];

    for (const photoUrl of rowPhotoUrls) {
      const excelRow = sheet.addRow({
        date: ledger.business_date,
        ingredient: ledger.ingredient_name,
        department: ledger.department,
        unit: ledger.unit,
        opening: ledger.opening_stock,
        receive: ledger.in_qty,
        usage: ledger.theoretical_usage,
        adjustment: ledger.adjustment_qty,
        closing: ledger.closing_stock,
        variance: ledger.variance_qty,
        minimum: ledger.minimum_stock,
        supplier: ledger.primary_supplier_name || "Belum ada",
        note: ledger.Catatan_Out_Stock,
        photo: photoUrl ? "" : "Tidak ada foto",
      });
      excelRow.height = 92;
      excelRow.alignment = { vertical: "middle", wrapText: true };
      if (!photoUrl) continue;

      try {
        const imageResponse = await fetch(photoUrl);
        if (!imageResponse.ok) throw new Error("Foto tidak bisa diambil.");
        const imageBlob = await imageResponse.blob();
        const base64 = await blobToDataUrl(imageBlob);
        const imageId = workbook.addImage({
          base64,
          extension: resolveExcelImageExtension(imageBlob.type),
        });
        const rowNumber = excelRow.number;
        sheet.addImage(imageId, {
          tl: { col: 13.15, row: rowNumber - 0.85 },
          ext: { width: 110, height: 110 },
        });
      } catch {
        excelRow.getCell("photo").value = "Gambar gagal dimuat.";
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function downloadInventorySummaryXlsx(
  filename: string,
  rows: InventorySummaryRow[]
): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rekap Stok");

  sheet.columns = [
    { header: "Bahan", key: "ingredient", width: 32 },
    { header: "Dept", key: "department", width: 12 },
    { header: "Stok Resmi", key: "currentStock", width: 18 },
    { header: "Live Stock", key: "liveStock", width: 18 },
    { header: "Selisih Live", key: "liveDelta", width: 18 },
    { header: "Unit", key: "unit", width: 10 },
    { header: "Minimum Stock", key: "minimumStock", width: 18 },
    { header: "Status", key: "status", width: 14 },
    { header: "Supplier", key: "supplier", width: 26 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111827" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    const excelRow = sheet.addRow({
      ingredient: row.ingredient_name,
      department: row.department,
      currentStock: row.current_stock,
      liveStock: row.live_stock,
      liveDelta: row.live_delta,
      unit: row.unit,
      minimumStock: row.minimum_stock,
      status: row.stock_status,
      supplier: row.primary_supplier_name || "Belum ada",
    });

    if (row.stock_status === "LOW STOCK") {
      excelRow.getCell("status").font = { bold: true, color: { argb: "FFB91C1C" } };
      excelRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFF1F2" },
      };
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };
  sheet.getColumn("currentStock").numFmt = "#,##0.##";
  sheet.getColumn("minimumStock").numFmt = "#,##0.##";

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function downloadDemandPlanningXlsx(params: {
  filename: string;
  rows: SalesDemandRow[];
  dateKeys: string[];
  scenarioLabel: string;
  multiplier: number;
  coverageDays: number;
}): Promise<void> {
  const { filename, rows, dateKeys, scenarioLabel, multiplier, coverageDays } = params;
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Demand Planning");

  sheet.columns = [
    { header: "Bahan", key: "ingredient", width: 30 },
    { header: "Dept", key: "department", width: 12 },
    { header: "Unit", key: "unit", width: 10 },
    ...dateKeys.map((date) => ({
      header: formatBusinessDateLabel(date),
      key: `day_${date}`,
      width: 16,
    })),
    { header: "Total 7 Hari", key: "totalUsage", width: 16 },
    { header: "Avg/Hari", key: "avgDaily", width: 16 },
    { header: "Peak/Hari", key: "peakDaily", width: 16 },
    { header: "Stok Sekarang", key: "currentStock", width: 16 },
    { header: "Minimum Stock", key: "minimumStock", width: 16 },
    { header: "Skenario", key: "scenario", width: 18 },
    { header: "Coverage Hari", key: "coverage", width: 14 },
    { header: "Rekomendasi Order", key: "recommended", width: 20 },
    { header: "Supplier", key: "supplier", width: 26 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111827" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    const dayValues = Object.fromEntries(
      dateKeys.map((date) => [`day_${date}`, row.dailyUsage[date] ?? 0])
    );
    const excelRow = sheet.addRow({
      ingredient: row.ingredientName,
      department: row.department,
      unit: row.unit,
      ...dayValues,
      totalUsage: row.totalUsage,
      avgDaily: row.averageDailyUsage,
      peakDaily: row.peakDailyUsage,
      currentStock: row.currentStock,
      minimumStock: row.minimumStock,
      scenario: `${scenarioLabel} x${multiplier}`,
      coverage: coverageDays,
      recommended: row.recommendedOrderQty,
      supplier: row.supplierName || "Belum ada",
    });

    if (row.recommendedOrderQty > 0) {
      excelRow.getCell("recommended").font = { bold: true, color: { argb: "FF047857" } };
    }
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columnCount },
  };

  for (const column of sheet.columns) {
    if (column.key && column.key !== "ingredient" && column.key !== "department" && column.key !== "unit") {
      sheet.getColumn(column.key).numFmt = "#,##0.##";
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

async function downloadSalesXlsx(filename: string, rows: SalesExportRow[]): Promise<void> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Laporan Penjualan");

  sheet.columns = [
    { header: "Tanggal", key: "date", width: 14 },
    { header: "Menu", key: "menu", width: 30 },
    { header: "Kategori", key: "category", width: 14 },
    { header: "Qty Terjual", key: "quantity", width: 14 },
    { header: "Harga Satuan", key: "unitPrice", width: 16 },
    { header: "Gross Revenue", key: "revenue", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF111827" },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    sheet.addRow({
      date: row.session_date,
      menu: row.menu_name,
      category: row.category,
      quantity: row.quantity_sold,
      unitPrice: row.unit_price,
      revenue: row.total_gross_revenue,
    });
  }

  sheet.getColumn("unitPrice").numFmt = '"Rp" #,##0';
  sheet.getColumn("revenue").numFmt = '"Rp" #,##0';

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatQtyId(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  const abs = Math.abs(rounded);
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
  }).format(abs);
  return rounded < 0 ? `-${formatted}` : formatted;
}

function formatQtyWithUnit(value: number, unit: string): string {
  const unitLabel = unit.trim();
  return unitLabel ? `${formatQtyId(value)} ${unitLabel}` : formatQtyId(value);
}

function parsePoQuantity(value: string): number {
  const n = parseFloat(value.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function formatDateRangeLabel(start: string, end: string): string {
  if (!start || !end) return "—";
  if (start === end) return formatBusinessDateLabel(start);
  return `${formatBusinessDateLabel(start)} – ${formatBusinessDateLabel(end)}`;
}

function ledgerRowKey(row: Pick<StockLedgerExportRow, "business_date" | "ingredient_id" | "department">): string {
  return `${row.business_date}|${row.ingredient_id}|${row.department}`;
}

function isLowStockCondition(currentStock: number, minimumStock: number): boolean {
  const min = Number(minimumStock);
  const stock = Number(currentStock);
  return min > 0 && stock <= min;
}

/** Kuantitas PO = (Target Harian × coverageDays + Minimum) − Stok Saat Ini; minimum 0. */
function computeRecommendedPoQuantity(
  dailyTarget: number,
  coverageDays: number,
  minimumStock: number,
  currentStock: number
): number {
  const days = Math.max(1, Number(coverageDays) || 1);
  const target = Math.max(0, Number(dailyTarget) || 0);
  const min = Math.max(0, Number(minimumStock) || 0);
  const current = Math.max(0, Number(currentStock) || 0);
  const raw = target * days + min - current;
  return Math.max(0, Math.round(raw * 100) / 100);
}

function formatPoLineDraftQuantity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const rounded = Math.round(value * 100) / 100;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(2);
}

function formatInitialPoLineQuantity(value: number): string {
  return formatPoLineDraftQuantity(Math.max(value, 1));
}

function parseOptionalPercent(value: string): number {
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function computeEventEffectiveness(params: {
  expectedUpliftPct: number;
  actualUpliftPct: number | null;
  eventEndDate: string;
}): DemandEventReportRow["effectiveness"] {
  const { expectedUpliftPct, actualUpliftPct, eventEndDate } = params;
  if (eventEndDate >= resolveBusinessDate()) return "pending";
  if (actualUpliftPct === null) return "neutral";
  if (actualUpliftPct >= expectedUpliftPct * 0.8) return "effective";
  if (actualUpliftPct < Math.max(expectedUpliftPct * 0.5, 5)) return "underperform";
  return "neutral";
}

function formatPoDateLocal(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
}

function formatPoWaQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString("id-ID", {
    maximumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
  });
}

function formatRupiahWaPlain(amount: number): string {
  return `Rp ${Math.round(amount).toLocaleString("id-ID")}`;
}

function openSupplierWhatsAppChat(supplierPhone: string, messageText: string): void {
  const phone = normalizeWhatsAppPhoneNumber(supplierPhone);
  const encodedText = encodeURIComponent(messageText);
  window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}`, "_blank");
}

function TopSellingWidget({
  title,
  items,
  unitLabel,
  barColorClass,
  emptyLabel,
}: {
  title: string;
  items: TopSellingEntry[];
  unitLabel: string;
  barColorClass: string;
  emptyLabel: string;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-zinc-900/70 p-4 shadow-lg shadow-black/20">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-slate-300" />
        <h3 className="text-base font-semibold text-slate-100">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => (
            <li key={`${item.menu_name}-${index}`}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-medium text-slate-100">
                  <span className="mr-2 text-slate-500">#{index + 1}</span>
                  {item.menu_name}
                </span>
                <span className="shrink-0 tabular-nums text-slate-300">
                  {formatQtyId(item.quantity_sold)} {unitLabel}
                </span>
              </div>
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Kontribusi penjualan</span>
                <span className="tabular-nums">{item.sharePercent.toFixed(1)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all ${barColorClass}`}
                  style={{ width: `${Math.min(item.sharePercent, 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatusIndicator({
  label,
  active,
  activeClassName,
  detail,
}: {
  label: string;
  active: boolean;
  activeClassName: string;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-zinc-950/60 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${
            active ? `${activeClassName} animate-pulse` : "bg-emerald-500/80"
          }`}
        />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      </div>
      <p className="mt-1 text-xs text-slate-300">{detail}</p>
    </div>
  );
}

function QtyCell({
  value,
  unit,
  className = "text-slate-300",
}: {
  value: number;
  unit: string;
  className?: string;
}) {
  return <td className={`px-3 py-2 text-right tabular-nums ${className}`}>{formatQtyWithUnit(value, unit)}</td>;
}

function AdjustmentCell({ row }: { row: LedgerTableRow }) {
  const showNote = row.adjustment_qty < 0 && row.outStockNote.length > 0;

  return (
    <td
      className={`px-3 py-2 text-right align-top tabular-nums font-medium ${
        row.adjustment_qty < 0 ? "text-red-400" : "text-slate-400"
      }`}
    >
      <div className="inline-flex flex-col items-end gap-0.5">
        <span>{formatQtyWithUnit(row.adjustment_qty, row.unit)}</span>
        {showNote && (
          <span className="max-w-[200px] text-left text-[11px] font-normal leading-snug text-zinc-400 sm:max-w-xs sm:text-right">
            (Catatan: {row.outStockNote})
          </span>
        )}
      </div>
    </td>
  );
}

function LowStockBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-500/50 bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-400 animate-pulse">
      ⚠️ Low Stock
    </span>
  );
}

function LiveStockTable({
  rows,
  businessDate,
}: {
  rows: LiveStockRow[];
  businessDate: string;
}) {
  const changedRows = rows.filter((row) => row.sourceCount > 0).length;

  return (
    <div className="mb-4 rounded-xl border border-indigo-500/25 bg-zinc-950/60 p-4">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-slate-100">Live Stock Worksheet</h4>
          <p className="text-xs text-slate-500">
            Stok resmi + draft worksheet per {formatBusinessDateLabel(businessDate)}.
          </p>
        </div>
        <span className="rounded-full bg-indigo-500/10 px-2.5 py-1 text-xs font-medium tabular-nums text-indigo-200">
          {changedRows} bahan bergerak
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-zinc-950 text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Bahan</th>
              <th className="px-3 py-2 font-medium">Dept</th>
              <th className="px-3 py-2 text-right font-medium">Stok Resmi</th>
              <th className="px-3 py-2 text-right font-medium">Receive</th>
              <th className="px-3 py-2 text-right font-medium">Premix +/-</th>
              <th className="px-3 py-2 text-right font-medium">Sales</th>
              <th className="px-3 py-2 text-right font-medium">Remake</th>
              <th className="px-3 py-2 text-right font-medium">Out</th>
              <th className="px-3 py-2 text-right font-medium">Opname</th>
              <th className="px-3 py-2 text-right font-medium">Live</th>
              <th className="px-3 py-2 text-right font-medium">Delta</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-slate-500">
                  Tidak ada bahan cocok dengan pencarian.
                </td>
              </tr>
            ) : (
              rows.slice(0, 80).map((row) => {
                const premixNet = row.premixOutputQty - row.premixUsageQty;
                return (
                  <tr
                    key={row.ingredientId}
                    className={row.status === "LOW STOCK" ? "bg-red-950/10" : "hover:bg-zinc-900/60"}
                  >
                    <td className="px-3 py-2 font-medium text-slate-100">
                      <div className="flex items-center gap-2">
                        <span>{row.ingredientName}</span>
                        {row.status === "LOW STOCK" ? <LowStockBadge /> : null}
                      </div>
                    </td>
                    <td className="px-3 py-2 capitalize text-slate-400">{row.department}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                      {formatQtyWithUnit(row.officialStock, row.unit)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-300">
                      {row.receiveQty > 0 ? `+${formatQtyWithUnit(row.receiveQty, row.unit)}` : "-"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        premixNet >= 0 ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {premixNet === 0
                        ? "-"
                        : `${premixNet > 0 ? "+" : ""}${formatQtyWithUnit(premixNet, row.unit)}`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-300">
                      {row.menuUsageQty > 0 ? `-${formatQtyWithUnit(row.menuUsageQty, row.unit)}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-300">
                      {row.issueUsageQty > 0 ? `-${formatQtyWithUnit(row.issueUsageQty, row.unit)}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-300">
                      {row.outQty > 0 ? `-${formatQtyWithUnit(row.outQty, row.unit)}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-indigo-200">
                      {row.opnameQty === null ? "-" : formatQtyWithUnit(row.opnameQty, row.unit)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-100">
                      {formatQtyWithUnit(row.liveStock, row.unit)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        row.liveDelta < 0
                          ? "text-red-300"
                          : row.liveDelta > 0
                            ? "text-emerald-300"
                            : "text-slate-500"
                      }`}
                    >
                      {row.liveDelta === 0
                        ? "-"
                        : `${row.liveDelta > 0 ? "+" : ""}${formatQtyWithUnit(row.liveDelta, row.unit)}`}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          row.status === "LOW STOCK"
                            ? "bg-red-500/15 text-red-300"
                            : "bg-emerald-500/10 text-emerald-300"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DepartmentLedgerTable({
  title,
  emoji,
  accentClass,
  rows,
  emptyMessage,
  showDateColumn,
}: {
  title: string;
  emoji: string;
  accentClass: string;
  rows: LedgerTableRow[];
  emptyMessage: string;
  showDateColumn: boolean;
}) {
  const sectionLowStockCount = rows.filter((row) => row.isLowStock).length;

  return (
    <section className={`rounded-xl border ${accentClass} bg-zinc-900/60 p-4`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-lg" aria-hidden>
          {emoji}
        </span>
        <h4 className="text-sm font-bold uppercase tracking-wide text-slate-100">{title}</h4>
        {sectionLowStockCount > 0 && (
          <span className="rounded-full border border-red-800/60 bg-red-950/30 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-red-300">
            {sectionLowStockCount} low stock
          </span>
        )}
        <span className="ml-auto rounded-full bg-zinc-950 px-2.5 py-0.5 text-xs tabular-nums text-slate-400">
          {rows.length} bahan
        </span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-zinc-950 text-slate-400">
            <tr>
              {showDateColumn && <th className="px-3 py-2 font-medium">Tanggal</th>}
              <th className="px-3 py-2 font-medium">Bahan</th>
              <th className="px-3 py-2 text-right font-medium">Opening</th>
              <th className="px-3 py-2 text-right font-medium">In</th>
              <th className="px-3 py-2 text-right font-medium">Teori</th>
              <th className="px-3 py-2 text-right font-medium">Adj</th>
              <th className="px-3 py-2 text-right font-medium">Closing</th>
              <th className="px-3 py-2 text-right font-medium">Variance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showDateColumn ? 8 : 7} className="px-3 py-8 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={ledgerRowKey(row)}
                  className={
                    row.isLowStock
                      ? "border-l-2 border-red-800 bg-red-950/20 hover:bg-red-950/30"
                      : "hover:bg-zinc-950/50"
                  }
                >
                  {showDateColumn && (
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                      {formatBusinessDateLabel(row.business_date)}
                    </td>
                  )}
                  <td className="px-3 py-2 text-slate-100">
                    <span className="flex flex-wrap items-center gap-2">
                      {row.spillageAlert && (
                        <span
                          className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500"
                          title="Spillage alert"
                        />
                      )}
                      <span className={row.isLowStock ? "font-medium text-red-300" : undefined}>
                        {row.ingredient_name}
                      </span>
                      {row.isLowStock && <LowStockBadge />}
                    </span>
                  </td>
                  <QtyCell value={row.opening_stock} unit={row.unit} />
                  <QtyCell value={row.in_qty} unit={row.unit} />
                  <QtyCell value={row.theoretical_usage} unit={row.unit} />
                  <AdjustmentCell row={row} />
                  <td
                    className={`px-3 py-2 text-right align-top tabular-nums ${
                      row.isLowStock ? "font-semibold text-amber-400" : "text-indigo-300"
                    }`}
                  >
                    <div className="inline-flex flex-col items-end gap-1">
                      <span>{formatQtyWithUnit(row.closing_stock, row.unit)}</span>
                      {row.isLowStock && row.minimum_stock > 0 && (
                        <span className="text-[10px] font-normal text-red-400/90">
                          Min. {formatQtyWithUnit(row.minimum_stock, row.unit)}
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-medium ${
                      row.variance_qty !== 0 ? "text-amber-300" : "text-slate-500"
                    }`}
                  >
                    {formatQtyWithUnit(row.variance_qty, row.unit)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WorksheetEditRequestPanel({
  supabase,
  canEdit,
  onChanged,
}: {
  supabase: ReturnType<typeof getSupabaseClientOrNull>;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [requests, setRequests] = useState<WorksheetEditRequestReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const loadRequests = useCallback(async () => {
    if (!supabase) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("worksheet_edit_request")
      .select(
        `
        *,
        staff:requested_by_staff_id ( name ),
        worksheet_session:session_id ( status, submitted_at )
      `
      )
      .eq("status", "PENDING")
      .order("created_at", { ascending: false });

    if (error) {
      setNotice({ message: error.message, variant: "error" });
      setLoading(false);
      return;
    }

    setRequests(
      ((data ?? []) as unknown as WorksheetEditRequestJoined[]).map((row) => {
        const staffRaw = row.staff;
        const rowStaff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
        const sessionRaw = row.worksheet_session;
        const session = Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw;
        return {
          ...row,
          staffName: rowStaff?.name ?? "Staff lama / tidak tercatat",
          sessionStatus: session?.status ?? "-",
        };
      })
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const reviewRequest = async (
    request: WorksheetEditRequestReportRow,
    status: "APPROVED" | "REJECTED"
  ) => {
    if (!supabase || !canEdit || busyId) return;

    const reviewer = getStaffSession();
    if (!reviewer) {
      setNotice({ message: "Session admin/master tidak ditemukan.", variant: "error" });
      return;
    }

    const rejectNote =
      status === "REJECTED" ? window.prompt("Catatan reject request koreksi:", "") : null;
    if (status === "REJECTED" && rejectNote === null) return;
    const reviewNote =
      status === "APPROVED"
        ? "Worksheet tanggal dan department ini dibuka untuk koreksi staff."
        : rejectNote?.trim() || "Request koreksi ditolak.";

    setBusyId(request.id);
    setNotice(null);

    try {
      if (status === "APPROVED") {
        const { error: sessionErr } = await supabase
          .from("worksheet_session")
          .update({
            status: "DRAFT",
            submitted_at: null,
            submitted_by_staff_id: null,
            locked_at: null,
            locked_by_staff_id: null,
          })
          .eq("id", request.session_id)
          .eq("business_date", request.business_date)
          .eq("department", request.department);

        if (sessionErr) throw sessionErr;

        const { error: dayErr } = await supabase
          .from("business_day")
          .update({ status: "DRAFT" })
          .eq("business_date", request.business_date);

        if (dayErr) throw dayErr;
      }

      const { error: requestErr } = await supabase
        .from("worksheet_edit_request")
        .update({
          status,
          reviewed_by_staff_id: reviewer.id,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote,
        })
        .eq("id", request.id);

      if (requestErr) throw requestErr;

      setNotice({
        message:
          status === "APPROVED"
            ? `Worksheet ${request.department} ${formatBusinessDateLabel(request.business_date)} dibuka.`
            : "Request koreksi ditolak.",
        variant: "success",
      });
      await loadRequests();
      onChanged();
    } catch (err) {
      setNotice({
        message: err instanceof Error ? err.message : "Gagal review request koreksi.",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-800 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Approval Koreksi Worksheet</h3>
          <p className="mt-1 text-xs text-slate-500">
            Approval hanya membuka session tanggal dan department yang diminta.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRequests()}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800"
          aria-label="Refresh request koreksi worksheet"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {notice ? (
        <p
          className={`mb-3 rounded-lg border px-3 py-2 text-xs ${
            notice.variant === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />
          Memuat request koreksi…
        </div>
      ) : requests.length === 0 ? (
        <p className="rounded-lg border border-slate-800 bg-zinc-950/50 px-3 py-4 text-sm text-slate-500">
          Belum ada request koreksi worksheet.
        </p>
      ) : (
        <ul className="space-y-2">
          {requests.map((request) => (
            <li key={request.id} className="rounded-lg border border-slate-800 bg-zinc-950/50 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">
                    {request.staffName} · {request.department}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatBusinessDateLabel(request.business_date)} · status {request.sessionStatus}
                  </p>
                </div>
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200">
                  PENDING
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-300">{request.reason}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!canEdit || busyId === request.id}
                  onClick={() => void reviewRequest(request, "APPROVED")}
                  className="min-h-10 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  Approve & Buka
                </button>
                <button
                  type="button"
                  disabled={!canEdit || busyId === request.id}
                  onClick={() => void reviewRequest(request, "REJECTED")}
                  className="min-h-10 rounded-lg border border-red-500/40 px-3 text-xs font-bold text-red-200 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function MonitoringDashboard() {
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const canEdit = canEditStaffData(getStaffSession()?.role);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(() => resolveBusinessDate());
  const [endDate, setEndDate] = useState(() => resolveBusinessDate());
  const [activeMonitoringTab, setActiveMonitoringTab] = useState<MonitoringTabId>("overview");
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [ledgerExportRows, setLedgerExportRows] = useState<StockLedgerExportRow[]>([]);
  const [inventorySummaryRows, setInventorySummaryRows] = useState<InventorySummaryRow[]>([]);
  const [liveStockRows, setLiveStockRows] = useState<LiveStockRow[]>([]);
  const [lowStockInventoryRows, setLowStockInventoryRows] = useState<LowStockInventoryRow[]>([]);
  const [salesExportRows, setSalesExportRows] = useState<SalesExportRow[]>([]);
  const [salesDemandRows, setSalesDemandRows] = useState<SalesDemandRow[]>([]);
  const [receiveAuditRows, setReceiveAuditRows] = useState<ReceiveAuditRow[]>([]);
  const [menuIssueRows, setMenuIssueRows] = useState<MenuIssueReportRow[]>([]);
  const [demandEvents, setDemandEvents] = useState<DemandEventReportRow[]>([]);
  const [eventForm, setEventForm] = useState<DemandEventForm>(() => ({
    title: "",
    eventType: "kol",
    department: "",
    startDate: resolveBusinessDate(),
    endDate: resolveBusinessDate(),
    expectedUpliftPct: "50",
    notes: "",
  }));
  const [eventNotice, setEventNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [eventSaving, setEventSaving] = useState(false);
  const [holidaySyncing, setHolidaySyncing] = useState(false);
  const [topBeverages, setTopBeverages] = useState<TopSellingEntry[]>([]);
  const [topFoods, setTopFoods] = useState<TopSellingEntry[]>([]);
  const [runwayEntries, setRunwayEntries] = useState<RunwayEntry[]>([]);
  const [runwaySource, setRunwaySource] = useState("");
  const [cogsAlerts, setCogsAlerts] = useState<CogsAlert[]>([]);
  const [hasSpillageAlert, setHasSpillageAlert] = useState(false);

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierCatalog, setSupplierCatalog] = useState<SupplierPriceCatalog[]>([]);
  const [poLines, setPoLines] = useState<PoLineDraft[]>([]);
  const [coverageDays, setCoverageDays] = useState(1);
  const [demandScenario, setDemandScenario] = useState<DemandScenario>("normal");
  const [ingredientDailyUsageById, setIngredientDailyUsageById] = useState<Record<string, number>>({});
  const [ingredientStockById, setIngredientStockById] = useState<
    Record<string, { currentStock: number; minimumStock: number }>
  >({});
  const [primarySupplierByIngredientId, setPrimarySupplierByIngredientId] = useState<
    Record<string, PrimarySupplierAssignment>
  >({});
  const [poSubmitting, setPoSubmitting] = useState(false);
  const [poSuccess, setPoSuccess] = useState<string | null>(null);
  const [poError, setPoError] = useState<string | null>(null);

  const dateRangeInvalid = startDate > endDate;

  const dateRangeLabel = useMemo(
    () => formatDateRangeLabel(startDate, endDate),
    [startDate, endDate]
  );

  const demandDateKeys = useMemo(
    () =>
      Array.from({ length: RUNWAY_HISTORY_DAYS }, (_, index) =>
        addIsoDays(endDate, index - (RUNWAY_HISTORY_DAYS - 1))
      ),
    [endDate]
  );

  const isSingleDayRange = startDate === endDate;

  const thursdayOrderClosed = useMemo(() => isThursdayLastOrderClosed(), [refreshKey]);
  const demandMultiplier = DEMAND_SCENARIO_MULTIPLIER[demandScenario];

  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedSupplierId) ?? null,
    [suppliers, selectedSupplierId]
  );

  const poTotalAmount = useMemo(
    () =>
      poLines.reduce((sum, line) => {
        const qty = parsePoQuantity(line.quantity);
        return sum + qty * line.unitPrice;
      }, 0),
    [poLines]
  );

  const minOrderShortfall = useMemo(() => {
    if (!selectedSupplier) return 0;
    const min = Number(selectedSupplier.min_order_amount);
    if (poTotalAmount >= min) return 0;
    return min - poTotalAmount;
  }, [poTotalAmount, selectedSupplier]);

  const poSubmitDisabled = thursdayOrderClosed || !selectedSupplierId || poSubmitting;

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredLedgerRows = useMemo(() => {
    if (!normalizedSearch) return ledgerExportRows;
    return ledgerExportRows.filter(
      (row) =>
        row.ingredient_name.toLowerCase().includes(normalizedSearch) ||
        row.department.toLowerCase().includes(normalizedSearch) ||
        row.Catatan_Out_Stock.toLowerCase().includes(normalizedSearch) ||
        row.Foto_Out_Stock.toLowerCase().includes(normalizedSearch)
    );
  }, [ledgerExportRows, normalizedSearch]);

  const filteredInventorySummaryRows = useMemo(() => {
    if (!normalizedSearch) return inventorySummaryRows;
    return inventorySummaryRows.filter(
      (row) =>
        row.ingredient_name.toLowerCase().includes(normalizedSearch) ||
        row.department.toLowerCase().includes(normalizedSearch) ||
        row.primary_supplier_name.toLowerCase().includes(normalizedSearch) ||
        row.stock_status.toLowerCase().includes(normalizedSearch)
    );
  }, [inventorySummaryRows, normalizedSearch]);

  const filteredLiveStockRows = useMemo(() => {
    if (!normalizedSearch) return liveStockRows;
    return liveStockRows.filter(
      (row) =>
        row.ingredientName.toLowerCase().includes(normalizedSearch) ||
        row.department.toLowerCase().includes(normalizedSearch) ||
        row.status.toLowerCase().includes(normalizedSearch)
    );
  }, [liveStockRows, normalizedSearch]);

  const filteredSalesRows = useMemo(() => {
    if (!normalizedSearch) return salesExportRows;
    return salesExportRows.filter(
      (row) =>
        row.menu_name.toLowerCase().includes(normalizedSearch) ||
        row.category.toLowerCase().includes(normalizedSearch)
    );
  }, [salesExportRows, normalizedSearch]);

  const filteredSalesDemandRows = useMemo(() => {
    if (!normalizedSearch) return salesDemandRows;
    return salesDemandRows.filter(
      (row) =>
        row.ingredientName.toLowerCase().includes(normalizedSearch) ||
        row.department.toLowerCase().includes(normalizedSearch) ||
        row.supplierName.toLowerCase().includes(normalizedSearch)
    );
  }, [normalizedSearch, salesDemandRows]);

  const filteredReceiveAuditRows = useMemo(() => {
    if (!normalizedSearch) return receiveAuditRows;
    return receiveAuditRows.filter(
      (row) =>
        row.ingredientName.toLowerCase().includes(normalizedSearch) ||
        row.department.toLowerCase().includes(normalizedSearch) ||
        row.staffName.toLowerCase().includes(normalizedSearch)
    );
  }, [normalizedSearch, receiveAuditRows]);

  const filteredMenuIssueRows = useMemo(() => {
    if (!normalizedSearch) return menuIssueRows;
    return menuIssueRows.filter(
      (row) =>
        row.menuName.toLowerCase().includes(normalizedSearch) ||
        row.department.toLowerCase().includes(normalizedSearch) ||
        row.reasonLabel.toLowerCase().includes(normalizedSearch) ||
        row.note.toLowerCase().includes(normalizedSearch)
    );
  }, [menuIssueRows, normalizedSearch]);

  const filteredDemandEvents = useMemo(() => {
    if (!normalizedSearch) return demandEvents;
    return demandEvents.filter(
      (event) =>
        event.title.toLowerCase().includes(normalizedSearch) ||
        event.event_type.toLowerCase().includes(normalizedSearch) ||
        event.notes.toLowerCase().includes(normalizedSearch) ||
        (event.department ?? "").toLowerCase().includes(normalizedSearch)
    );
  }, [demandEvents, normalizedSearch]);

  const demandPlanningRows = useMemo(
    () =>
      filteredSalesDemandRows
        .map((row) => ({
          ...row,
          recommendedOrderQty: computeRecommendedPoQuantity(
            row.averageDailyUsage * demandMultiplier,
            coverageDays,
            row.minimumStock,
            row.currentStock
          ),
        }))
        .sort((a, b) => {
          if (b.recommendedOrderQty !== a.recommendedOrderQty) {
            return b.recommendedOrderQty - a.recommendedOrderQty;
          }
          return b.totalUsage - a.totalUsage;
        }),
    [coverageDays, demandMultiplier, filteredSalesDemandRows]
  );

  const filteredTopBeverages = useMemo(() => {
    if (!normalizedSearch) return topBeverages;
    return topBeverages.filter((item) => item.menu_name.toLowerCase().includes(normalizedSearch));
  }, [topBeverages, normalizedSearch]);

  const filteredTopFoods = useMemo(() => {
    if (!normalizedSearch) return topFoods;
    return topFoods.filter((item) => item.menu_name.toLowerCase().includes(normalizedSearch));
  }, [topFoods, normalizedSearch]);

  const ledgerTableRows: LedgerTableRow[] = useMemo(
    () =>
      filteredLedgerRows.map((row) => ({
        ...row,
        outStockNote: row.Catatan_Out_Stock,
        isLowStock: isLowStockCondition(row.closing_stock, row.minimum_stock),
        spillageAlert:
          row.adjustment_qty < 0 &&
          Math.abs(row.adjustment_qty) > Math.max(row.theoretical_usage * SPILLAGE_RATIO_THRESHOLD, 1),
      })),
    [filteredLedgerRows]
  );

  const lowStockCountToday = lowStockInventoryRows.length;

  const priorityItems = useMemo(() => {
    const items: { tone: "critical" | "warning" | "info"; title: string; detail: string }[] = [];

    for (const row of lowStockInventoryRows.slice(0, 3)) {
      items.push({
        tone: "critical",
        title: `Order ${row.ingredientName}`,
        detail: `Stok ${formatQtyWithUnit(row.currentStock, row.unit)} di bawah minimum ${formatQtyWithUnit(row.minimumStock, row.unit)}.`,
      });
    }

    const criticalRunway = runwayEntries.filter((entry) => entry.urgency !== "safe").slice(0, 2);
    for (const entry of criticalRunway) {
      items.push({
        tone: entry.urgency === "critical" ? "critical" : "warning",
        title: `Cek runway ${entry.ingredientName}`,
        detail: `Estimasi sisa ${entry.daysRemaining} hari berdasarkan pemakaian terakhir.`,
      });
    }

    if (menuIssueRows.length > 0) {
      const totalIssueQty = menuIssueRows.reduce((sum, row) => sum + row.quantity, 0);
      items.push({
        tone: "warning",
        title: "Review remake / complaint",
        detail: `${formatQtyId(totalIssueQty)} porsi tercatat dalam rentang ${dateRangeLabel}.`,
      });
    }

    if (hasSpillageAlert) {
      items.push({
        tone: "critical",
        title: "Review spillage alert",
        detail: "Ada adjustment negatif yang melewati ambang kontrol operasional.",
      });
    }

    if (cogsAlerts.length > 0) {
      items.push({
        tone: "info",
        title: "Cek kenaikan HPP",
        detail: `${cogsAlerts.length} bahan mengalami kenaikan harga supplier.`,
      });
    }

    if (items.length === 0) {
      items.push({
        tone: "info",
        title: "Operasional terlihat aman",
        detail: "Belum ada prioritas kritis dari stok, remake, spillage, atau COGS.",
      });
    }

    return items.slice(0, 5);
  }, [cogsAlerts.length, dateRangeLabel, hasSpillageAlert, lowStockInventoryRows, menuIssueRows, runwayEntries]);

  const lowStockOrderGroups = useMemo<LowStockOrderGroup[]>(() => {
    const grouped = new Map<string, LowStockOrderGroup>();

    for (const row of lowStockInventoryRows) {
      const currentStock = row.currentStock;
      const minimumStock = row.minimumStock;

      const supplier = row.primarySupplierId
        ? {
            supplierId: row.primarySupplierId,
            supplierName: row.primarySupplierName || "Belum ada supplier",
            phoneNumber: row.primarySupplierPhone,
            unitPrice: 0,
          }
        : (primarySupplierByIngredientId[row.ingredientId] ?? {
            supplierId: "unassigned",
            supplierName: "Belum ada supplier",
            phoneNumber: null,
            unitPrice: 0,
          });
      const dailyNeed = (ingredientDailyUsageById[row.ingredientId] ?? 0) * demandMultiplier;
      const quantity = Math.max(
        computeRecommendedPoQuantity(dailyNeed, coverageDays, minimumStock, currentStock),
        1
      );

      const existing = grouped.get(supplier.supplierId) ?? {
        supplierId: supplier.supplierId,
        supplierName: supplier.supplierName,
        phoneNumber: supplier.phoneNumber,
        lines: [],
      };
      existing.lines.push({
        ingredientId: row.ingredientId,
        ingredientName: row.ingredientName,
        unit: row.unit,
        quantity,
        currentStock,
        minimumStock,
      });
      grouped.set(supplier.supplierId, existing);
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        lines: group.lines.sort((a, b) => a.ingredientName.localeCompare(b.ingredientName)),
      }))
      .sort((a, b) => {
        if (a.supplierId === "unassigned") return 1;
        if (b.supplierId === "unassigned") return -1;
        return a.supplierName.localeCompare(b.supplierName);
      });
  }, [
    coverageDays,
    demandMultiplier,
    ingredientDailyUsageById,
    lowStockInventoryRows,
    primarySupplierByIngredientId,
  ]);

  const selectedSupplierLowStockGroups = useMemo(
    () => lowStockOrderGroups.filter((group) => group.supplierId === selectedSupplierId),
    [lowStockOrderGroups, selectedSupplierId]
  );

  const supplierPoCards = useMemo<SupplierPoCard[]>(() => {
    const groupBySupplierId = new Map(lowStockOrderGroups.map((group) => [group.supplierId, group]));
    return suppliers
      .map((supplier) => {
        const orderGroup = groupBySupplierId.get(supplier.id) ?? null;
        return {
          supplier,
          orderGroup,
          lineCount: orderGroup?.lines.length ?? 0,
        };
      })
      .sort((a, b) => {
        if (a.lineCount !== b.lineCount) return b.lineCount - a.lineCount;
        return a.supplier.name.localeCompare(b.supplier.name);
      });
  }, [lowStockOrderGroups, suppliers]);

  const unassignedLowStockGroup = useMemo(
    () => lowStockOrderGroups.find((group) => group.supplierId === "unassigned") ?? null,
    [lowStockOrderGroups]
  );

  const totalSelectedLowStockLines = useMemo(
    () => selectedSupplierLowStockGroups.reduce((sum, group) => sum + group.lines.length, 0),
    [selectedSupplierLowStockGroups]
  );

  const barLedgerRows = useMemo(
    () => ledgerTableRows.filter((row) => row.department === "bar"),
    [ledgerTableRows]
  );

  const kitchenLedgerRows = useMemo(
    () => ledgerTableRows.filter((row) => row.department === "kitchen"),
    [ledgerTableRows]
  );

  const loadSupplierCatalog = useCallback(
    async (supplierId: string) => {
      if (!supabase || !supplierId) {
        setSupplierCatalog([]);
        return;
      }

      const { data, error: catalogErr } = await supabase
        .from("supplier_ingredient_price")
        .select(
          `
          id,
          supplier_id,
          ingredient_id,
          unit_price,
          valid_from,
          created_at,
          updated_at,
          ingredient:ingredient_id ( id, name, unit, department )
        `
        )
        .eq("supplier_id", supplierId)
        .order("valid_from", { ascending: false });

      if (catalogErr) {
        setError(catalogErr.message);
        setSupplierCatalog([]);
        return;
      }

      const latestByIngredient = new Map<string, SupplierPriceCatalog>();
      for (const row of (data ?? []) as SupplierPriceJoinRow[]) {
        const ingredientRaw = row.ingredient;
        const ingredient = Array.isArray(ingredientRaw) ? ingredientRaw[0] : ingredientRaw;
        if (!ingredient) continue;
        if (!latestByIngredient.has(ingredient.id)) {
          latestByIngredient.set(ingredient.id, {
            id: row.id,
            supplier_id: row.supplier_id,
            ingredient_id: row.ingredient_id,
            unit_price: Number(row.unit_price),
            valid_from: row.valid_from,
            created_at: row.created_at,
            updated_at: row.updated_at,
            ingredient,
          });
        }
      }

      setSupplierCatalog(Array.from(latestByIngredient.values()));
    },
    [supabase]
  );

  const loadDashboard = useCallback(async () => {
    if (!supabase) {
      setError("Supabase belum dikonfigurasi.");
      setLoading(false);
      return;
    }

    if (dateRangeInvalid) {
      setError("Tanggal mulai tidak boleh setelah tanggal akhir.");
      setLoading(false);
      return;
    }

    if (!hasLoadedOnce) setLoading(true);
    setError(null);

    const rangeStart = startDate;
    const rangeEnd = endDate;

    const { data: ingredients, error: ingErr } = await supabase
      .from("ingredient")
      .select("*, supplier:primary_supplier_id ( id, name, phone_number )")
      .eq("is_active", true)
      .eq("is_stock_tracked", true)
      .order("name");

    if (ingErr) {
      setError(ingErr.message);
      setLoading(false);
      return;
    }

    const ingredientMap = new Map(
      ((ingredients ?? []) as IngredientWithPrimarySupplier[]).map((i) => [i.id, i])
    );
    const summaryRows = ((ingredients ?? []) as IngredientWithPrimarySupplier[])
      .map((ingredient) => {
        const currentStock = Number(ingredient.current_stock ?? 0);
        const minimumStock = Number(ingredient.minimum_stock ?? 0);
        return {
          ingredient_id: ingredient.id,
          ingredient_name: ingredient.name,
          department: ingredient.department,
          unit: ingredient.unit,
          current_stock: currentStock,
          live_stock: currentStock,
          live_delta: 0,
          minimum_stock: minimumStock,
          stock_status: isLowStockCondition(currentStock, minimumStock) ? "LOW STOCK" : "OK",
          primary_supplier_name: ingredient.supplier?.name ?? "",
        } satisfies InventorySummaryRow;
      })
      .sort((a, b) => {
        const deptCmp = a.department.localeCompare(b.department);
        if (deptCmp !== 0) return deptCmp;
        if (a.stock_status !== b.stock_status) return a.stock_status === "LOW STOCK" ? -1 : 1;
        return a.ingredient_name.localeCompare(b.ingredient_name);
      });

    setInventorySummaryRows(summaryRows);
    setLowStockInventoryRows(
      ((ingredients ?? []) as IngredientWithPrimarySupplier[])
        .map((ingredient) => ({
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          unit: ingredient.unit,
          currentStock: Number(ingredient.current_stock ?? 0),
          minimumStock: Number(ingredient.minimum_stock ?? 0),
          primarySupplierId: ingredient.primary_supplier_id ?? null,
          primarySupplierName: ingredient.supplier?.name ?? "",
          primarySupplierPhone: ingredient.supplier?.phone_number ?? null,
        }))
        .filter((row) => isLowStockCondition(row.currentStock, row.minimumStock))
    );

    const { data: sessionsInRange, error: sessionRangeErr } = await supabase
      .from("worksheet_session")
      .select("id, business_date, department, status")
      .gte("business_date", rangeStart)
      .lte("business_date", rangeEnd);

    if (sessionRangeErr) {
      setError(sessionRangeErr.message);
      setLoading(false);
      return;
    }

    const liveSessions = ((sessionsInRange ?? []) as WorksheetSessionMonitorRow[]).filter(
      (session) =>
        session.business_date === rangeEnd &&
        !FINAL_WORKSHEET_STATUSES.has(String(session.status ?? "DRAFT"))
    );
    const liveSessionIds = liveSessions.map((session) => session.id);
    const receiveLiveMap = new Map<string, number>();
    const outLiveMap = new Map<string, number>();
    const opnameLiveMap = new Map<string, number>();
    const premixOutputLiveMap = new Map<string, number>();
    const premixUsageLiveMap = new Map<string, number>();
    const menuUsageLiveMap = new Map<string, number>();
    const issueUsageLiveMap = new Map<string, number>();

    if (liveSessionIds.length > 0) {
      const [
        receiveLiveResult,
        outLiveResult,
        opnameLiveResult,
        premixLiveResult,
        soldLiveResult,
        issueLiveResult,
      ] = await Promise.all([
        supabase
          .from("worksheet_receive_entry")
          .select("ingredient_id, quantity")
          .in("session_id", liveSessionIds),
        supabase
          .from("worksheet_out_line")
          .select("ingredient_id, quantity")
          .in("session_id", liveSessionIds),
        supabase
          .from("worksheet_opname_line")
          .select("ingredient_id, closing_stock")
          .in("session_id", liveSessionIds),
        supabase
          .from("worksheet_premix_line")
          .select("output_ingredient_id, recipe_id, batch_quantity")
          .in("session_id", liveSessionIds),
        supabase
          .from("worksheet_sold_line")
          .select("menu_item_id, quantity_sold")
          .in("session_id", liveSessionIds),
        supabase
          .from("worksheet_menu_issue_line")
          .select("menu_item_id, quantity")
          .in("session_id", liveSessionIds),
      ]);

      const liveLoadError =
        receiveLiveResult.error ??
        outLiveResult.error ??
        opnameLiveResult.error ??
        premixLiveResult.error ??
        soldLiveResult.error ??
        issueLiveResult.error;

      if (liveLoadError) {
        setError(`Gagal memuat live stock: ${liveLoadError.message}`);
        setLoading(false);
        return;
      }

      for (const row of receiveLiveResult.data ?? []) {
        const ingredient = ingredientMap.get(row.ingredient_id);
        addToNumericMap(
          receiveLiveMap,
          row.ingredient_id,
          receiveQtyToStockUnit(ingredient, Number(row.quantity ?? 0))
        );
      }

      for (const row of outLiveResult.data ?? []) {
        addToNumericMap(outLiveMap, row.ingredient_id, Number(row.quantity ?? 0));
      }

      for (const row of opnameLiveResult.data ?? []) {
        addToNumericMap(opnameLiveMap, row.ingredient_id, Number(row.closing_stock ?? 0));
      }

      const premixRows = premixLiveResult.data ?? [];
      const recipeIds = Array.from(new Set(premixRows.map((row) => row.recipe_id).filter(Boolean)));
      const menuQtyById = new Map<string, number>();
      const issueQtyByMenuId = new Map<string, number>();

      for (const row of soldLiveResult.data ?? []) {
        addToNumericMap(menuQtyById, row.menu_item_id, Number(row.quantity_sold ?? 0));
      }

      for (const row of issueLiveResult.data ?? []) {
        addToNumericMap(issueQtyByMenuId, row.menu_item_id, Number(row.quantity ?? 0));
      }

      if (recipeIds.length > 0) {
        const [recipeResult, componentResult] = await Promise.all([
          supabase.from("recipes").select("id, yield_quantity").in("id", recipeIds),
          supabase.from("recipe_component").select("recipe_id, ingredient_id, qty_per_batch").in("recipe_id", recipeIds),
        ]);

        if (recipeResult.error || componentResult.error) {
          setError(
            `Gagal memuat resep premix live: ${
              recipeResult.error?.message ?? componentResult.error?.message ?? ""
            }`
          );
          setLoading(false);
          return;
        }

        const recipeById = new Map(
          ((recipeResult.data ?? []) as PremixRecipeRow[]).map((recipe) => [recipe.id, recipe])
        );
        const componentsByRecipeId = new Map<string, PremixComponentRow[]>();
        for (const component of (componentResult.data ?? []) as PremixComponentRow[]) {
          componentsByRecipeId.set(component.recipe_id, [
            ...(componentsByRecipeId.get(component.recipe_id) ?? []),
            component,
          ]);
        }

        for (const row of premixRows) {
          const batchQty = Number(row.batch_quantity ?? 0);
          if (batchQty <= 0) continue;
          const recipe = recipeById.get(row.recipe_id);
          const outputQty = batchQty * Number(recipe?.yield_quantity ?? 1);
          addToNumericMap(premixOutputLiveMap, row.output_ingredient_id, outputQty);

          for (const component of componentsByRecipeId.get(row.recipe_id) ?? []) {
            addToNumericMap(
              premixUsageLiveMap,
              component.ingredient_id,
              Number(component.qty_per_batch ?? 0) * batchQty
            );
          }
        }
      }

      const liveMenuIds = Array.from(
        new Set([...menuQtyById.keys(), ...issueQtyByMenuId.keys()])
      );

      if (liveMenuIds.length > 0) {
        const { data: recipeVersions, error: menuRecipeErr } = await supabase
          .from("menu_recipe_version")
          .select(
            `
            menu_item_id,
            recipe_line (
              ingredient_id,
              quantity_per_serving
            )
          `
          )
          .in("menu_item_id", liveMenuIds)
          .eq("is_active", true);

        if (menuRecipeErr) {
          setError(`Gagal memuat resep menu live: ${menuRecipeErr.message}`);
          setLoading(false);
          return;
        }

        const versions = (recipeVersions ?? []) as unknown as {
          menu_item_id: string;
          recipe_line?: RecipeLineForCalc[];
        }[];

        for (const version of versions) {
          const soldQty = menuQtyById.get(version.menu_item_id) ?? 0;
          const issueQty = issueQtyByMenuId.get(version.menu_item_id) ?? 0;
          for (const recipeLine of version.recipe_line ?? []) {
            const perServing = Number(recipeLine.quantity_per_serving ?? 0);
            addToNumericMap(menuUsageLiveMap, recipeLine.ingredient_id, soldQty * perServing);
            addToNumericMap(issueUsageLiveMap, recipeLine.ingredient_id, issueQty * perServing);
          }
        }
      }
    }

    const liveRows = Array.from(ingredientMap.values())
      .map((ingredient) => {
        const officialStock = Number(ingredient.current_stock ?? 0);
        const receiveQty = receiveLiveMap.get(ingredient.id) ?? 0;
        const premixOutputQty = premixOutputLiveMap.get(ingredient.id) ?? 0;
        const premixUsageQty = premixUsageLiveMap.get(ingredient.id) ?? 0;
        const menuUsageQty = menuUsageLiveMap.get(ingredient.id) ?? 0;
        const issueUsageQty = issueUsageLiveMap.get(ingredient.id) ?? 0;
        const outQty = outLiveMap.get(ingredient.id) ?? 0;
        const opnameQty = opnameLiveMap.has(ingredient.id)
          ? opnameLiveMap.get(ingredient.id) ?? 0
          : null;
        const baseStock = opnameQty ?? officialStock;
        const movementStock =
          baseStock +
          receiveQty +
          premixOutputQty -
          premixUsageQty -
          menuUsageQty -
          issueUsageQty -
          outQty;
        const liveStock = movementStock;
        const minimumStock = Number(ingredient.minimum_stock ?? 0);
        const sourceCount = [
          receiveQty,
          premixOutputQty,
          premixUsageQty,
          menuUsageQty,
          issueUsageQty,
          outQty,
          opnameQty ?? 0,
        ].filter((value) => Math.abs(value) > 0).length;

        return {
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          department: ingredient.department,
          unit: ingredient.unit,
          officialStock,
          receiveQty,
          premixOutputQty,
          premixUsageQty,
          menuUsageQty,
          issueUsageQty,
          outQty,
          opnameQty,
          liveStock,
          liveDelta: liveStock - officialStock,
          minimumStock,
          status: isLowStockCondition(liveStock, minimumStock) ? "LOW STOCK" : "OK",
          sourceCount,
        } satisfies LiveStockRow;
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "LOW STOCK" ? -1 : 1;
        if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
        const deptCmp = a.department.localeCompare(b.department);
        if (deptCmp !== 0) return deptCmp;
        return a.ingredientName.localeCompare(b.ingredientName);
      });

    setLiveStockRows(liveRows);

    const liveRowByIngredientId = new Map(liveRows.map((row) => [row.ingredientId, row]));
    setInventorySummaryRows(
      summaryRows
        .map((row) => {
          const liveRow = liveRowByIngredientId.get(row.ingredient_id);
          const liveStock = liveRow?.liveStock ?? row.current_stock;
          return {
            ...row,
            live_stock: liveStock,
            live_delta: liveStock - row.current_stock,
            stock_status: isLowStockCondition(liveStock, row.minimum_stock) ? "LOW STOCK" : "OK",
          } satisfies InventorySummaryRow;
        })
        .sort((a, b) => {
          const deptCmp = a.department.localeCompare(b.department);
          if (deptCmp !== 0) return deptCmp;
          if (a.stock_status !== b.stock_status) return a.stock_status === "LOW STOCK" ? -1 : 1;
          return a.ingredient_name.localeCompare(b.ingredient_name);
        })
    );
    setLowStockInventoryRows(
      liveRows
        .filter((row) => row.status === "LOW STOCK")
        .map((row) => {
          const ingredient = ingredientMap.get(row.ingredientId);
          return {
            ingredientId: row.ingredientId,
            ingredientName: row.ingredientName,
            unit: row.unit,
            currentStock: row.liveStock,
            minimumStock: row.minimumStock,
            primarySupplierId: ingredient?.primary_supplier_id ?? null,
            primarySupplierName: ingredient?.supplier?.name ?? "",
            primarySupplierPhone: ingredient?.supplier?.phone_number ?? null,
          };
        })
    );

    const sessionIds = (sessionsInRange ?? []).map((s) => s.id);

    const outNoteByLedgerKey = new Map<string, string>();
    const outPhotoByLedgerKey = new Map<string, string>();

    if (sessionIds.length > 0) {
      const { data: outLinesRaw, error: outErr } = await supabase
        .from("worksheet_out_line")
        .select(
          `
          ingredient_id,
          quantity,
          note,
          photo_url,
          worksheet_session:session_id ( business_date, department )
        `
        )
        .in("session_id", sessionIds);

      if (outErr) {
        setError(outErr.message);
        setLoading(false);
        return;
      }

      for (const line of (outLinesRaw ?? []) as OutLineJoined[]) {
        const sessionRaw = line.worksheet_session;
        const session = Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw;
        if (!session) continue;

        const note = (line.note ?? "").trim();
        const qty = Number(line.quantity);
        if (qty <= 0 && !note) continue;

        const key = `${session.business_date}|${line.ingredient_id}`;
        if (note) {
          const existing = outNoteByLedgerKey.get(key);
          outNoteByLedgerKey.set(key, existing ? `${existing}; ${note}` : note);
        }
        if (line.photo_url) {
          const existingPhoto = outPhotoByLedgerKey.get(key);
          outPhotoByLedgerKey.set(
            key,
            existingPhoto ? `${existingPhoto}; ${line.photo_url}` : line.photo_url
          );
        }
      }

      const { data: receiveEntryRaw, error: receiveEntryErr } = await supabase
        .from("worksheet_receive_entry")
        .select(
          `
          id,
          ingredient_id,
          staff_id,
          quantity,
          created_at,
          ingredient:ingredient_id ( id, name, unit, purchase_unit ),
          staff:staff_id ( name ),
          worksheet_session:session_id ( business_date, department )
        `
        )
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false });

      if (receiveEntryErr) {
        setReceiveAuditRows([]);
      } else {
        const auditRows: ReceiveAuditRow[] = [];
        for (const entry of (receiveEntryRaw ?? []) as unknown as ReceiveAuditJoined[]) {
          const sessionRaw = entry.worksheet_session;
          const session = Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw;
          const ingredientRaw = entry.ingredient;
          const ingredient = Array.isArray(ingredientRaw) ? ingredientRaw[0] : ingredientRaw;
          const staffRaw = entry.staff;
          const staff = Array.isArray(staffRaw) ? staffRaw[0] : staffRaw;
          if (!session || !ingredient) continue;

          auditRows.push({
            id: entry.id,
            businessDate: session.business_date,
            department: session.department,
            ingredientName: ingredient.name,
            quantity: Number(entry.quantity ?? 0),
            unit: ingredient.purchase_unit?.trim() || ingredient.unit,
            staffName: staff?.name ?? "Staff lama / tidak tercatat",
            createdAt: entry.created_at,
          });
        }
        setReceiveAuditRows(auditRows);
      }

      const { data: menuIssueRaw, error: menuIssueErr } = await supabase
        .from("worksheet_menu_issue_line")
        .select(
          `
          id,
          menu_item_id,
          quantity,
          reason,
          note,
          photo_url,
          created_at,
          menu_item:menu_item_id ( id, menu_name, department, price ),
          worksheet_session:session_id ( business_date, department )
        `
        )
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false });

      if (menuIssueErr) {
        setMenuIssueRows([]);
      } else {
        const issueRows: MenuIssueReportRow[] = [];
        for (const issue of (menuIssueRaw ?? []) as unknown as MenuIssueJoined[]) {
          const sessionRaw = issue.worksheet_session;
          const session = Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw;
          const menuRaw = issue.menu_item;
          const menu = Array.isArray(menuRaw) ? menuRaw[0] : menuRaw;
          if (!session || !menu) continue;

          const reason = issue.reason || "other";
          issueRows.push({
            id: issue.id,
            businessDate: session.business_date,
            department: session.department,
            menuName: menu.menu_name,
            quantity: Number(issue.quantity ?? 0),
            reason,
            reasonLabel: MENU_ISSUE_REASON_LABEL[reason] ?? reason,
            note: issue.note ?? "",
            photoUrl: issue.photo_url ?? "",
            createdAt: issue.created_at,
          });
        }
        setMenuIssueRows(issueRows);
      }
    } else {
      setReceiveAuditRows([]);
      setMenuIssueRows([]);
    }

    const { data: ledgers, error: ledErr } = await supabase
      .from("stock_ledger")
      .select("*")
      .gte("business_date", rangeStart)
      .lte("business_date", rangeEnd)
      .order("business_date", { ascending: true });

    if (ledErr) {
      setError(ledErr.message);
      setLoading(false);
      return;
    }

    const exportLedger: StockLedgerExportRow[] = [];
    let spillageDetected = false;

    for (const ledger of ledgers ?? []) {
      const ingredient = ingredientMap.get(ledger.ingredient_id);
      if (!ingredient) continue;
      if (isSpillageExceeded(ledger)) spillageDetected = true;

      const noteKey = `${ledger.business_date}|${ledger.ingredient_id}`;
      const outNote = outNoteByLedgerKey.get(noteKey) ?? "";
      const outPhoto = outPhotoByLedgerKey.get(noteKey) ?? "";
      const firstOutPhoto = firstCsvUrl(outPhoto);

      exportLedger.push({
        business_date: ledger.business_date,
        ingredient_id: ledger.ingredient_id,
        ingredient_name: ingredient.name,
        department: ingredient.department,
        unit: ingredient.unit,
        opening_stock: Number(ledger.opening_stock),
        in_qty: Number(ledger.in_qty),
        theoretical_usage: Number(ledger.theoretical_usage),
        adjustment_qty: Number(ledger.adjustment_qty),
        closing_stock: Number(ledger.closing_stock),
        current_stock: Number(ingredient.current_stock ?? 0),
        minimum_stock: Number(ingredient.minimum_stock ?? 0),
        primary_supplier_id: ingredient.primary_supplier_id ?? null,
        primary_supplier_name: ingredient.supplier?.name ?? "",
        variance_qty: computeVarianceQty(ledger),
        Catatan_Out_Stock: outNote,
        Foto_Out_Stock: outPhoto,
        Bukti_Foto_Excel: excelHyperlinkFormula(firstOutPhoto),
      });
    }

    exportLedger.sort((a, b) => {
      const dateCmp = a.business_date.localeCompare(b.business_date);
      if (dateCmp !== 0) return dateCmp;
      return a.ingredient_name.localeCompare(b.ingredient_name);
    });

    setLedgerExportRows(exportLedger);
    setHasSpillageAlert(spillageDetected);

    const historyStart = addIsoDays(rangeEnd, -(RUNWAY_HISTORY_DAYS - 1));
    const { data: historyLedgers, error: histErr } = await supabase
      .from("stock_ledger")
      .select("ingredient_id, theoretical_usage, closing_stock, business_date")
      .gte("business_date", historyStart)
      .lte("business_date", rangeEnd);

    if (histErr) {
      setError(histErr.message);
      setLoading(false);
      return;
    }

    const usageByIngredient = new Map<string, { totalUsage: number; days: Set<string> }>();
    const closingByIngredient = new Map<string, number>();
    const dailyUsageByIngredient = new Map<string, Record<string, number>>();

    for (const row of historyLedgers ?? []) {
      const usage = Number(row.theoretical_usage);
      const dailyBucket = dailyUsageByIngredient.get(row.ingredient_id) ?? {};
      dailyBucket[row.business_date] = (dailyBucket[row.business_date] ?? 0) + usage;
      dailyUsageByIngredient.set(row.ingredient_id, dailyBucket);

      if (usage > 0) {
        const bucket = usageByIngredient.get(row.ingredient_id) ?? { totalUsage: 0, days: new Set<string>() };
        bucket.totalUsage += usage;
        bucket.days.add(row.business_date);
        usageByIngredient.set(row.ingredient_id, bucket);
      }
      if (row.business_date === rangeEnd) {
        closingByIngredient.set(row.ingredient_id, Number(row.closing_stock));
      }
    }

    const demandDateKeys = Array.from({ length: RUNWAY_HISTORY_DAYS }, (_, index) =>
      addIsoDays(rangeEnd, index - (RUNWAY_HISTORY_DAYS - 1))
    );
    const demandRows: SalesDemandRow[] = [];
    const liveBusinessDate = resolveBusinessDate();
    const runwayStockSource =
      rangeEnd === liveBusinessDate
        ? "stok live admin (ingredient.current_stock)"
        : `closing_stock stock_ledger ${formatBusinessDateLabel(rangeEnd)}`;
    setRunwaySource(
      `Pemakaian: stock_ledger.theoretical_usage ${formatBusinessDateLabel(historyStart)} s/d ${formatBusinessDateLabel(rangeEnd)}. Stok: ${runwayStockSource}.`
    );

    const resolveRunwayStock = (
      ingredientId: string,
      ingredient: IngredientWithPrimarySupplier
    ) => {
      const ledgerClosing = closingByIngredient.get(ingredientId);
      if (rangeEnd !== liveBusinessDate && ledgerClosing !== undefined) {
        return Number(ledgerClosing);
      }
      return Number(ingredient.current_stock ?? ledgerClosing ?? 0);
    };

    for (const ingredient of ingredientMap.values()) {
      const dailyUsage = dailyUsageByIngredient.get(ingredient.id) ?? {};
      const totalUsage = demandDateKeys.reduce((sum, date) => sum + (dailyUsage[date] ?? 0), 0);
      if (totalUsage <= 0) continue;

      const currentStock = resolveRunwayStock(ingredient.id, ingredient);
      const minimumStock = Number(ingredient.minimum_stock ?? 0);
      const averageDailyUsage = totalUsage / RUNWAY_HISTORY_DAYS;
      const peakDailyUsage = Math.max(...demandDateKeys.map((date) => dailyUsage[date] ?? 0));

      demandRows.push({
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        department: ingredient.department,
        unit: ingredient.unit,
        currentStock,
        minimumStock,
        dailyUsage,
        totalUsage,
        averageDailyUsage,
        peakDailyUsage,
        recommendedOrderQty: 0,
        supplierName: ingredient.supplier?.name ?? "",
      });
    }

    demandRows.sort((a, b) => b.totalUsage - a.totalUsage);
    setSalesDemandRows(demandRows);

    const runway: RunwayEntry[] = [];
    for (const ingredient of ingredientMap.values()) {
      const ingredientId = ingredient.id;
      const dailyUsage = dailyUsageByIngredient.get(ingredientId) ?? {};
      const totalUsage = demandDateKeys.reduce((sum, date) => sum + (dailyUsage[date] ?? 0), 0);
      if (totalUsage <= 0) continue;
      const avgDailyUsage = totalUsage / RUNWAY_HISTORY_DAYS;
      if (avgDailyUsage <= 0) continue;
      const currentStock = resolveRunwayStock(ingredientId, ingredient);
      const daysRemaining = Math.max(0, Math.floor(currentStock / avgDailyUsage));
      let urgency: RunwayEntry["urgency"] = "safe";
      if (daysRemaining <= 1) urgency = "critical";
      else if (daysRemaining <= 3) urgency = "warning";
      runway.push({
        ingredientName: ingredient.name,
        unit: ingredient.unit,
        currentStock,
        averageDailyUsage: avgDailyUsage,
        daysRemaining,
        urgency,
      });
    }

    runway.sort((a, b) => a.daysRemaining - b.daysRemaining);
    setRunwayEntries(runway.slice(0, 8));

    const dailyUsageById: Record<string, number> = {};
    const stockById: Record<string, { currentStock: number; minimumStock: number }> = {};

    for (const [ingredientId, usageBucket] of usageByIngredient) {
      const ingredient = ingredientMap.get(ingredientId);
      if (!ingredient) continue;

      if (usageBucket && usageBucket.days.size > 0) {
        const dailyUsage = dailyUsageByIngredient.get(ingredientId) ?? {};
        const totalUsage = demandDateKeys.reduce((sum, date) => sum + (dailyUsage[date] ?? 0), 0);
        dailyUsageById[ingredientId] = totalUsage / RUNWAY_HISTORY_DAYS;
      }

      stockById[ingredientId] = {
        currentStock: resolveRunwayStock(ingredientId, ingredient),
        minimumStock: Number(ingredient.minimum_stock ?? 0),
      };
    }

    for (const row of exportLedger) {
      if (row.business_date !== rangeEnd) continue;
      if (!dailyUsageById[row.ingredient_id] && row.theoretical_usage > 0) {
        dailyUsageById[row.ingredient_id] = row.theoretical_usage;
      }
      if (!stockById[row.ingredient_id]) {
        const ingredient = ingredientMap.get(row.ingredient_id);
        stockById[row.ingredient_id] = {
          currentStock: Number(ingredient?.current_stock ?? row.closing_stock),
          minimumStock: row.minimum_stock,
        };
      }
    }

    setIngredientDailyUsageById(dailyUsageById);
    setIngredientStockById(stockById);

    let soldLines: SoldLineJoined[] = [];

    if (sessionIds.length > 0) {
      const { data: soldData, error: soldErr } = await supabase
        .from("worksheet_sold_line")
        .select(
          `
          quantity_sold,
          menu_item:menu_item_id ( id, menu_name, department, price ),
          worksheet_session:session_id ( business_date, department )
        `
        )
        .in("session_id", sessionIds);

      if (soldErr) {
        setError(soldErr.message);
        setLoading(false);
        return;
      }

      soldLines = (soldData ?? []) as SoldLineJoined[];
    }

    const salesRows: SalesExportRow[] = [];
    const beverageAgg = new Map<string, { menu_name: string; quantity_sold: number }>();
    const foodAgg = new Map<string, { menu_name: string; quantity_sold: number }>();

    for (const line of soldLines) {
      const menuRaw = line.menu_item;
      const sessionRaw = line.worksheet_session;
      const menu = Array.isArray(menuRaw) ? menuRaw[0] : menuRaw;
      const session = Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw;
      if (!menu || !session) continue;

      const qty = Number(line.quantity_sold);
      if (qty <= 0) continue;

      const category = departmentToCategory(menu.department);
      const unitPrice = Number(menu.price);
      salesRows.push({
        session_date: session.business_date,
        menu_name: menu.menu_name,
        category,
        quantity_sold: qty,
        unit_price: unitPrice,
        total_gross_revenue: qty * unitPrice,
      });

      const targetMap = category === "beverage" ? beverageAgg : foodAgg;
      const existing = targetMap.get(menu.id);
      if (existing) {
        existing.quantity_sold += qty;
      } else {
        targetMap.set(menu.id, { menu_name: menu.menu_name, quantity_sold: qty });
      }
    }

    salesRows.sort((a, b) => {
      const dateCmp = a.session_date.localeCompare(b.session_date);
      if (dateCmp !== 0) return dateCmp;
      return a.menu_name.localeCompare(b.menu_name);
    });
    setSalesExportRows(salesRows);

    const eventLookupStart = addIsoDays(rangeStart, -30);
    const { data: eventRows, error: eventErr } = await supabase
      .from("demand_event")
      .select("*")
      .lte("start_date", rangeEnd)
      .gte("end_date", eventLookupStart)
      .order("start_date", { ascending: false });

    if (eventErr) {
      setDemandEvents([]);
    } else {
      const events = (eventRows ?? []) as DemandEventRow[];
      let eventSalesRows = salesRows;

      if (events.length > 0) {
        let eventSalesStart = rangeEnd;
        let eventSalesEnd = rangeStart;

        for (const event of events) {
          const durationDays = Math.max(
            1,
            Math.round((Date.parse(event.end_date) - Date.parse(event.start_date)) / 86400000) + 1
          );
          eventSalesStart = [eventSalesStart, addIsoDays(event.start_date, -durationDays)].sort()[0];
          eventSalesEnd = [eventSalesEnd, event.end_date].sort()[1];
        }

        const { data: eventSessions, error: eventSessionErr } = await supabase
          .from("worksheet_session")
          .select("id")
          .gte("business_date", eventSalesStart)
          .lte("business_date", eventSalesEnd);

        if (!eventSessionErr) {
          const eventSessionIds = (eventSessions ?? []).map((session) => session.id);
          if (eventSessionIds.length > 0) {
            const { data: eventSoldData, error: eventSoldErr } = await supabase
              .from("worksheet_sold_line")
              .select(
                `
                quantity_sold,
                menu_item:menu_item_id ( id, menu_name, department, price ),
                worksheet_session:session_id ( business_date, department )
              `
              )
              .in("session_id", eventSessionIds);

            if (!eventSoldErr) {
              eventSalesRows = [];
              for (const line of (eventSoldData ?? []) as SoldLineJoined[]) {
                const menuRaw = line.menu_item;
                const sessionRaw = line.worksheet_session;
                const menu = Array.isArray(menuRaw) ? menuRaw[0] : menuRaw;
                const session = Array.isArray(sessionRaw) ? sessionRaw[0] : sessionRaw;
                if (!menu || !session) continue;

                const qty = Number(line.quantity_sold);
                if (qty <= 0) continue;

                const unitPrice = Number(menu.price);
                eventSalesRows.push({
                  session_date: session.business_date,
                  menu_name: menu.menu_name,
                  category: departmentToCategory(menu.department),
                  quantity_sold: qty,
                  unit_price: unitPrice,
                  total_gross_revenue: qty * unitPrice,
                });
              }
            }
          } else {
            eventSalesRows = [];
          }
        }
      }

      const eventReports: DemandEventReportRow[] = events.map((event) => {
        const durationDays = Math.max(1, Math.round((Date.parse(event.end_date) - Date.parse(event.start_date)) / 86400000) + 1);
        const baselineStart = addIsoDays(event.start_date, -durationDays);
        const baselineEnd = addIsoDays(event.start_date, -1);
        const eventQty = eventSalesRows
          .filter((row) => row.session_date >= event.start_date && row.session_date <= event.end_date)
          .filter((row) => !event.department || (event.department === "bar" ? row.category === "beverage" : row.category === "food"))
          .reduce((sum, row) => sum + row.quantity_sold, 0);
        const baselineQty = eventSalesRows
          .filter((row) => row.session_date >= baselineStart && row.session_date <= baselineEnd)
          .filter((row) => !event.department || (event.department === "bar" ? row.category === "beverage" : row.category === "food"))
          .reduce((sum, row) => sum + row.quantity_sold, 0);
        const actualUpliftPct =
          baselineQty > 0 ? ((eventQty - baselineQty) / baselineQty) * 100 : null;

        return {
          ...event,
          baselineQty,
          eventQty,
          actualUpliftPct,
          effectiveness: computeEventEffectiveness({
            expectedUpliftPct: Number(event.expected_uplift_pct ?? 0),
            actualUpliftPct,
            eventEndDate: event.end_date,
          }),
        };
      });

      setDemandEvents(eventReports);
    }

    setTopBeverages(buildTopSellingList(beverageAgg));
    setTopFoods(buildTopSellingList(foodAgg));

    const { data: priceRows, error: priceErr } = await supabase
      .from("supplier_ingredient_price")
      .select(
        `
        ingredient_id,
        supplier_id,
        unit_price,
        valid_from,
        ingredient:ingredient_id ( name ),
        supplier:supplier_id ( id, name, phone_number )
      `
      )
      .order("valid_from", { ascending: false });

    if (priceErr) {
      setCogsAlerts([]);
      setPrimarySupplierByIngredientId({});
    } else {
      const alerts: CogsAlert[] = [];
      const pricesByIngredient = new Map<string, { name: string; prices: number[] }>();
      const primarySupplierMap: Record<string, PrimarySupplierAssignment> = {};

      for (const row of (priceRows ?? []) as SupplierPriceCogsJoinRow[]) {
        const ingRaw = row.ingredient;
        const ingName = Array.isArray(ingRaw) ? ingRaw[0]?.name : ingRaw?.name;
        if (!ingName) continue;
        const supplierRaw = row.supplier;
        const supplier = Array.isArray(supplierRaw) ? supplierRaw[0] : supplierRaw;
        if (supplier && !primarySupplierMap[row.ingredient_id]) {
          primarySupplierMap[row.ingredient_id] = {
            supplierId: supplier.id,
            supplierName: supplier.name,
            phoneNumber: supplier.phone_number ?? null,
            unitPrice: Number(row.unit_price) || 0,
          };
        }
        const bucket = pricesByIngredient.get(row.ingredient_id) ?? { name: ingName, prices: [] };
        if (bucket.prices.length < 2) {
          bucket.prices.push(Number(row.unit_price));
        }
        pricesByIngredient.set(row.ingredient_id, bucket);
      }

      setPrimarySupplierByIngredientId(primarySupplierMap);

      for (const bucket of pricesByIngredient.values()) {
        if (bucket.prices.length < 2) continue;
        const current = bucket.prices[0];
        const previous = bucket.prices[1];
        if (current <= previous) continue;
        const changePercent = ((current - previous) / previous) * 100;
        alerts.push({
          ingredientName: bucket.name,
          previousPrice: previous,
          currentPrice: current,
          changePercent,
        });
      }

      alerts.sort((a, b) => b.changePercent - a.changePercent);
      setCogsAlerts(alerts.slice(0, 6));
    }

    const { data: supplierRows, error: supErr } = await supabase
      .from("supplier")
      .select(
        "id, name, category, pic_name, min_order_amount, phone_number, link_url, is_active, created_at, updated_at"
      )
      .eq("is_active", true)
      .order("name");

    if (supErr) {
      setSuppliers([]);
    } else {
      setSuppliers(supplierRows ?? []);
    }

    setHasLoadedOnce(true);
    setLoading(false);
  }, [supabase, startDate, endDate, dateRangeInvalid, hasLoadedOnce]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, refreshKey]);

  useEffect(() => {
    if (!["overview", "demand", "inventory", "control"].includes(activeMonitoringTab)) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        setRefreshKey((key) => key + 1);
      }
    }, 5_000);

    return () => window.clearInterval(timer);
  }, [activeMonitoringTab]);

  useEffect(() => {
    if (getWibWeekdayIndex() === 4) {
      setCoverageDays(4);
    }
  }, []);

  const resolveRecommendedPoQuantity = useCallback(
    (ingredientId: string): number => {
      const dailyTarget = ingredientDailyUsageById[ingredientId] ?? 0;
      const stock = ingredientStockById[ingredientId] ?? { currentStock: 0, minimumStock: 0 };
      return computeRecommendedPoQuantity(
        dailyTarget * demandMultiplier,
        coverageDays,
        stock.minimumStock,
        stock.currentStock
      );
    },
    [coverageDays, demandMultiplier, ingredientDailyUsageById, ingredientStockById]
  );

  useEffect(() => {
    if (!selectedSupplierId) {
      setSupplierCatalog([]);
      setPoLines([]);
      return;
    }
    void loadSupplierCatalog(selectedSupplierId);
    setPoLines([]);
  }, [selectedSupplierId, loadSupplierCatalog]);

  useEffect(() => {
    if (poLines.length === 0) return;
    setPoLines((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        const recommended = formatInitialPoLineQuantity(resolveRecommendedPoQuantity(line.ingredientId));
        if (line.quantity === recommended) return line;
        changed = true;
        return { ...line, quantity: recommended };
      });
      return changed ? next : prev;
    });
  }, [coverageDays, ingredientDailyUsageById, ingredientStockById, resolveRecommendedPoQuantity, poLines.length]);

  const csvDateSuffix = `${startDate}_to_${endDate}`;

  const handleExportInventorySummary = async () => {
    const rows = normalizedSearch ? filteredInventorySummaryRows : inventorySummaryRows;
    await downloadInventorySummaryXlsx(`rekap-stok-akumulasi-${resolveBusinessDate()}.xlsx`, rows);
  };

  const handleExportInventory = async () => {
    const rows = normalizedSearch ? filteredLedgerRows : ledgerExportRows;
    await downloadInventoryXlsx(`inventory-ledger-${csvDateSuffix}.xlsx`, rows);
  };

  const handleExportDemandPlanning = async () => {
    await downloadDemandPlanningXlsx({
      filename: `demand-planning-7hari-${demandDateKeys[0]}_to_${
        demandDateKeys[demandDateKeys.length - 1]
      }.xlsx`,
      rows: demandPlanningRows,
      dateKeys: demandDateKeys,
      scenarioLabel: DEMAND_SCENARIO_LABEL[demandScenario],
      multiplier: demandMultiplier,
      coverageDays,
    });
  };

  const handleExportSales = async () => {
    const rows = normalizedSearch ? filteredSalesRows : salesExportRows;
    await downloadSalesXlsx(`laporan-penjualan-${csvDateSuffix}.xlsx`, rows);
  };

  const handleStartDateChange = (value: string) => {
    setStartDate(value);
    if (endDate && value > endDate) setEndDate(value);
  };

  const handleEndDateChange = (value: string) => {
    setEndDate(value);
    if (startDate && value < startDate) setStartDate(value);
  };

  const handleAddPoLine = (catalogItem: SupplierPriceCatalog) => {
    const recommendedQty = resolveRecommendedPoQuantity(catalogItem.ingredient.id);
    setPoLines((prev) => {
      if (prev.some((line) => line.ingredientId === catalogItem.ingredient.id)) return prev;
      return [
        ...prev,
        {
          ingredientId: catalogItem.ingredient.id,
          ingredientName: catalogItem.ingredient.name,
          unit: catalogItem.ingredient.unit,
          quantity: formatInitialPoLineQuantity(recommendedQty),
          unitPrice: Number(catalogItem.unit_price),
        },
      ];
    });
  };

  const handleGenerateDemandPo = () => {
    if (!selectedSupplierId || supplierCatalog.length === 0) {
      setPoError("Pilih supplier yang punya katalog bahan terlebih dahulu.");
      return;
    }

    const catalogByIngredientId = new Map(
      supplierCatalog.map((item) => [item.ingredient.id, item])
    );
    const recommendedLines = demandPlanningRows
      .map((row) => {
        const catalogItem = catalogByIngredientId.get(row.ingredientId);
        if (!catalogItem || row.recommendedOrderQty <= 0) return null;
        return {
          ingredientId: row.ingredientId,
          ingredientName: row.ingredientName,
          unit: row.unit,
          quantity: formatInitialPoLineQuantity(row.recommendedOrderQty),
          unitPrice: Number(catalogItem.unit_price),
        } satisfies PoLineDraft;
      })
      .filter((line): line is PoLineDraft => Boolean(line));

    if (recommendedLines.length === 0) {
      setPoError("Belum ada rekomendasi demand untuk supplier ini.");
      return;
    }

    setPoLines(recommendedLines);
    setPoError(null);
    setPoSuccess(`${recommendedLines.length} bahan dari Demand Planning masuk ke Draft PO.`);
  };

  const handleEventFormChange = (patch: Partial<DemandEventForm>) => {
    setEventForm((prev) => {
      const next = { ...prev, ...patch };
      if (next.startDate > next.endDate) next.endDate = next.startDate;
      return next;
    });
  };

  const handleSaveDemandEvent = async () => {
    if (!supabase || !canEdit) return;
    const title = eventForm.title.trim();
    if (!title) {
      setEventNotice({ message: "Nama event wajib diisi.", variant: "error" });
      return;
    }

    const staff = getStaffSession();
    setEventSaving(true);
    setEventNotice(null);

    const { error: insertErr } = await supabase.from("demand_event").insert({
      title,
      event_type: eventForm.eventType,
      department: eventForm.department || null,
      start_date: eventForm.startDate,
      end_date: eventForm.endDate,
      expected_uplift_pct: parseOptionalPercent(eventForm.expectedUpliftPct),
      notes: eventForm.notes.trim(),
      created_by_staff_id: staff?.id ?? null,
    });

    setEventSaving(false);

    if (insertErr) {
      setEventNotice({ message: insertErr.message, variant: "error" });
      return;
    }

    setEventNotice({ message: "Demand event tersimpan.", variant: "success" });
    setEventForm((prev) => ({
      ...prev,
      title: "",
      notes: "",
    }));
    setRefreshKey((k) => k + 1);
  };

  const handleSyncNationalHolidays = async () => {
    if (!supabase || !canEdit) return;

    const years = Array.from(
      new Set(
        [startDate, endDate, eventForm.startDate, eventForm.endDate]
          .map((value) => Number(value.slice(0, 4)))
          .filter((year) => Number.isInteger(year) && year >= 2000 && year <= 2100)
      )
    );

    if (years.length === 0) {
      setEventNotice({ message: "Tahun periode belum valid untuk sync libur nasional.", variant: "error" });
      return;
    }

    const staff = getStaffSession();
    setHolidaySyncing(true);
    setEventNotice(null);

    try {
      const holidayRows: Array<{
        title: string;
        event_type: string;
        department: null;
        start_date: string;
        end_date: string;
        expected_uplift_pct: number;
        notes: string;
        source: string;
        external_id: string;
        created_by_staff_id: string | null;
      }> = [];

      for (const year of years) {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/ID`);
        if (!response.ok) throw new Error(`Gagal mengambil libur nasional ${year}.`);

        const holidays = (await response.json()) as PublicHolidayApiRow[];
        for (const holiday of holidays) {
          const title = (holiday.localName || holiday.name || "Libur Nasional Indonesia").trim();
          if (!holiday.date || !title) continue;

          holidayRows.push({
            title,
            event_type: "national_holiday",
            department: null,
            start_date: holiday.date,
            end_date: holiday.date,
            expected_uplift_pct: 0,
            notes: "Auto-sync libur nasional Indonesia. Isi event manual terpisah jika ada target uplift khusus.",
            source: "nager_date",
            external_id: `ID:${holiday.date}:${title}`,
            created_by_staff_id: staff?.id ?? null,
          });
        }
      }

      if (holidayRows.length === 0) {
        setEventNotice({ message: "Tidak ada data libur nasional yang ditemukan.", variant: "error" });
        return;
      }

      const { data: existingRows, error: existingErr } = await supabase
        .from("demand_event")
        .select("external_id")
        .in(
          "external_id",
          holidayRows.map((row) => row.external_id)
        );

      if (existingErr) throw existingErr;

      const existingIds = new Set(
        ((existingRows ?? []) as Pick<DemandEventRow, "external_id">[])
          .map((row) => row.external_id)
          .filter((value): value is string => Boolean(value))
      );
      const rowsToInsert = holidayRows.filter((row) => !existingIds.has(row.external_id));

      if (rowsToInsert.length > 0) {
        const { error: insertErr } = await supabase.from("demand_event").insert(rowsToInsert);
        if (insertErr) throw insertErr;
      }

      setEventNotice({
        message:
          rowsToInsert.length === 0
            ? "Libur nasional sudah tersinkron, tidak ada data baru."
            : `${rowsToInsert.length} libur nasional tersinkron ke Demand Event.`,
        variant: "success",
      });
      setRefreshKey((key) => key + 1);
    } catch (err) {
      setEventNotice({
        message: err instanceof Error ? err.message : "Gagal sync libur nasional.",
        variant: "error",
      });
    } finally {
      setHolidaySyncing(false);
    }
  };

  const handleCoverageDaysChange = (next: number) => {
    if (!Number.isFinite(next)) return;
    setCoverageDays(Math.max(1, Math.min(31, Math.round(next))));
  };

  const handleUpdatePoLineQty = (ingredientId: string, quantity: string) => {
    setPoLines((prev) =>
      prev.map((line) => (line.ingredientId === ingredientId ? { ...line, quantity } : line))
    );
  };

  const handleRemovePoLine = (ingredientId: string) => {
    setPoLines((prev) => prev.filter((line) => line.ingredientId !== ingredientId));
  };

  const handleSendPO = async () => {
    if (!selectedSupplier || thursdayOrderClosed || poSubmitting) return;

    setPoError(null);
    setPoSuccess(null);

    const supplierPhone = selectedSupplier.phone_number;
    const supplierName = selectedSupplier.name;
    const formattedDate = formatPoDateLocal();

    const cartItems = poLines
      .map((line) => {
        const quantity = parsePoQuantity(line.quantity);
        const unitPrice = Number(line.unitPrice) || 0;
        return {
          ingredientId: line.ingredientId,
          ingredientName: line.ingredientName ?? "",
          unit: line.unit ?? "",
          quantity,
          unitPrice,
          lineTotal: quantity * unitPrice,
        };
      })
      .filter((line) => line.quantity > 0);

    const hasManualCart = cartItems.length > 0;
    const hasLowStock = selectedSupplierLowStockGroups.length > 0;

    if (poLines.length > 0 && !hasManualCart) {
      setPoError("Qty bahan di Draft Purchase Order harus lebih dari 0 sebelum dikirim ke WhatsApp.");
      return;
    }

    if (!hasManualCart && !hasLowStock) {
      setPoError(
        "Belum ada bahan low stock untuk supplier ini. Cek Primary Supplier di Master Ingredients atau tambahkan bahan manual dari katalog."
      );
      return;
    }

    let waTextArray: string[] = [];

    if (hasManualCart) {
      const totalAmount = cartItems.reduce((sum, line) => sum + line.lineTotal, 0);
      waTextArray = [
        "*PURCHASE ORDER - ARTHA SYSTEM*",
        "---------------------------------------------",
        `*Tanggal:* ${formattedDate}`,
        `*Kepada:* ${supplierName}`,
        "",
        "*DAFTAR PESANAN:*",
        ...cartItems.map(
          (line, i) =>
            `${i + 1}. ${line.ingredientName} - ${formatPoWaQuantity(line.quantity)} ${line.unit}`
        ),
        "",
        `*Total Nilai Pesanan:* ${formatRupiahWaPlain(totalAmount)}`,
        "",
        "Mohon segera diproses dan dikirimkan beserta nota/invoice.",
        "Terima kasih,",
        "*Tim Operasional - Artha System*",
        "---------------------------------------------",
      ];
    } else {
      const lowStockLines = selectedSupplierLowStockGroups.flatMap((group) => group.lines);
      waTextArray = [
        "*PURCHASE ORDER - AUTO REPLENISHMENT*",
        "---------------------------------------------",
        `*Tanggal:* ${formattedDate}`,
        `*Kepada:* ${supplierName}`,
        "",
        "*DAFTAR PESANAN (URGENT LOW STOCK):*",
        ...lowStockLines.map(
          (line, index) =>
            `${index + 1}. ${line.ingredientName} - ${formatPoWaQuantity(line.quantity)} ${line.unit}`
        ),
        "",
        "*Total Nilai Pesanan:* Menunggu Konfirmasi Harga",
        "---------------------------------------------",
      ];
    }

    if (!isSupplierWhatsAppPhoneConfigured(supplierPhone)) {
      window.alert(SUPPLIER_WHATSAPP_NOT_CONFIGURED_MSG);
      return;
    }

    openSupplierWhatsAppChat(supplierPhone, waTextArray.join("\n"));

    if (cartItems.length > 0) {
      const totalAmount = cartItems.reduce((sum, line) => sum + line.lineTotal, 0);

      if (!supabase) {
        setPoSuccess(`PO WhatsApp dibuka untuk ${supplierName} — ${formatRupiah(totalAmount)}`);
        return;
      }

      const staff = getStaffSession();
      if (!staff) {
        setPoError("Session admin/OPS tidak ditemukan.");
        return;
      }

      setPoSubmitting(true);

      const linesPayload = cartItems.map((line) => ({
        ingredient_id: line.ingredientId,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        line_total: line.lineTotal,
      }));

      const { data: poHeader, error: poErr } = await supabase
        .from("purchase_order")
        .insert({
          supplier_id: selectedSupplier.id,
          status: "SUBMITTED",
          total_amount: totalAmount,
          created_by_staff_id: staff.id,
          submitted_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (poErr || !poHeader) {
        setPoError(poErr?.message ?? "Gagal membuat purchase order.");
        setPoSubmitting(false);
        return;
      }

      const { error: lineErr } = await supabase.from("purchase_order_line").insert(
        linesPayload.map((line) => ({
          purchase_order_id: poHeader.id,
          ingredient_id: line.ingredient_id,
          quantity: line.quantity,
          unit_price: line.unit_price,
          line_total: line.line_total,
        }))
      );

      if (lineErr) {
        setPoError(lineErr.message);
        setPoSubmitting(false);
        return;
      }

      setPoSuccess(`PO berhasil dicatat ke ${supplierName} — ${formatRupiah(totalAmount)}`);
      setPoLines([]);
      setPoSubmitting(false);
      return;
    }

    if (hasLowStock) {
      setPoSuccess(
        `PO Auto Replenishment (${totalSelectedLowStockLines} bahan) dibuka untuk ${supplierName} via WhatsApp.`
      );
      return;
    }
  };

  const handleSendSupplierLowStockPO = async (
    supplier: SupplierRow,
    orderGroup: LowStockOrderGroup | null
  ) => {
    if (!orderGroup || orderGroup.lines.length === 0 || thursdayOrderClosed || poSubmitting) return;

    setPoError(null);
    setPoSuccess(null);

    if (!isSupplierWhatsAppPhoneConfigured(supplier.phone_number)) {
      window.alert(SUPPLIER_WHATSAPP_NOT_CONFIGURED_MSG);
      return;
    }

    const formattedDate = formatPoDateLocal();
    const waTextArray = [
      "*PURCHASE ORDER - AUTO REPLENISHMENT*",
      "---------------------------------------------",
      `*Tanggal:* ${formattedDate}`,
      `*Kepada:* ${supplier.name}`,
      "",
      "*DAFTAR PESANAN (LOW STOCK):*",
      ...orderGroup.lines.map(
        (line, index) =>
          `${index + 1}. ${line.ingredientName} - ${formatPoWaQuantity(line.quantity)} ${line.unit}`
      ),
      "",
      "*Catatan:* Pesanan ini otomatis dibuat dari bahan yang menyentuh batas minimum stock di Artha System.",
      "---------------------------------------------",
    ];

    openSupplierWhatsAppChat(supplier.phone_number, waTextArray.join("\n"));
    setPoSuccess(
      `${orderGroup.lines.length} bahan low stock dikirim ke WhatsApp ${supplier.name}.`
    );
  };

  return (
    <div className="space-y-6">
      <nav
        className="sticky top-0 z-20 -mx-1 flex gap-2 overflow-x-auto border-b border-zinc-800 bg-zinc-900/95 px-1 pb-3 pt-1 backdrop-blur"
        aria-label="Monitoring tabs"
      >
        {MONITORING_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeMonitoringTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveMonitoringTab(tab.id)}
              className={`flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold transition sm:px-4 ${
                active
                  ? "border-cyan-300 bg-cyan-400 text-zinc-950 shadow-lg shadow-cyan-950/30"
                  : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      {activeMonitoringTab === "control" ? (
      <section className="grid gap-6 lg:grid-cols-2">
        <WorksheetEditRequestPanel
          supabase={supabase}
          canEdit={canEdit}
          onChanged={() => setRefreshKey((key) => key + 1)}
        />
        <OpnameApprovalPanel />
        <StockAdjustmentPanel />
      </section>
      ) : null}

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 xl:flex-row xl:items-center">
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200">
          <span className="h-2 w-2 rounded-full bg-cyan-300" />
          {dateRangeLabel}
        </div>

        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Live search menu atau bahan baku…"
            className="min-h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 py-2.5 pl-10 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
            aria-label="Pencarian live dashboard monitoring"
          />
          {searchTerm.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-zinc-800 hover:text-slate-100"
              aria-label="Hapus pencarian"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
          <CalendarDays className="h-4 w-4 text-cyan-300" aria-hidden />
          <label className="sr-only" htmlFor="monitoring-start-date">
            Tanggal mulai
          </label>
          <input
            id="monitoring-start-date"
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className="min-h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
          />
          <span className="text-xs text-slate-500">s/d</span>
          <label className="sr-only" htmlFor="monitoring-end-date">
            Tanggal akhir
          </label>
          <input
            id="monitoring-end-date"
            type="date"
            value={endDate}
            onChange={(e) => handleEndDateChange(e.target.value)}
            className="min-h-9 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
          />
        </div>

        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-200 transition hover:border-cyan-400/60 hover:text-cyan-200"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {dateRangeInvalid && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Rentang tanggal tidak valid. Pastikan tanggal mulai tidak melebihi tanggal akhir.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      {activeMonitoringTab === "sales" ? (
        <MenuMovementPanel startDate={startDate} endDate={endDate} refreshKey={refreshKey} />
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat command center…
        </div>
      ) : (
        <>
          {activeMonitoringTab === "overview" ? (
            <section className="rounded-xl border border-slate-800 bg-zinc-900/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-semibold text-slate-100">Prioritas Hari Ini</h3>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {priorityItems.map((item, index) => (
                  <div
                    key={`${item.title}-${index}`}
                    className={`rounded-lg border px-3 py-2.5 ${
                      item.tone === "critical"
                        ? "border-red-800/60 bg-red-950/20"
                        : item.tone === "warning"
                          ? "border-amber-700/50 bg-amber-950/20"
                          : "border-slate-800 bg-zinc-950/60"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="mt-1 text-xs leading-snug text-slate-400">{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {activeMonitoringTab === "overview" || activeMonitoringTab === "control" ? (
            <>
          <section className="grid gap-3 sm:grid-cols-3">
            <StatusIndicator
              label="Spillage Alert"
              active={hasSpillageAlert}
              activeClassName="bg-red-500"
              detail={
                hasSpillageAlert
                  ? "Pemakaian rusak/basi staf melebihi ambang 15% pemakaian teori dalam rentang terpilih."
                  : isSingleDayRange
                    ? "Tidak ada anomali spillage signifikan hari ini."
                    : "Tidak ada anomali spillage signifikan dalam rentang terpilih."
              }
            />
            <StatusIndicator
              label="Live COGS Monitor"
              active={cogsAlerts.length > 0}
              activeClassName="bg-amber-500"
              detail={
                cogsAlerts.length > 0
                  ? `${cogsAlerts.length} bahan mengalami kenaikan harga supplier.`
                  : "HPP stabil — tidak ada lonjakan harga terdeteksi."
              }
            />
            <StatusIndicator
              label="Stock Runway"
              active={runwayEntries.some((r) => r.urgency !== "safe")}
              activeClassName="bg-orange-500"
              detail={
                runwayEntries.length > 0
                  ? runwayEntries
                      .slice(0, 3)
                      .map((r) => {
                        const tone =
                          r.urgency === "critical"
                            ? "kritis"
                            : r.urgency === "warning"
                              ? "waspada"
                              : "aman";
                        return `${r.ingredientName} ${tone} ${r.daysRemaining} hari`;
                      })
                      .join(" · ")
                  : "Belum cukup data historis untuk estimasi ketahanan stok."
              }
            />
          </section>

          {cogsAlerts.length > 0 && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-amber-200">
                <TrendingUp className="h-4 w-4" />
                <h3 className="text-sm font-semibold">Fluktuasi HPP — Kenaikan Harga Supplier</h3>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {cogsAlerts.map((alert) => (
                  <li
                    key={alert.ingredientName}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-zinc-950/80 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-200">{alert.ingredientName}</span>
                    <span className="tabular-nums text-amber-300">
                      {formatRupiah(alert.previousPrice)} → {formatRupiah(alert.currentPrice)} (
                      +{alert.changePercent.toFixed(1)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {runwayEntries.length > 0 && (
            <section className="rounded-xl border border-slate-800 bg-zinc-900/50 p-4">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-200">Stock Runway Calculator</h3>
                  <span className="text-xs text-slate-500">(per {formatBusinessDateLabel(endDate)})</span>
                </div>
                <p className="text-xs text-slate-500">
                  {runwaySource || "Sumber belum tersedia."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {runwayEntries.map((entry) => (
                  <span
                    key={entry.ingredientName}
                    className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                      entry.urgency === "critical"
                        ? "bg-red-500/15 text-red-300 ring-red-500/40"
                        : entry.urgency === "warning"
                          ? "bg-amber-500/15 text-amber-200 ring-amber-500/40"
                          : "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30"
                    }`}
                  >
                    <span className="font-semibold">{entry.ingredientName}</span>{" "}
                    {entry.urgency === "safe"
                      ? `aman ${entry.daysRemaining} hari`
                      : entry.urgency === "warning"
                        ? `waspada sisa ${entry.daysRemaining} hari`
                        : `kritis sisa ${entry.daysRemaining} hari`}
                    <span className="ml-1 opacity-80">
                      · stok {formatQtyWithUnit(entry.currentStock, entry.unit)} · avg{" "}
                      {formatQtyWithUnit(entry.averageDailyUsage, entry.unit)}/hari
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}
          {activeMonitoringTab === "control" ? (
            <section className="rounded-xl border border-slate-800 bg-zinc-900/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-300" />
                  <h3 className="text-sm font-semibold text-slate-200">Remake / Complaint Report</h3>
                </div>
                <span className="rounded-full bg-zinc-950 px-2.5 py-0.5 text-xs tabular-nums text-slate-400">
                  {filteredMenuIssueRows.length} catatan
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead className="bg-zinc-950 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Tanggal</th>
                      <th className="px-3 py-2 font-medium">Dept</th>
                      <th className="px-3 py-2 font-medium">Menu</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 font-medium">Alasan</th>
                      <th className="px-3 py-2 font-medium">Catatan</th>
                      <th className="px-3 py-2 font-medium">Foto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredMenuIssueRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                          Belum ada remake / complaint dalam rentang ini.
                        </td>
                      </tr>
                    ) : (
                      filteredMenuIssueRows.slice(0, 40).map((row) => (
                        <tr key={row.id} className="hover:bg-zinc-950/50">
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                            {formatBusinessDateLabel(row.businessDate)}
                          </td>
                          <td className="px-3 py-2 capitalize text-slate-400">{row.department}</td>
                          <td className="px-3 py-2 text-slate-100">{row.menuName}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-200">
                            {formatQtyId(row.quantity)}
                          </td>
                          <td className="px-3 py-2 text-amber-200">{row.reasonLabel}</td>
                          <td className="max-w-xs px-3 py-2 text-slate-400">
                            {row.note || "-"}
                          </td>
                          <td className="px-3 py-2">
                            {row.photoUrl ? (
                              <a
                                href={row.photoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-indigo-300 underline decoration-indigo-500/40 underline-offset-4"
                              >
                                Lihat
                              </a>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
            </>
          ) : null}

          {activeMonitoringTab === "overview" || activeMonitoringTab === "sales" ? (
          <section className="grid gap-4 lg:grid-cols-2">
            <TopSellingWidget
              title="Top 5 Best-Selling Beverages"
              items={filteredTopBeverages}
              unitLabel="cup"
              barColorClass="bg-indigo-500"
              emptyLabel={
                isSingleDayRange
                  ? "Belum ada penjualan minuman tercatat hari ini."
                  : "Belum ada penjualan minuman dalam rentang tanggal terpilih."
              }
            />
            <TopSellingWidget
              title="Top 5 Best-Selling Foods"
              items={filteredTopFoods}
              unitLabel="porsi"
              barColorClass="bg-amber-500"
              emptyLabel={
                isSingleDayRange
                  ? "Belum ada penjualan makanan tercatat hari ini."
                  : "Belum ada penjualan makanan dalam rentang tanggal terpilih."
              }
            />
          </section>
          ) : null}

          {activeMonitoringTab === "demand" ? (
            <section className="rounded-xl border border-slate-800 bg-zinc-900/60 p-4">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">Demand Event Calendar</h3>
                  <p className="text-xs text-slate-500">
                    Catat promo/KOL/libur, lalu cek expected uplift vs actual uplift setelah event berjalan.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={holidaySyncing}
                      onClick={() => void handleSyncNationalHolidays()}
                      className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-700 bg-zinc-950 px-3 text-xs font-semibold text-slate-200 hover:border-indigo-400 hover:text-indigo-200 disabled:opacity-50"
                    >
                      {holidaySyncing ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />
                      )}
                      {holidaySyncing ? "Sync..." : "Sync Libur Nasional"}
                    </button>
                  ) : null}
                  <span className="rounded-full bg-zinc-950 px-2.5 py-0.5 text-xs tabular-nums text-slate-400">
                    {filteredDemandEvents.length} event
                  </span>
                </div>
              </div>

              {eventNotice ? (
                <p
                  className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
                    eventNotice.variant === "success"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      : "border-red-500/40 bg-red-500/10 text-red-300"
                  }`}
                >
                  {eventNotice.message}
                </p>
              ) : null}

              {canEdit ? (
                <div className="mb-4 grid gap-3 rounded-xl border border-slate-800 bg-zinc-950/60 p-3 lg:grid-cols-[1.2fr_0.9fr_0.8fr_0.8fr_0.7fr]">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Nama event</span>
                    <input
                      value={eventForm.title}
                      onChange={(e) => handleEventFormChange({ title: e.target.value })}
                      placeholder="Contoh: KOL TikTok weekend"
                      className="min-h-10 w-full rounded-lg border border-slate-800 bg-zinc-900 px-3 text-sm text-slate-100 placeholder:text-slate-600"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Tipe</span>
                    <select
                      value={eventForm.eventType}
                      onChange={(e) => handleEventFormChange({ eventType: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-slate-800 bg-zinc-900 px-3 text-sm text-slate-100"
                    >
                      {Object.entries(DEMAND_EVENT_TYPE_LABEL).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Dept target</span>
                    <select
                      value={eventForm.department}
                      onChange={(e) =>
                        handleEventFormChange({ department: e.target.value as "" | Department })
                      }
                      className="min-h-10 w-full rounded-lg border border-slate-800 bg-zinc-900 px-3 text-sm text-slate-100"
                    >
                      <option value="">Semua</option>
                      <option value="bar">Bar</option>
                      <option value="kitchen">Kitchen</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Mulai</span>
                    <input
                      type="date"
                      value={eventForm.startDate}
                      onChange={(e) => handleEventFormChange({ startDate: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-slate-800 bg-zinc-900 px-3 text-sm text-slate-100"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">Selesai</span>
                    <input
                      type="date"
                      value={eventForm.endDate}
                      onChange={(e) => handleEventFormChange({ endDate: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-slate-800 bg-zinc-900 px-3 text-sm text-slate-100"
                    />
                  </label>
                  <label className="block lg:col-span-2">
                    <span className="mb-1 block text-xs text-slate-500">Expected uplift %</span>
                    <input
                      type="number"
                      value={eventForm.expectedUpliftPct}
                      onChange={(e) => handleEventFormChange({ expectedUpliftPct: e.target.value })}
                      className="min-h-10 w-full rounded-lg border border-slate-800 bg-zinc-900 px-3 text-sm tabular-nums text-slate-100"
                    />
                  </label>
                  <label className="block lg:col-span-2">
                    <span className="mb-1 block text-xs text-slate-500">Catatan</span>
                    <input
                      value={eventForm.notes}
                      onChange={(e) => handleEventFormChange({ notes: e.target.value })}
                      placeholder="Contoh: fokus beverage, Reels IG, voucher 20%"
                      className="min-h-10 w-full rounded-lg border border-slate-800 bg-zinc-900 px-3 text-sm text-slate-100 placeholder:text-slate-600"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={eventSaving}
                    onClick={() => void handleSaveDemandEvent()}
                    className="min-h-10 self-end rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {eventSaving ? "Menyimpan..." : "Simpan Event"}
                  </button>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[940px] text-left text-sm">
                  <thead className="bg-zinc-950 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Event</th>
                      <th className="px-3 py-2 font-medium">Periode</th>
                      <th className="px-3 py-2 font-medium">Dept</th>
                      <th className="px-3 py-2 text-right font-medium">Target</th>
                      <th className="px-3 py-2 text-right font-medium">Baseline</th>
                      <th className="px-3 py-2 text-right font-medium">Saat Event</th>
                      <th className="px-3 py-2 text-right font-medium">Actual</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredDemandEvents.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                          Belum ada demand event dalam rentang ini.
                        </td>
                      </tr>
                    ) : (
                      filteredDemandEvents.slice(0, 20).map((event) => (
                        <tr key={event.id} className="hover:bg-zinc-950/50">
                          <td className="px-3 py-2">
                            <span className="flex flex-col">
                              <span className="font-medium text-slate-100">{event.title}</span>
                              <span className="text-xs text-slate-500">
                                {DEMAND_EVENT_TYPE_LABEL[event.event_type] ?? event.event_type}
                                {event.notes ? ` · ${event.notes}` : ""}
                              </span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                            {formatBusinessDateLabel(event.start_date)} s/d {formatBusinessDateLabel(event.end_date)}
                          </td>
                          <td className="px-3 py-2 capitalize text-slate-400">{event.department ?? "semua"}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-indigo-200">
                            +{Number(event.expected_uplift_pct).toFixed(0)}%
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                            {formatQtyId(event.baselineQty)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-100">
                            {formatQtyId(event.eventQty)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-emerald-200">
                            {event.actualUpliftPct === null ? "-" : `${event.actualUpliftPct.toFixed(1)}%`}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                event.effectiveness === "effective"
                                  ? "bg-emerald-500/15 text-emerald-300"
                                  : event.effectiveness === "underperform"
                                    ? "bg-red-500/15 text-red-300"
                                    : event.effectiveness === "pending"
                                      ? "bg-indigo-500/15 text-indigo-300"
                                      : "bg-slate-500/15 text-slate-300"
                              }`}
                            >
                              {event.effectiveness === "effective"
                                ? "Efektif"
                                : event.effectiveness === "underperform"
                                  ? "Kurang efektif"
                                  : event.effectiveness === "pending"
                                    ? "Berjalan"
                                    : "Netral"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {activeMonitoringTab === "demand" ? (
          <section className="rounded-xl border border-slate-800 bg-zinc-900/60 p-4">
            <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-100">
                  Sales-Based Demand Planning
                </h3>
                <p className="text-xs text-slate-500">
                  Pemakaian bahan 7 hari terakhir dihitung dari sales menu × resep. Rekomendasi order
                  mengikuti skenario demand dan target coverage PO.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(DEMAND_SCENARIO_LABEL) as DemandScenario[]).map((scenario) => {
                  const active = demandScenario === scenario;
                  return (
                    <button
                      key={scenario}
                      type="button"
                      onClick={() => setDemandScenario(scenario)}
                      className={`min-h-10 rounded-lg border px-3 text-sm font-semibold transition ${
                        active
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "border-slate-700 bg-zinc-950 text-slate-300 hover:border-indigo-500/60 hover:text-indigo-200"
                      }`}
                    >
                      {DEMAND_SCENARIO_LABEL[scenario]} ×
                      {DEMAND_SCENARIO_MULTIPLIER[scenario].toLocaleString("id-ID")}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => void handleExportDemandPlanning()}
                  disabled={demandPlanningRows.length === 0}
                  className="flex min-h-10 items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-600/15 px-3 text-sm font-semibold text-emerald-200 hover:bg-emerald-600/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  Export Demand
                </button>
              </div>
            </div>

            <div className="mb-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-800 bg-zinc-950/70 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Basis data</p>
                <p className="mt-1 text-sm font-semibold text-slate-200">
                  {formatBusinessDateLabel(demandDateKeys[0])} s/d{" "}
                  {formatBusinessDateLabel(demandDateKeys[demandDateKeys.length - 1])}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-zinc-950/70 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Skenario</p>
                <p className="mt-1 text-sm font-semibold text-indigo-200">
                  {DEMAND_SCENARIO_LABEL[demandScenario]} ×{demandMultiplier.toLocaleString("id-ID")}
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-zinc-950/70 px-3 py-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Coverage</p>
                <p className="mt-1 text-sm font-semibold text-emerald-200">
                  {coverageDays} hari operasional
                </p>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full min-w-[1120px] text-left text-sm">
                <thead className="bg-zinc-950 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Bahan</th>
                    <th className="px-3 py-2 font-medium">Dept</th>
                    {demandDateKeys.map((date) => (
                      <th key={date} className="px-3 py-2 text-right font-medium">
                        {formatBusinessDateLabel(date)}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Total 7 Hari</th>
                    <th className="px-3 py-2 text-right font-medium">Avg/Hari</th>
                    <th className="px-3 py-2 text-right font-medium">Peak</th>
                    <th className="px-3 py-2 text-right font-medium">Stok Sekarang</th>
                    <th className="px-3 py-2 text-right font-medium">Rekomendasi Order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {demandPlanningRows.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="px-3 py-8 text-center text-slate-500">
                        Belum ada pemakaian bahan dari sales menu dalam 7 hari terakhir.
                      </td>
                    </tr>
                  ) : (
                    demandPlanningRows.slice(0, 30).map((row) => (
                      <tr key={row.ingredientId} className="hover:bg-zinc-950/50">
                        <td className="px-3 py-2 text-slate-100">
                          <span className="flex flex-col">
                            <span>{row.ingredientName}</span>
                            <span className="text-[10px] text-slate-500">
                              Supplier: {row.supplierName || "Belum ada"}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2 capitalize text-slate-400">{row.department}</td>
                        {demandDateKeys.map((date) => (
                          <td key={date} className="px-3 py-2 text-right tabular-nums text-slate-300">
                            {formatQtyWithUnit(row.dailyUsage[date] ?? 0, row.unit)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-100">
                          {formatQtyWithUnit(row.totalUsage, row.unit)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-indigo-200">
                          {formatQtyWithUnit(row.averageDailyUsage, row.unit)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-200">
                          {formatQtyWithUnit(row.peakDailyUsage, row.unit)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                          {formatQtyWithUnit(row.currentStock, row.unit)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums font-semibold ${
                            row.recommendedOrderQty > 0 ? "text-emerald-300" : "text-slate-500"
                          }`}
                        >
                          {formatQtyWithUnit(row.recommendedOrderQty, row.unit)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
          ) : null}

          {activeMonitoringTab === "inventory" ? (
          <section className="rounded-xl border border-slate-800 bg-zinc-900/60 p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-100">Inventory Monitor</h3>
                <p className="text-xs text-slate-500">
                  Low stock, receive audit, dan ledger detail untuk rentang {dateRangeLabel}.
                </p>
              </div>
            </div>

            <div
              className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 ${
                lowStockCountToday > 0
                  ? "border-red-800/60 bg-red-950/20"
                  : "border-slate-800 bg-zinc-950/50"
              }`}
              role="status"
            >
              <AlertTriangle
                className={`mt-0.5 h-5 w-5 shrink-0 ${
                  lowStockCountToday > 0 ? "animate-pulse text-amber-400" : "text-slate-500"
                }`}
                aria-hidden
              />
              <p
                className={`text-sm leading-snug ${
                  lowStockCountToday > 0 ? "font-medium text-red-200" : "text-slate-400"
                }`}
              >
                Terdapat{" "}
                <span
                  className={`tabular-nums font-bold ${
                    lowStockCountToday > 0 ? "text-red-300" : "text-slate-300"
                  }`}
                >
                  {lowStockCountToday}
                </span>{" "}
                bahan baku berstatus Low Stock{" "}
                {isSingleDayRange ? "hari ini" : `per ${formatBusinessDateLabel(endDate)}`}.
              </p>
            </div>

            <LiveStockTable rows={filteredLiveStockRows} businessDate={endDate} />

            <div className="mb-4 rounded-xl border border-slate-800 bg-zinc-950/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">Receive Audit</h4>
                  <p className="text-xs text-slate-500">
                    Jejak siapa input barang masuk dan kapan.
                  </p>
                </div>
                <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs tabular-nums text-slate-400">
                  {filteredReceiveAuditRows.length} entry
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-zinc-950 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Tanggal</th>
                      <th className="px-3 py-2 font-medium">Dept</th>
                      <th className="px-3 py-2 font-medium">Bahan</th>
                      <th className="px-3 py-2 font-medium">Staff</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 font-medium">Waktu Input</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredReceiveAuditRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                          Belum ada receive entry dalam rentang ini.
                        </td>
                      </tr>
                    ) : (
                      filteredReceiveAuditRows.slice(0, 30).map((row) => (
                        <tr key={row.id} className="hover:bg-zinc-900/60">
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                            {formatBusinessDateLabel(row.businessDate)}
                          </td>
                          <td className="px-3 py-2 capitalize text-slate-400">{row.department}</td>
                          <td className="px-3 py-2 text-slate-100">{row.ingredientName}</td>
                          <td className="px-3 py-2 text-slate-300">{row.staffName}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-100">
                            {formatQtyWithUnit(row.quantity, row.unit)}
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500">
                            {new Date(row.createdAt).toLocaleString("id-ID")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <DepartmentLedgerTable
                title="Departemen Bar"
                emoji="☕"
                accentClass="border-indigo-500/30"
                rows={barLedgerRows}
                showDateColumn={!isSingleDayRange}
                emptyMessage={
                  ledgerExportRows.some((r) => r.department === "bar")
                    ? "Tidak ada bahan Bar yang cocok dengan pencarian."
                    : "Belum ada data stock_ledger Bar dalam rentang tanggal terpilih."
                }
              />
              <DepartmentLedgerTable
                title="Departemen Kitchen"
                emoji="🍳"
                accentClass="border-amber-500/30"
                rows={kitchenLedgerRows}
                showDateColumn={!isSingleDayRange}
                emptyMessage={
                  ledgerExportRows.some((r) => r.department === "kitchen")
                    ? "Tidak ada bahan Kitchen yang cocok dengan pencarian."
                    : "Belum ada data stock_ledger Kitchen dalam rentang tanggal terpilih."
                }
              />
            </div>
          </section>
          ) : null}

          {activeMonitoringTab === "export" ? (
            <section className="rounded-xl border border-slate-800 bg-zinc-900/60 p-4">
              <div className="mb-4">
                <h3 className="text-base font-semibold text-slate-100">Export Center</h3>
                <p className="text-xs text-slate-500">
                  Download data operasional sesuai rentang tanggal dan filter pencarian aktif.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleExportInventorySummary()}
                  disabled={inventorySummaryRows.length === 0}
                  className="flex min-h-10 items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-600/15 px-4 text-sm font-semibold text-emerald-200 hover:bg-emerald-600/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  Download XLSX: Rekap Stok
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportInventory()}
                  disabled={ledgerExportRows.length === 0}
                  className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-zinc-950 px-4 text-sm font-medium text-slate-200 hover:border-indigo-500/50 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  Download XLSX: Detail Ledger
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportSales()}
                  disabled={salesExportRows.length === 0}
                  className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-zinc-950 px-4 text-sm font-medium text-slate-200 hover:border-indigo-500/50 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  Download XLSX: Penjualan
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportDemandPlanning()}
                  disabled={demandPlanningRows.length === 0}
                  className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-zinc-950 px-4 text-sm font-medium text-slate-200 hover:border-indigo-500/50 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  Download XLSX: Demand
                </button>
              </div>
            </section>
          ) : null}

          {activeMonitoringTab === "demand" ? (
          <section className="rounded-xl border border-slate-800 bg-zinc-900/60 p-4">
            <div className="mb-4 flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-indigo-400" />
              <div>
                <h3 className="text-base font-semibold text-slate-100">Gateway PO Supplier</h3>
                <p className="text-xs text-slate-500">
                  Thursday Last Order (WIB) · minimum order sebagai peringatan visual (soft warning).
                </p>
              </div>
            </div>

            {thursdayOrderClosed && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-200"
              >
                🚨 Pembelian Ditutup: Batas akhir order (Thursday Last Order) telah terlewati. Jadwal PO dialihkan ke
                minggu depan.
              </div>
            )}

            {poSuccess && (
              <p className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                {poSuccess}
              </p>
            )}

            {poError && (
              <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {poError}
              </p>
            )}

            <div className="mb-4 rounded-lg border border-indigo-500/30 bg-zinc-950/80 p-3">
              <label htmlFor="coverage-days" className="block text-sm font-medium text-slate-200">
                Target Kebutuhan Operasional (Hari)
              </label>
              <p className="mt-0.5 text-xs text-slate-500">
                Ubah menjadi 4 pada hari Kamis untuk cover stok hingga Senin.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={thursdayOrderClosed || coverageDays <= 1}
                  onClick={() => handleCoverageDaysChange(coverageDays - 1)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-zinc-900 text-lg font-semibold text-slate-200 hover:border-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Kurangi hari coverage"
                >
                  −
                </button>
                <input
                  id="coverage-days"
                  type="number"
                  min={1}
                  max={31}
                  step={1}
                  value={coverageDays}
                  disabled={thursdayOrderClosed}
                  onChange={(e) => handleCoverageDaysChange(Number(e.target.value))}
                  className="min-h-10 w-20 rounded-lg border border-slate-800 bg-zinc-900 px-2 text-center text-sm tabular-nums text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <button
                  type="button"
                  disabled={thursdayOrderClosed || coverageDays >= 31}
                  onClick={() => handleCoverageDaysChange(coverageDays + 1)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-zinc-900 text-lg font-semibold text-slate-200 hover:border-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Tambah hari coverage"
                >
                  +
                </button>
                <span className="text-xs text-slate-500">
                  Rekomendasi qty = (avg sales 7 hari × skenario demand × hari) + min. stok − stok saat ini
                </span>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {supplierPoCards.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-500 lg:col-span-2">
                  Belum ada supplier aktif. Tambahkan supplier di Master Data Supplier.
                </p>
              ) : (
                supplierPoCards.map(({ supplier, orderGroup, lineCount }) => {
                  const canSendSupplierPo =
                    canEdit && !thursdayOrderClosed && !poSubmitting && lineCount > 0;
                  const phoneReady = isSupplierWhatsAppPhoneConfigured(supplier.phone_number);

                  return (
                    <div
                      key={supplier.id}
                      className={`rounded-xl border p-4 ${
                        lineCount > 0
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-slate-800 bg-zinc-950/60"
                      }`}
                    >
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-slate-100">{supplier.name}</h4>
                          <p className="mt-1 text-xs text-slate-500">
                            Min. order {formatRupiah(Number(supplier.min_order_amount))}
                            {!phoneReady ? " · WhatsApp belum lengkap" : ""}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            lineCount > 0
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-slate-500/10 text-slate-500"
                          }`}
                        >
                          {lineCount} bahan
                        </span>
                      </div>

                      {orderGroup && orderGroup.lines.length > 0 ? (
                        <ul className="mb-3 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-800 bg-zinc-950/70 p-2 text-sm">
                          {orderGroup.lines.map((line) => (
                            <li
                              key={line.ingredientId}
                              className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5"
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-slate-200">{line.ingredientName}</span>
                                <span className="text-[11px] text-slate-500">
                                  Stok {formatQtyWithUnit(line.currentStock, line.unit)} · limit{" "}
                                  {formatQtyWithUnit(line.minimumStock, line.unit)}
                                </span>
                              </span>
                              <span className="shrink-0 tabular-nums text-emerald-200">
                                {formatPoWaQuantity(line.quantity)} {line.unit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mb-3 rounded-lg border border-dashed border-slate-800 px-3 py-5 text-center text-sm text-slate-500">
                          Tidak ada bahan supplier ini yang menyentuh batas order.
                        </p>
                      )}

                      {canEdit ? (
                        <button
                          type="button"
                          disabled={!canSendSupplierPo}
                          onClick={() => void handleSendSupplierLowStockPO(supplier, orderGroup)}
                          className="flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
                        >
                          {poSubmitting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : thursdayOrderClosed ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Kirim WhatsApp
                        </button>
                      ) : (
                        <p className="text-center text-xs text-slate-500">
                          Mode penonton: kirim PO tidak tersedia.
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {unassignedLowStockGroup ? (
              <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                {unassignedLowStockGroup.lines.length} bahan low-stock belum punya supplier.
                Lengkapi Primary Supplier di Master Ingredients supaya bisa masuk kartu supplier.
              </div>
            ) : null}
          </section>
          ) : null}

          {activeMonitoringTab === "sales" && filteredSalesRows.length > 0 && (
            <section className="rounded-xl border border-slate-800 bg-zinc-900/40 p-4">
              <div className="mb-3 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-200">
                  Ringkasan Penjualan
                  {!isSingleDayRange && (
                    <span className="ml-2 font-normal text-slate-500">({dateRangeLabel})</span>
                  )}
                </h3>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-800">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-zinc-950 text-slate-400">
                    <tr>
                      {!isSingleDayRange && <th className="px-3 py-2 font-medium">Tanggal</th>}
                      <th className="px-3 py-2 font-medium">Menu</th>
                      <th className="px-3 py-2 font-medium">Kategori</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Harga</th>
                      <th className="px-3 py-2 text-right font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredSalesRows.map((row, idx) => (
                      <tr key={`${row.menu_name}-${row.session_date}-${idx}`}>
                        {!isSingleDayRange && (
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                            {formatBusinessDateLabel(row.session_date)}
                          </td>
                        )}
                        <td className="px-3 py-2 text-slate-100">{row.menu_name}</td>
                        <td className="px-3 py-2 capitalize text-slate-400">{row.category}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                          {formatQtyId(row.quantity_sold)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                          {formatRupiah(row.unit_price)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium text-emerald-300">
                          {formatRupiah(row.total_gross_revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function buildTopSellingList(
  aggregate: Map<string, { menu_name: string; quantity_sold: number }>
): TopSellingEntry[] {
  const sorted = Array.from(aggregate.values()).sort((a, b) => b.quantity_sold - a.quantity_sold);
  const topFive = sorted.slice(0, 5);
  const totalQty = topFive.reduce((sum, item) => sum + item.quantity_sold, 0);

  return topFive.map((item) => ({
    menu_name: item.menu_name,
    quantity_sold: item.quantity_sold,
    sharePercent: totalQty > 0 ? (item.quantity_sold / totalQty) * 100 : 0,
  }));
}

function addIsoDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  return next.toISOString().slice(0, 10);
}
