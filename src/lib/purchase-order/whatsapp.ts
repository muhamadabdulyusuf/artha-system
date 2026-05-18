const WIB_TIMEZONE = "Asia/Jakarta";

export const SUPPLIER_WHATSAPP_NOT_CONFIGURED_MSG =
  "Nomor WhatsApp Supplier belum di-setting dengan benar di Master Data.";

export type WhatsAppPoLine = {
  ingredientName: string;
  quantity: number;
  unit: string;
};

function formatPoLineQuantity(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return rounded % 1 === 0 ? String(Math.round(rounded)) : rounded.toFixed(2);
}

export function formatPurchaseOrderDateLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: WIB_TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
}

export function isSupplierWhatsAppPhoneConfigured(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return false;
  if (digits === "62") return false;
  return true;
}

export function normalizeWhatsAppPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    return `62${digits.slice(1)}`;
  }
  return digits;
}

export function buildPurchaseOrderWhatsAppText(params: {
  supplierName: string;
  lines: WhatsAppPoLine[];
  orderDate?: Date;
}): string {
  const { supplierName, lines, orderDate = new Date() } = params;
  const dateLabel = formatPurchaseOrderDateLabel(orderDate);
  const itemLines = lines
    .map((line) => `- ${line.ingredientName}: ${formatPoLineQuantity(line.quantity)} ${line.unit}`)
    .join("\n");

  return [
    "*ARTHA SYSTEM - PURCHASE ORDER*",
    "----------------------------------------",
    `Tanggal PO: ${dateLabel}`,
    `Supplier  : ${supplierName}`,
    "",
    "Daftar Pesanan Barang:",
    itemLines,
    "----------------------------------------",
    "Mohon segera diproses dan dikirimkan konfirmasi nota tagihannya. Terima kasih!",
  ].join("\n");
}

export function openWhatsAppPurchaseOrderChat(supplierPhone: string, messageText: string): void {
  const phone = normalizeWhatsAppPhoneNumber(supplierPhone);
  const encodedText = encodeURIComponent(messageText);
  window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}`, "_blank");
}
