"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  ListFilter,
  Loader2,
  PackageCheck,
  PackageX,
  Pencil,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import { resolveBusinessDate } from "@/lib/utils/dateHelper";
import type {
  IngredientRow,
  Database,
  PurchaseRequestDepartment,
  PurchaseRequestMethod,
  PurchaseRequestPoStatus,
  PurchaseRequestStatus,
  PurchaseRequestTrackerRow,
  SupplierRow,
} from "@/lib/types/database";

type PurchaseRequestUpdate = Database["public"]["Tables"]["purchase_request_tracker"]["Update"];
type MonitoringView = "all" | "need_order" | "ordered" | "process" | "received" | "cancelled";

type TrackerForm = {
  request_date: string;
  ingredient_id: string;
  item_name: string;
  department: PurchaseRequestDepartment;
  qty: string;
  unit: string;
  supplier_id: string;
  supplier_name: string;
  supplier_contact: string;
  unit_price: string;
  purchase_method: PurchaseRequestMethod;
  purchase_link: string;
  estimated_arrival_date: string;
  note: string;
};

type SearchPickerOption = {
  id: string;
  title: string;
  subtitle?: string;
};

type SearchablePickerProps = {
  label: string;
  value: string;
  options: SearchPickerOption[];
  placeholder: string;
  emptyLabel: string;
  onChange: (value: string) => void;
};

const PURCHASE_STATUSES: PurchaseRequestStatus[] = [
  "Belum Dibeli",
  "On Progress",
  "Purchased",
  "Shipped",
  "Arrived",
  "Cancelled",
];

const PO_STATUSES: PurchaseRequestPoStatus[] = ["Pending", "Approved", "Rejected"];

const MONITORING_VIEWS: {
  id: MonitoringView;
  label: string;
  description: string;
  icon: typeof ShoppingCart;
}[] = [
  { id: "all", label: "Semua", description: "Semua PO", icon: ListFilter },
  { id: "need_order", label: "Perlu Order", description: "Belum dibeli", icon: AlertTriangle },
  { id: "ordered", label: "Sudah Order", description: "Sudah dibeli", icon: ShoppingCart },
  { id: "process", label: "On Process", description: "Diproses/dikirim", icon: Clock3 },
  { id: "received", label: "Diterima", description: "Sudah masuk stok", icon: ClipboardCheck },
  { id: "cancelled", label: "Cancelled", description: "Batal/reject", icon: PackageX },
];

const STATUS_STYLE: Record<PurchaseRequestStatus, string> = {
  "Belum Dibeli": "border-red-500/40 bg-red-500/10 text-red-200",
  "On Progress": "border-amber-500/40 bg-amber-500/10 text-amber-100",
  Purchased: "border-indigo-500/40 bg-indigo-500/10 text-indigo-100",
  Shipped: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  Arrived: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  Cancelled: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
};

const FIELD_CLASS =
  "mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 disabled:cursor-not-allowed disabled:opacity-60";
const LABEL_CLASS = "text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500";
const PANEL_CLASS = "rounded-lg border border-zinc-800 bg-zinc-900/35 p-3";

function SearchablePicker({
  label,
  value,
  options,
  placeholder,
  emptyLabel,
  onChange,
}: SearchablePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };

    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selectedOption = options.find((option) => option.id === value) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) =>
        [option.title, option.subtitle]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery),
      )
    : options;

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <span className={LABEL_CLASS}>{label}</span>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen((current) => !current)}
        className={`${FIELD_CLASS} flex min-h-12 items-center justify-between gap-2 py-2 text-left`}
      >
        <span className="min-w-0">
          <span className={`block truncate font-semibold ${selectedOption ? "text-zinc-100" : "text-zinc-500"}`}>
            {selectedOption?.title ?? emptyLabel}
          </span>
          <span className="block truncate text-[11px] text-zinc-500">
            {selectedOption?.subtitle ?? placeholder}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div className="absolute left-0 right-0 z-30 mt-2 rounded-lg border border-zinc-700 bg-zinc-950 p-2 shadow-2xl shadow-black/40">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              className="min-h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-9 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-100"
                aria-label="Bersihkan pencarian"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="mt-2 max-h-56 overflow-y-auto pr-1" role="listbox">
            <button
              type="button"
              onClick={() => handleSelect("")}
              className={`mb-1 flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                value === ""
                  ? "bg-emerald-400 text-zinc-950"
                  : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
              role="option"
              aria-selected={value === ""}
            >
              <span className="truncate font-semibold">{emptyLabel}</span>
            </button>

            {filteredOptions.map((option) => {
              const active = option.id === value;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleSelect(option.id)}
                  className={`mb-1 flex min-h-12 w-full flex-col justify-center rounded-lg px-3 py-2 text-left transition ${
                    active
                      ? "bg-emerald-400 text-zinc-950"
                      : "text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
                  }`}
                  role="option"
                  aria-selected={active}
                >
                  <span className="truncate text-sm font-semibold">{option.title}</span>
                  {option.subtitle ? (
                    <span className={`truncate text-xs ${active ? "text-zinc-800" : "text-zinc-500"}`}>
                      {option.subtitle}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {filteredOptions.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm text-zinc-500">Data tidak ditemukan.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const todayIso = () => resolveBusinessDate();

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function parseNumber(value: string): number {
  const normalized = value.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function newForm(): TrackerForm {
  return {
    request_date: todayIso(),
    ingredient_id: "",
    item_name: "",
    department: "bar",
    qty: "",
    unit: "",
    supplier_id: "",
    supplier_name: "",
    supplier_contact: "",
    unit_price: "",
    purchase_method: "Offline",
    purchase_link: "",
    estimated_arrival_date: "",
    note: "",
  };
}

function numericInput(value: number | null | undefined): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function statusCount(rows: PurchaseRequestTrackerRow[], status: PurchaseRequestStatus): number {
  return rows.filter((row) => row.purchase_status === status).length;
}

function monitoringCount(rows: PurchaseRequestTrackerRow[], view: MonitoringView): number {
  return rows.filter((row) => rowMatchesMonitoringView(row, view)).length;
}

function rowMatchesMonitoringView(row: PurchaseRequestTrackerRow, view: MonitoringView): boolean {
  if (view === "all") return true;
  if (view === "need_order") {
    return row.purchase_status === "Belum Dibeli" && row.po_status !== "Rejected";
  }
  if (view === "ordered") return row.purchase_status === "Purchased";
  if (view === "process") {
    return row.purchase_status === "On Progress" || row.purchase_status === "Shipped";
  }
  if (view === "received") return row.purchase_status === "Arrived";
  return row.purchase_status === "Cancelled" || row.po_status === "Rejected";
}

function isOverdue(row: PurchaseRequestTrackerRow): boolean {
  if (!row.estimated_arrival_date || row.purchase_status === "Arrived" || row.purchase_status === "Cancelled") {
    return false;
  }
  return row.estimated_arrival_date < todayIso();
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  return value;
}

function departmentLabel(department: PurchaseRequestDepartment): string {
  if (department === "bar") return "Bar";
  if (department === "kitchen") return "Kitchen";
  return "General";
}

function isLockedPurchaseRow(row: PurchaseRequestTrackerRow): boolean {
  return row.purchase_status === "Arrived" || Boolean(row.stock_applied_at);
}

function trackerRowToForm(row: PurchaseRequestTrackerRow): TrackerForm {
  return {
    request_date: row.request_date || todayIso(),
    ingredient_id: row.ingredient_id ?? "",
    item_name: row.item_name,
    department: row.department,
    qty: numericInput(row.qty),
    unit: row.unit,
    supplier_id: row.supplier_id ?? "",
    supplier_name: row.supplier_name,
    supplier_contact: row.supplier_contact,
    unit_price: numericInput(row.unit_price),
    purchase_method: row.purchase_method,
    purchase_link: row.purchase_link,
    estimated_arrival_date: row.estimated_arrival_date ?? "",
    note: row.note,
  };
}

export function PurchaseRequestTracker() {
  const supabase = getSupabaseClient();
  const canEdit = canEditStaffData(getStaffSession()?.role);

  const [rows, setRows] = useState<PurchaseRequestTrackerRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [form, setForm] = useState<TrackerForm>(() => newForm());
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<MonitoringView>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const [requestResult, ingredientResult, supplierResult] = await Promise.all([
      supabase
        .from("purchase_request_tracker")
        .select("*")
        .order("request_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(80),
      supabase
        .from("ingredient")
        .select("*")
        .eq("is_active", true)
        .eq("is_stock_tracked", true)
        .order("name", { ascending: true }),
      supabase.from("supplier").select("*").eq("is_active", true).order("name", { ascending: true }),
    ]);

    if (requestResult.error) {
      setError(requestResult.error.message);
      setIsLoading(false);
      return;
    }
    if (ingredientResult.error) {
      setError(ingredientResult.error.message);
      setIsLoading(false);
      return;
    }
    if (supplierResult.error) {
      setError(supplierResult.error.message);
      setIsLoading(false);
      return;
    }

    setRows(requestResult.data ?? []);
    setIngredients(ingredientResult.data ?? []);
    setSuppliers(supplierResult.data ?? []);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!rowMatchesMonitoringView(row, activeView)) return false;
      if (!query) return true;
      return [
          row.item_name,
          row.department,
          row.supplier_name,
          row.supplier_contact,
          row.pic_request_name,
          row.po_status,
          row.purchase_status,
          row.note,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
    });
  }, [activeView, rows, search]);

  const dashboardMetrics = useMemo(() => {
    const openRows = rows.filter((row) => row.purchase_status !== "Arrived" && row.purchase_status !== "Cancelled");
    const overdueRows = rows.filter(isOverdue);
    const received = monitoringCount(rows, "received");
    const fulfilmentRate = rows.length > 0 ? Math.round((received / rows.length) * 100) : 100;
    return {
      needOrder: monitoringCount(rows, "need_order"),
      ordered: monitoringCount(rows, "ordered"),
      process: monitoringCount(rows, "process"),
      received,
      cancelled: monitoringCount(rows, "cancelled"),
      overdue: overdueRows.length,
      approvalPending: rows.filter((row) => row.po_status === "Pending").length,
      rejected: rows.filter((row) => row.po_status === "Rejected" || row.purchase_status === "Cancelled").length,
      openCount: openRows.length,
      openEstimatedTotal: openRows.reduce((sum, row) => sum + Number(row.total_price ?? 0), 0),
      receivedValue: rows
        .filter((row) => row.purchase_status === "Arrived")
        .reduce((sum, row) => sum + Number(row.total_price ?? 0), 0),
      fulfilmentRate,
      topOverdueRows: overdueRows.slice(0, 3),
    };
  }, [rows]);

  const ingredientOptions = useMemo<SearchPickerOption[]>(
    () =>
      ingredients.map((ingredient) => ({
        id: ingredient.id,
        title: ingredient.name,
        subtitle: [
          departmentLabel(ingredient.department),
          ingredient.purchase_unit || ingredient.unit || "",
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    [ingredients],
  );

  const supplierOptions = useMemo<SearchPickerOption[]>(
    () =>
      suppliers.map((supplier) => {
        const phone =
          supplier.phone_number && supplier.phone_number !== "62" ? supplier.phone_number : "";
        return {
          id: supplier.id,
          title: supplier.name,
          subtitle:
            [supplier.category || "General", supplier.pic_name ? `PIC ${supplier.pic_name}` : "", phone]
              .filter(Boolean)
              .join(" · ") || "Supplier aktif",
        };
      }),
    [suppliers],
  );

  const selectedSupplier = suppliers.find((item) => item.id === form.supplier_id) ?? null;
  const estimatedTotal = parseNumber(form.qty) * parseNumber(form.unit_price);
  const isEditing = editingRowId !== null;

  const resetForm = () => {
    setForm(newForm());
    setEditingRowId(null);
    setError(null);
    setSuccess(null);
  };

  const handleIngredientChange = (ingredientId: string) => {
    const ingredient = ingredients.find((item) => item.id === ingredientId);
    setForm((prev) => ({
      ...prev,
      ingredient_id: ingredientId,
      item_name: ingredient?.name ?? prev.item_name,
      department: ingredient?.department ?? prev.department,
      unit: ingredient?.purchase_unit || ingredient?.unit || prev.unit,
      unit_price: ingredient?.default_unit_price
        ? String(Number(ingredient.default_unit_price))
        : prev.unit_price,
    }));
  };

  const handleSupplierChange = (supplierId: string) => {
    const supplier = suppliers.find((item) => item.id === supplierId);
    setForm((prev) => ({
      ...prev,
      supplier_id: supplierId,
      supplier_name: supplier?.name ?? "",
      supplier_contact: supplier?.phone_number && supplier.phone_number !== "62" ? supplier.phone_number : "",
      purchase_link: supplier?.link_url || prev.purchase_link,
    }));
  };

  const handleSaveForm = async () => {
    const staff = getStaffSession();
    const qty = parseNumber(form.qty);
    const unitPrice = parseNumber(form.unit_price);
    const editingRow = editingRowId ? rows.find((row) => row.id === editingRowId) : null;

    if (!canEdit) {
      setError("Akun ini tidak punya akses membuat PO tracker.");
      return;
    }
    if (editingRow && isLockedPurchaseRow(editingRow)) {
      setError("PO sudah masuk stok.");
      return;
    }
    if (!form.item_name.trim()) {
      setError("Nama barang wajib diisi.");
      return;
    }
    if (qty <= 0) {
      setError("Qty harus lebih dari 0.");
      return;
    }
    if (!form.unit.trim()) {
      setError("Satuan wajib diisi.");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const payload = {
      request_date: form.request_date || todayIso(),
      ingredient_id: form.ingredient_id || null,
      item_name: form.item_name.trim(),
      department: form.department,
      qty,
      unit: form.unit.trim(),
      supplier_id: form.supplier_id || null,
      supplier_name: form.supplier_name.trim() || selectedSupplier?.name || "",
      supplier_contact: form.supplier_contact.trim(),
      unit_price: unitPrice,
      purchase_method: form.purchase_method,
      purchase_link: form.purchase_link.trim(),
      estimated_arrival_date: form.estimated_arrival_date || null,
      note: form.note.trim(),
    };

    const result = editingRowId
      ? await supabase.from("purchase_request_tracker").update(payload).eq("id", editingRowId)
      : await supabase.from("purchase_request_tracker").insert({
          ...payload,
          pic_request_staff_id: staff?.id ?? null,
          pic_request_name: staff?.name ?? "",
        });

    if (result.error) {
      setError(result.error.message);
      setIsSaving(false);
      return;
    }

    setForm(newForm());
    setEditingRowId(null);
    setSuccess(editingRowId ? "PO diperbarui." : "Request PO dicatat.");
    await loadData();
    setIsSaving(false);
  };

  const handleStartEdit = (row: PurchaseRequestTrackerRow) => {
    if (!canEdit) {
      setError("Akun ini tidak punya akses mengubah PO tracker.");
      return;
    }
    if (isLockedPurchaseRow(row)) {
      setError("PO sudah masuk stok.");
      return;
    }

    setForm(trackerRowToForm(row));
    setEditingRowId(row.id);
    setError(null);
    setSuccess(null);
    requestAnimationFrame(() => {
      document.getElementById("po-request-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const handleDeleteRow = async (row: PurchaseRequestTrackerRow) => {
    if (!canEdit) {
      setError("Akun ini tidak punya akses menghapus PO tracker.");
      return;
    }
    if (isLockedPurchaseRow(row)) {
      setError("PO sudah masuk stok.");
      return;
    }
    if (!window.confirm(`Hapus PO ${row.item_name}?`)) return;

    setDeletingRowId(row.id);
    setError(null);
    setSuccess(null);

    const { error: deleteError } = await supabase
      .from("purchase_request_tracker")
      .delete()
      .eq("id", row.id);

    if (deleteError) {
      setError(deleteError.message);
      setDeletingRowId(null);
      return;
    }

    if (editingRowId === row.id) {
      setForm(newForm());
      setEditingRowId(null);
    }
    setSuccess("PO dihapus.");
    await loadData();
    setDeletingRowId(null);
  };

  const updateRow = async (
    row: PurchaseRequestTrackerRow,
    patch: PurchaseRequestUpdate,
  ) => {
    if (!canEdit) {
      setError("Akun ini tidak punya akses mengubah PO tracker.");
      return;
    }
    if (isLockedPurchaseRow(row)) {
      setError("PO sudah masuk stok.");
      return;
    }

    const staff = getStaffSession();
    const nextPatch: PurchaseRequestUpdate = { ...patch };

    if (patch.po_status === "Approved" || patch.po_status === "Rejected") {
      nextPatch.approved_by_staff_id = staff?.id ?? null;
      nextPatch.approved_by_name = staff?.name ?? "";
    }

    if (patch.purchase_status === "Arrived") {
      if (!row.ingredient_id) {
        setError("Pilih bahan persediaan dulu sebelum status dibuat Arrived.");
        return;
      }
      nextPatch.arrival_date = row.arrival_date ?? todayIso();
    }

    setError(null);
    setSuccess(null);

    const { data: updatedRow, error: updateError } = await supabase
      .from("purchase_request_tracker")
      .update(nextPatch)
      .eq("id", row.id)
      .select("stock_applied_at, stock_applied_qty")
      .maybeSingle();

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(
      patch.purchase_status === "Arrived"
        ? updatedRow?.stock_applied_at
          ? `${row.item_name} diterima. Stok master +${Number(updatedRow.stock_applied_qty).toLocaleString("id-ID")}.`
          : `${row.item_name} diterima.`
        : "PO tracker diperbarui.",
    );
    await loadData();
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 border-b border-zinc-800 pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-emerald-400/25 bg-emerald-400/10 shadow-lg shadow-emerald-950/20">
            <ShoppingCart className="h-5 w-5 text-emerald-300" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-zinc-100">Procurement Command Center</h3>
            <p className="mt-0.5 truncate text-sm text-zinc-500">
              {rows.length} request · {dashboardMetrics.openCount} open · {formatRupiah(dashboardMetrics.openEstimatedTotal)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-semibold tabular-nums text-emerald-200">
            Fulfillment {dashboardMetrics.fulfilmentRate}%
          </span>
          <span
            className={`rounded-lg border px-3 py-2 text-xs font-semibold tabular-nums ${
              dashboardMetrics.overdue > 0
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300"
            }`}
          >
            Overdue {dashboardMetrics.overdue}
          </span>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-900"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setActiveView("need_order")}
          className={`min-h-24 rounded-lg border px-4 py-3 text-left transition ${
            activeView === "need_order"
              ? "border-red-400 bg-red-500/15"
              : "border-zinc-800 bg-zinc-900/35 hover:border-red-500/50"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-red-200">Perlu Order</span>
            <AlertTriangle className="h-4 w-4 text-red-300" />
          </div>
          <p className="mt-3 text-2xl font-bold text-zinc-50">{dashboardMetrics.needOrder}</p>
          <p className="mt-1 text-xs text-zinc-500">Belum dibeli atau approval pending</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("ordered")}
          className={`min-h-24 rounded-lg border px-4 py-3 text-left transition ${
            activeView === "ordered"
              ? "border-indigo-400 bg-indigo-500/15"
              : "border-zinc-800 bg-zinc-900/35 hover:border-indigo-500/50"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-indigo-200">Sudah Order</span>
            <ShoppingCart className="h-4 w-4 text-indigo-300" />
          </div>
          <p className="mt-3 text-2xl font-bold text-zinc-50">{dashboardMetrics.ordered}</p>
          <p className="mt-1 text-xs text-zinc-500">Status Purchased</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("process")}
          className={`min-h-24 rounded-lg border px-4 py-3 text-left transition ${
            activeView === "process"
              ? "border-sky-400 bg-sky-500/15"
              : "border-zinc-800 bg-zinc-900/35 hover:border-sky-500/50"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-200">On Process</span>
            <Clock3 className="h-4 w-4 text-sky-300" />
          </div>
          <p className="mt-3 text-2xl font-bold text-zinc-50">{dashboardMetrics.process}</p>
          <p className="mt-1 text-xs text-zinc-500">{dashboardMetrics.overdue} lewat ETA</p>
        </button>

        <button
          type="button"
          onClick={() => setActiveView("received")}
          className={`min-h-24 rounded-lg border px-4 py-3 text-left transition ${
            activeView === "received"
              ? "border-emerald-400 bg-emerald-500/15"
              : "border-zinc-800 bg-zinc-900/35 hover:border-emerald-500/50"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-200">Diterima</span>
            <ClipboardCheck className="h-4 w-4 text-emerald-300" />
          </div>
          <p className="mt-3 text-2xl font-bold text-zinc-50">{dashboardMetrics.received}</p>
          <p className="mt-1 text-xs text-zinc-500">{formatRupiah(dashboardMetrics.receivedValue)} masuk stok</p>
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/35 p-3">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Procurement Pulse</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Pending approval {dashboardMetrics.approvalPending} · rejected/cancelled {dashboardMetrics.rejected}
            </p>
          </div>
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs font-semibold tabular-nums text-zinc-300">
            {formatRupiah(dashboardMetrics.receivedValue)} received
          </span>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          {[
            {
              label: "Request",
              value: dashboardMetrics.needOrder,
              tone: "text-red-200",
              bar: "bg-red-400",
              icon: AlertTriangle,
            },
            {
              label: "Ordered",
              value: dashboardMetrics.ordered,
              tone: "text-indigo-200",
              bar: "bg-indigo-400",
              icon: ShoppingCart,
            },
            {
              label: "Process",
              value: dashboardMetrics.process,
              tone: "text-sky-200",
              bar: "bg-sky-400",
              icon: Truck,
            },
            {
              label: "Received",
              value: dashboardMetrics.received,
              tone: "text-emerald-200",
              bar: "bg-emerald-400",
              icon: ClipboardCheck,
            },
          ].map((step) => {
            const StepIcon = step.icon;
            const width = rows.length > 0 ? Math.max(8, Math.round((step.value / rows.length) * 100)) : 8;
            return (
              <div key={step.label} className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <StepIcon className={`h-4 w-4 shrink-0 ${step.tone}`} />
                    <span className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      {step.label}
                    </span>
                  </div>
                  <span className={`text-sm font-bold tabular-nums ${step.tone}`}>{step.value}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className={`h-full rounded-full ${step.bar}`} style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {dashboardMetrics.topOverdueRows.length > 0 ? (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-red-100">
              <AlertTriangle className="h-4 w-4" />
              {dashboardMetrics.topOverdueRows.map((row) => (
                <span key={row.id} className="rounded-md bg-red-950/40 px-2 py-1">
                  {row.item_name} · ETA {formatDate(row.estimated_arrival_date)}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div id="po-request-form" className={PANEL_CLASS}>
          <div className="mb-3 flex flex-col gap-2 border-b border-zinc-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-100">
                {isEditing ? "Edit Request" : "Request Baru"}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Total estimasi {formatRupiah(estimatedTotal)}
              </p>
            </div>
            <div className="grid gap-2 sm:flex sm:items-center">
              {isEditing ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={resetForm}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-900 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                  Batal
                </button>
              ) : null}
              <button
                type="button"
                disabled={isSaving || !canEdit}
                onClick={() => void handleSaveForm()}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isEditing ? "Update" : "Simpan"}
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
                <label>
                  <span className={LABEL_CLASS}>Tanggal</span>
                  <input
                    type="date"
                    value={form.request_date}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, request_date: event.target.value }))
                    }
                    className={FIELD_CLASS}
                  />
                </label>
                <SearchablePicker
                  label="Bahan Persediaan"
                  value={form.ingredient_id}
                  options={ingredientOptions}
                  placeholder="Cari bahan persediaan"
                  emptyLabel="Manual"
                  onChange={handleIngredientChange}
                />
              </div>

              <label className="block">
                <span className={LABEL_CLASS}>Nama Barang</span>
                <input
                  value={form.item_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, item_name: event.target.value }))}
                  placeholder="Iceland Vodka"
                  className={FIELD_CLASS}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label>
                  <span className={LABEL_CLASS}>Department</span>
                  <select
                    value={form.department}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        department: event.target.value as PurchaseRequestDepartment,
                      }))
                    }
                    className={FIELD_CLASS}
                  >
                    <option value="bar">Bar</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="general">General</option>
                  </select>
                </label>
                <label>
                  <span className={LABEL_CLASS}>Qty</span>
                  <input
                    inputMode="decimal"
                    value={form.qty}
                    onChange={(event) => setForm((prev) => ({ ...prev, qty: event.target.value }))}
                    placeholder="2"
                    className={FIELD_CLASS}
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Satuan</span>
                  <input
                    value={form.unit}
                    onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
                    placeholder="Bottle / Kg"
                    className={FIELD_CLASS}
                  />
                </label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                <SearchablePicker
                  label="Supplier"
                  value={form.supplier_id}
                  options={supplierOptions}
                  placeholder="Cari supplier"
                  emptyLabel="Manual"
                  onChange={handleSupplierChange}
                />
                <label>
                  <span className={LABEL_CLASS}>Metode</span>
                  <select
                    value={form.purchase_method}
                    onChange={(event) =>
                      setForm((prev) => ({
                        ...prev,
                        purchase_method: event.target.value as PurchaseRequestMethod,
                      }))
                    }
                    className={FIELD_CLASS}
                  >
                    <option value="Online">Online</option>
                    <option value="Offline">Offline</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className={LABEL_CLASS}>Contact Supplier</span>
                  <input
                    value={form.supplier_contact}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, supplier_contact: event.target.value }))
                    }
                    placeholder="0812..."
                    className={FIELD_CLASS}
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Supplier Manual</span>
                  <input
                    value={form.supplier_name}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, supplier_name: event.target.value }))
                    }
                    placeholder="Pasar Modern BSD"
                    className={FIELD_CLASS}
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-[150px_1fr_150px]">
                <label>
                  <span className={LABEL_CLASS}>Harga Satuan</span>
                  <input
                    inputMode="decimal"
                    value={form.unit_price}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, unit_price: event.target.value }))
                    }
                    placeholder="250000"
                    className={FIELD_CLASS}
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Link / Toko</span>
                  <input
                    value={form.purchase_link}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, purchase_link: event.target.value }))
                    }
                    placeholder="Tokopedia / Indoguna / alamat toko"
                    className={FIELD_CLASS}
                  />
                </label>
                <label>
                  <span className={LABEL_CLASS}>Estimasi Datang</span>
                  <input
                    type="date"
                    value={form.estimated_arrival_date}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, estimated_arrival_date: event.target.value }))
                    }
                    className={FIELD_CLASS}
                  />
                </label>
              </div>

              <label className="block">
                <span className={LABEL_CLASS}>Keterangan</span>
                <input
                  value={form.note}
                  onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                  placeholder="Catatan"
                  className={FIELD_CLASS}
                />
              </label>
            </div>
          </div>

        </div>

        <aside className="space-y-3">
          <div className={PANEL_CLASS}>
            <div className="grid grid-cols-2 gap-2">
              {PURCHASE_STATUSES.map((status) => (
                <div key={status} className={`rounded-lg border px-3 py-2 ${STATUS_STYLE[status]}`}>
                  <p className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] opacity-80">
                    {status}
                  </p>
                  <p className="mt-1 text-lg font-bold">{statusCount(rows, status)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={PANEL_CLASS}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-zinc-100">Supplier</p>
              <p className="text-xs text-zinc-500">{suppliers.length} aktif</p>
            </div>
            <div className="space-y-2">
              {suppliers.slice(0, 5).map((supplier) => (
                <div key={supplier.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-100">{supplier.name}</p>
                      <p className="mt-0.5 truncate text-xs text-zinc-500">
                        {supplier.category || "General"} · PIC {supplier.pic_name || "-"}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-zinc-500">
                      {supplier.phone_number && supplier.phone_number !== "62"
                        ? supplier.phone_number
                        : "-"}
                    </p>
                  </div>
                </div>
              ))}
              {suppliers.length === 0 ? (
                <p className="text-sm text-zinc-500">Belum ada supplier aktif.</p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {success}
        </div>
      ) : null}

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/30">
        <div className="flex flex-col gap-3 border-b border-zinc-800 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-zinc-100">Monitoring PO</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {filteredRows.length} request · {MONITORING_VIEWS.find((view) => view.id === activeView)?.description}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[520px]">
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-1 sm:grid-cols-6">
              {MONITORING_VIEWS.map((view) => {
                const ViewIcon = view.icon;
                const active = activeView === view.id;
                return (
                  <button
                    key={view.id}
                    type="button"
                    onClick={() => setActiveView(view.id)}
                    className={`flex min-h-9 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-semibold transition ${
                      active
                        ? "bg-emerald-400 text-zinc-950"
                        : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                    }`}
                  >
                    <ViewIcon className="h-3.5 w-3.5" />
                    <span className="truncate">{view.label}</span>
                    <span className={active ? "text-zinc-800" : "text-zinc-600"}>
                      {monitoringCount(rows, view.id)}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari barang, supplier, status, PIC..."
                className="min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Memuat PO tracker...
          </div>
        ) : filteredRows.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-zinc-500">Belum ada request.</p>
        ) : (
          <div className="divide-y divide-zinc-800">
            {filteredRows.map((row, index) => {
              const rowLocked = isLockedPurchaseRow(row);
              const isDeleting = deletingRowId === row.id;
              const overdue = isOverdue(row);

              return (
                <article
                  key={row.id}
                  className="grid gap-3 px-3 py-3 text-sm text-zinc-300 lg:grid-cols-[minmax(240px,1.25fr)_minmax(180px,.85fr)_minmax(220px,1fr)_minmax(190px,.8fr)] lg:items-start"
                >
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-950 text-xs font-semibold text-zinc-500">
                      {index + 1}
                    </span>
	                    <div className="min-w-0">
	                      <h4 className="truncate text-sm font-semibold text-zinc-100">{row.item_name}</h4>
	                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
	                        <span className="rounded-md bg-zinc-950 px-2 py-0.5 capitalize">
	                          {departmentLabel(row.department)}
	                        </span>
	                        <span>{formatDate(row.request_date)}</span>
	                        <span>{row.ingredient_id ? "Stok master" : "Manual"}</span>
                          {overdue ? (
                            <span className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 font-semibold text-red-200">
                              Lewat ETA
                            </span>
                          ) : null}
	                      </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={!canEdit || rowLocked}
                            onClick={() => handleStartEdit(row)}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 text-xs font-semibold text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={!canEdit || rowLocked || isDeleting}
                            onClick={() => void handleDeleteRow(row)}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-red-500/40 px-2.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {isDeleting ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                            Hapus
                          </button>
                        </div>
	                    </div>
	                  </div>
	                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:block">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 shrink-0 text-zinc-500" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-100">{row.supplier_name || "-"}</p>
                      <p className="truncate text-xs text-zinc-500">{row.supplier_contact || "No contact"}</p>
                    </div>
                  </div>
                  <div className="mt-0 text-xs text-zinc-500 lg:mt-2">
                    {row.purchase_link && row.purchase_link.startsWith("http") ? (
                      <a
                        href={row.purchase_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sky-300"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {row.purchase_method}
                      </a>
                    ) : (
                      row.purchase_method
                    )}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <label>
                    <span className={LABEL_CLASS}>Status PO</span>
                    <select
                      value={row.po_status}
                      disabled={!canEdit || rowLocked}
                      onChange={(event) =>
                        void updateRow(row, {
                          po_status: event.target.value as PurchaseRequestPoStatus,
                        })
                      }
                      className={FIELD_CLASS}
                    >
                      {PO_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className={LABEL_CLASS}>Pembelian</span>
                    <select
                      value={row.purchase_status}
                      disabled={!canEdit || rowLocked}
                      onChange={(event) =>
                        void updateRow(row, {
                          purchase_status: event.target.value as PurchaseRequestStatus,
                        })
                      }
                      className={`mt-1 min-h-10 w-full rounded-lg border px-3 text-sm font-semibold outline-none transition focus:ring-1 ${STATUS_STYLE[row.purchase_status]}`}
                    >
                      {PURCHASE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="sm:col-span-2">
                    <span className={LABEL_CLASS}>Adjustment Tanggal</span>
                    <div className="mt-1 grid gap-2 sm:grid-cols-3">
                      <label>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-600">
                          Request
                        </span>
                        <input
                          type="date"
                          value={row.request_date}
                          disabled={!canEdit || rowLocked}
                          onChange={(event) =>
                            void updateRow(row, {
                              request_date: event.target.value || todayIso(),
                            })
                          }
                          className={FIELD_CLASS}
                        />
                      </label>
                      <label>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-600">
                          ETA
                        </span>
                        <input
                          type="date"
                          value={row.estimated_arrival_date ?? ""}
                          disabled={!canEdit || rowLocked}
                          onChange={(event) =>
                            void updateRow(row, {
                              estimated_arrival_date: event.target.value || null,
                            })
                          }
                          className={FIELD_CLASS}
                        />
                      </label>
                      <label>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-600">
                          Datang
                        </span>
                        <input
                          type="date"
                          value={row.arrival_date ?? ""}
                          disabled={!canEdit || rowLocked}
                          onChange={(event) =>
                            void updateRow(row, {
                              arrival_date: event.target.value || null,
                            })
                          }
                          className={FIELD_CLASS}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <span className={LABEL_CLASS}>Quick Actions</span>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={!canEdit || rowLocked || row.po_status === "Approved"}
                        onClick={() => void updateRow(row, { po_status: "Approved" })}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/35 px-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit || rowLocked || row.purchase_status === "Purchased"}
                        onClick={() =>
                          void updateRow(row, {
                            po_status: "Approved",
                            purchase_status: "Purchased",
                          })
                        }
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-indigo-500/35 px-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Ordered
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit || rowLocked || row.purchase_status === "Shipped"}
                        onClick={() =>
                          void updateRow(row, {
                            po_status: "Approved",
                            purchase_status: "Shipped",
                          })
                        }
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-sky-500/35 px-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Truck className="h-3.5 w-3.5" />
                        Shipped
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit || rowLocked}
                        onClick={() =>
                          void updateRow(row, {
                            po_status: "Approved",
                            purchase_status: "Arrived",
                          })
                        }
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/35 px-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <PackageCheck className="h-3.5 w-3.5" />
                        Terima
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <PackageCheck className="h-3.5 w-3.5" />
                        Qty
                      </div>
                      <p className="mt-1 font-semibold text-zinc-100">
                        {Number(row.qty).toLocaleString("id-ID")} {row.unit}
                      </p>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <CircleDollarSign className="h-3.5 w-3.5" />
                        Total
                      </div>
                      <p className="mt-1 font-semibold text-zinc-100">
                        {formatRupiah(Number(row.total_price))}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-zinc-500">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      ETA {formatDate(row.estimated_arrival_date)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UserRound className="h-3.5 w-3.5" />
                      {row.pic_request_name || "-"}
                    </div>
                  </div>
                  {row.stock_applied_at ? (
                    <div className="inline-flex w-fit items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Stok +{Number(row.stock_applied_qty).toLocaleString("id-ID")}
                    </div>
                  ) : null}
                  {row.note ? <p className="text-xs leading-relaxed text-zinc-500">{row.note}</p> : null}
                </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
