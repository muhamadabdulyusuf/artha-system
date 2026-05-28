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
  MenuCategory,
  MenuItemRow,
  StockLedgerRow,
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
  daysRemaining: number;
  urgency: "safe" | "warning" | "critical";
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

function buildPurchasingLowStockMessage(params: {
  groups: LowStockOrderGroup[];
  dateLabel: string;
}): string {
  const { groups, dateLabel } = params;
  if (groups.length === 0) {
    return `*LOW STOCK ORDER - ARTHA SYSTEM*\nTanggal: ${dateLabel}\n\nTidak ada bahan low stock.`;
  }

  return [
    "*LOW STOCK ORDER - ARTHA SYSTEM*",
    `Tanggal: ${dateLabel}`,
    "",
    ...groups.flatMap((group) => [
      `${group.supplierName}:`,
      ...group.lines.map(
        (line) => `- ${line.ingredientName} ${formatPoWaQuantity(line.quantity)} ${line.unit}`
      ),
      "",
    ]),
    "Mohon diproses sesuai supplier masing-masing.",
  ].join("\n");
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

export function MonitoringDashboard() {
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const canEdit = canEditStaffData(getStaffSession()?.role);

  const [searchTerm, setSearchTerm] = useState("");
  const [startDate, setStartDate] = useState(() => resolveBusinessDate());
  const [endDate, setEndDate] = useState(() => resolveBusinessDate());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [ledgerExportRows, setLedgerExportRows] = useState<StockLedgerExportRow[]>([]);
  const [lowStockInventoryRows, setLowStockInventoryRows] = useState<LowStockInventoryRow[]>([]);
  const [salesExportRows, setSalesExportRows] = useState<SalesExportRow[]>([]);
  const [topBeverages, setTopBeverages] = useState<TopSellingEntry[]>([]);
  const [topFoods, setTopFoods] = useState<TopSellingEntry[]>([]);
  const [runwayEntries, setRunwayEntries] = useState<RunwayEntry[]>([]);
  const [cogsAlerts, setCogsAlerts] = useState<CogsAlert[]>([]);
  const [hasSpillageAlert, setHasSpillageAlert] = useState(false);

  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierCatalog, setSupplierCatalog] = useState<SupplierPriceCatalog[]>([]);
  const [poLines, setPoLines] = useState<PoLineDraft[]>([]);
  const [coverageDays, setCoverageDays] = useState(1);
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

  const isSingleDayRange = startDate === endDate;

  const thursdayOrderClosed = useMemo(() => isThursdayLastOrderClosed(), [refreshKey]);

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

  const filteredSalesRows = useMemo(() => {
    if (!normalizedSearch) return salesExportRows;
    return salesExportRows.filter(
      (row) =>
        row.menu_name.toLowerCase().includes(normalizedSearch) ||
        row.category.toLowerCase().includes(normalizedSearch)
    );
  }, [salesExportRows, normalizedSearch]);

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
      const dailyNeed = ingredientDailyUsageById[row.ingredientId] ?? 0;
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
    ingredientDailyUsageById,
    lowStockInventoryRows,
    primarySupplierByIngredientId,
  ]);

  const lowStockPurchasingText = useMemo(
    () =>
      buildPurchasingLowStockMessage({
        groups: lowStockOrderGroups,
        dateLabel: formatBusinessDateLabel(endDate),
      }),
    [endDate, lowStockOrderGroups]
  );

  const selectedSupplierLowStockGroups = useMemo(
    () => lowStockOrderGroups.filter((group) => group.supplierId === selectedSupplierId),
    [lowStockOrderGroups, selectedSupplierId]
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

    setLoading(true);
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
      .select("id, business_date, department")
      .gte("business_date", rangeStart)
      .lte("business_date", rangeEnd);

    if (sessionRangeErr) {
      setError(sessionRangeErr.message);
      setLoading(false);
      return;
    }

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

    for (const row of historyLedgers ?? []) {
      const usage = Number(row.theoretical_usage);
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

    const runway: RunwayEntry[] = [];
    for (const [ingredientId, closing] of closingByIngredient) {
      const ingredient = ingredientMap.get(ingredientId);
      if (!ingredient) continue;
      const usageBucket = usageByIngredient.get(ingredientId);
      if (!usageBucket || usageBucket.days.size === 0) continue;
      const avgDailyUsage = usageBucket.totalUsage / usageBucket.days.size;
      if (avgDailyUsage <= 0) continue;
      const daysRemaining = Math.max(0, Math.floor(closing / avgDailyUsage));
      let urgency: RunwayEntry["urgency"] = "safe";
      if (daysRemaining <= 1) urgency = "critical";
      else if (daysRemaining <= 3) urgency = "warning";
      runway.push({ ingredientName: ingredient.name, daysRemaining, urgency });
    }

    runway.sort((a, b) => a.daysRemaining - b.daysRemaining);
    setRunwayEntries(runway.slice(0, 8));

    const dailyUsageById: Record<string, number> = {};
    const stockById: Record<string, { currentStock: number; minimumStock: number }> = {};

    for (const [ingredientId, closing] of closingByIngredient) {
      const ingredient = ingredientMap.get(ingredientId);
      if (!ingredient) continue;

      const usageBucket = usageByIngredient.get(ingredientId);
      if (usageBucket && usageBucket.days.size > 0) {
        dailyUsageById[ingredientId] = usageBucket.totalUsage / usageBucket.days.size;
      }

      stockById[ingredientId] = {
        currentStock: closing,
        minimumStock: Number(ingredient.minimum_stock ?? 0),
      };
    }

    for (const row of exportLedger) {
      if (row.business_date !== rangeEnd) continue;
      if (!dailyUsageById[row.ingredient_id] && row.theoretical_usage > 0) {
        dailyUsageById[row.ingredient_id] = row.theoretical_usage;
      }
      if (!stockById[row.ingredient_id]) {
        stockById[row.ingredient_id] = {
          currentStock: row.closing_stock,
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
      .select("id, name, min_order_amount, phone_number, is_active, created_at, updated_at")
      .eq("is_active", true)
      .order("name");

    if (supErr) {
      setSuppliers([]);
    } else {
      setSuppliers(supplierRows ?? []);
    }

    setLoading(false);
  }, [supabase, startDate, endDate, dateRangeInvalid]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard, refreshKey]);

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
        dailyTarget,
        coverageDays,
        stock.minimumStock,
        stock.currentStock
      );
    },
    [coverageDays, ingredientDailyUsageById, ingredientStockById]
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

  const handleExportInventory = async () => {
    const rows = normalizedSearch ? filteredLedgerRows : ledgerExportRows;
    await downloadInventoryXlsx(`inventory-ledger-${csvDateSuffix}.xlsx`, rows);
  };

  const handleExportSales = async () => {
    const rows = normalizedSearch ? filteredSalesRows : salesExportRows;
    await downloadSalesXlsx(`laporan-penjualan-${csvDateSuffix}.xlsx`, rows);
  };

  const handleShareLowStockToPurchasing = async () => {
    if (lowStockOrderGroups.length === 0) {
      window.alert("Belum ada bahan low stock untuk dikirim ke purchasing.");
      return;
    }

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Low Stock Order - Artha System",
          text: lowStockPurchasingText,
        });
      } else {
        await navigator.clipboard.writeText(lowStockPurchasingText);
        window.alert("List order per supplier sudah disalin. Kirim ke purchasing via WhatsApp.");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      await navigator.clipboard.writeText(lowStockPurchasingText);
      window.alert("List order per supplier sudah disalin. Kirim ke purchasing via WhatsApp.");
    }
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

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-2">
        <OpnameApprovalPanel />
        <StockAdjustmentPanel />
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Dashboard Monitoring</h2>
          <p className="mt-1 text-sm text-slate-400">
            Admin & OPS Manager · Rentang{" "}
            <span className="font-medium text-indigo-300">{dateRangeLabel}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="flex min-h-10 items-center justify-center gap-2 self-start rounded-lg border border-slate-800 bg-zinc-900 px-4 text-sm text-slate-300 transition hover:border-indigo-500/60 hover:text-indigo-300"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh Data
        </button>
      </div>

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Live search menu atau bahan baku…"
            className="min-h-11 w-full rounded-xl border border-slate-800 bg-zinc-950 py-2.5 pl-10 pr-10 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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

        <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-zinc-950 px-3 py-2">
          <CalendarDays className="h-4 w-4 text-indigo-400" aria-hidden />
          <label className="sr-only" htmlFor="monitoring-start-date">
            Tanggal mulai
          </label>
          <input
            id="monitoring-start-date"
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className="min-h-9 rounded-lg border border-slate-800 bg-zinc-900 px-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
            className="min-h-9 rounded-lg border border-slate-800 bg-zinc-900 px-2.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {dateRangeInvalid && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Rentang tanggal tidak valid. Pastikan tanggal mulai tidak melebihi tanggal akhir.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>
      )}

      <MenuMovementPanel startDate={startDate} endDate={endDate} refreshKey={refreshKey} />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat command center…
        </div>
      ) : (
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
              <div className="mb-3 flex items-center gap-2">
                <Package className="h-4 w-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-200">Stock Runway Calculator</h3>
                <span className="text-xs text-slate-500">(per {formatBusinessDateLabel(endDate)})</span>
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
                    {entry.ingredientName}{" "}
                    {entry.urgency === "safe"
                      ? `aman ${entry.daysRemaining} hari`
                      : entry.urgency === "warning"
                        ? `waspada sisa ${entry.daysRemaining} hari`
                        : `kritis sisa ${entry.daysRemaining} hari`}
                  </span>
                ))}
              </div>
            </section>
          )}

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

          <section className="rounded-xl border border-slate-800 bg-zinc-900/60 p-4">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-100">Log & Data Export Center</h3>
                <p className="text-xs text-slate-500">
                  Ekspor XLSX client-side — data mengikuti rentang tanggal ({dateRangeLabel}) & filter pencarian aktif.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleExportInventory()}
                  disabled={ledgerExportRows.length === 0}
                  className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 bg-zinc-950 px-4 text-sm font-medium text-slate-200 hover:border-indigo-500/50 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" />
                  Download XLSX: Inventory
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

            {lowStockOrderGroups.length > 0 ? (
              <div className="mb-4 rounded-xl border border-slate-800 bg-zinc-950/60 p-4">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100">Order Low Stock per Supplier</h4>
                    <p className="text-xs text-slate-500">
                      Otomatis dikelompokkan dari supplier terbaru di katalog harga bahan.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleShareLowStockToPurchasing()}
                    className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-600/15 px-3 text-sm font-semibold text-indigo-200 hover:bg-indigo-600/25"
                  >
                    <Send className="h-4 w-4" />
                    Share ke Purchasing
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {lowStockOrderGroups.map((group) => (
                    <div key={group.supplierId} className="rounded-lg border border-slate-800 bg-zinc-900/70 p-3">
                      <p className="mb-2 text-sm font-semibold text-slate-100">{group.supplierName}</p>
                      <ul className="space-y-1 text-sm text-slate-300">
                        {group.lines.map((line) => (
                          <li key={line.ingredientId} className="flex justify-between gap-3">
                            <span>{line.ingredientName}</span>
                            <span className="shrink-0 tabular-nums text-slate-100">
                              {formatPoWaQuantity(line.quantity)} {line.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

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
                  Rekomendasi qty = (kebutuhan harian × hari) + min. stok − stok saat ini
                </span>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Pilih Supplier
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  disabled={thursdayOrderClosed}
                  className="min-h-11 w-full rounded-lg border border-slate-800 bg-zinc-950 px-3 text-sm text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">— Pilih supplier —</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name} (Min. {formatRupiah(Number(supplier.min_order_amount))})
                    </option>
                  ))}
                </select>

                {selectedSupplier && (
                  <p className="text-xs text-slate-400">
                    Minimum order:{" "}
                    <span className="font-semibold text-slate-200">
                      {formatRupiah(Number(selectedSupplier.min_order_amount))}
                    </span>
                  </p>
                )}

                {selectedSupplierId && supplierCatalog.length > 0 && (
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-800">
                    <ul className="divide-y divide-slate-800/80 text-sm">
                      {supplierCatalog.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-zinc-950/60"
                        >
                          <span className="text-slate-200">
                            {item.ingredient.name}{" "}
                            <span className="text-xs text-slate-500">({item.ingredient.unit})</span>
                          </span>
                          {canEdit ? (
                            <button
                              type="button"
                              disabled={thursdayOrderClosed}
                              onClick={() => handleAddPoLine(item)}
                              className="shrink-0 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
                            >
                              + Tambah
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedSupplierId && supplierCatalog.length === 0 && (
                  <p className="text-sm text-slate-500">Katalog harga supplier belum tersedia.</p>
                )}
              </div>

              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-200">Draft Purchase Order</h4>
                {poLines.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-slate-500">
                    Tambahkan bahan dari katalog supplier.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {poLines.map((line) => {
                      const qty = parsePoQuantity(line.quantity);
                      const subtotal = qty * line.unitPrice;
                      return (
                        <li
                          key={line.ingredientId}
                          className="rounded-lg border border-slate-800 bg-zinc-950/80 p-3"
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-slate-100">{line.ingredientName}</p>
                              <p className="text-xs text-slate-500">
                                @ {formatRupiah(line.unitPrice)} / {line.unit}
                              </p>
                            </div>
                            {canEdit ? (
                              <button
                                type="button"
                                onClick={() => handleRemovePoLine(line.ingredientId)}
                                className="text-slate-500 hover:text-red-400"
                                aria-label={`Hapus ${line.ingredientName}`}
                              >
                                <X className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={line.quantity}
                              disabled={thursdayOrderClosed}
                              onChange={(e) => handleUpdatePoLineQty(line.ingredientId, e.target.value)}
                              className="min-h-10 w-24 rounded-lg border border-slate-800 bg-zinc-900 px-2 text-sm tabular-nums text-slate-100"
                            />
                            <span className="text-sm tabular-nums text-slate-400">= {formatRupiah(subtotal)}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                  <span className="text-sm text-slate-400">Total PO</span>
                  <span className="text-lg font-bold tabular-nums text-slate-100">{formatRupiah(poTotalAmount)}</span>
                </div>

                {minOrderShortfall > 0 && selectedSupplier && (
                  <p className="text-sm font-medium text-red-400">
                    Peringatan: Total belanja belum memenuhi batas minimum order supplier.
                  </p>
                )}

                {canEdit ? (
                  <button
                    type="button"
                    disabled={poSubmitDisabled}
                    onClick={() => void handleSendPO()}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {thursdayOrderClosed ? (
                      <>
                        <Lock className="h-4 w-4" />
                        PO Dikunci (Thursday Last Order)
                      </>
                    ) : poSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Mengirim…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Kirim PO ke Supplier
                      </>
                    )}
                  </button>
                ) : (
                  <p className="text-center text-xs text-slate-500">
                    Mode penonton: pembuatan PO tidak tersedia.
                  </p>
                )}
              </div>
            </div>
          </section>

          {filteredSalesRows.length > 0 && (
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
