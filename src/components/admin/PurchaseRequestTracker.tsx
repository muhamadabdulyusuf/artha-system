"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  PackageCheck,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
} from "lucide-react";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
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

const PURCHASE_STATUSES: PurchaseRequestStatus[] = [
  "Belum Dibeli",
  "On Progress",
  "Purchased",
  "Shipped",
  "Arrived",
  "Cancelled",
];

const PO_STATUSES: PurchaseRequestPoStatus[] = ["Pending", "Approved", "Rejected"];

const STATUS_STYLE: Record<PurchaseRequestStatus, string> = {
  "Belum Dibeli": "border-red-500/40 bg-red-500/10 text-red-200",
  "On Progress": "border-amber-500/40 bg-amber-500/10 text-amber-100",
  Purchased: "border-indigo-500/40 bg-indigo-500/10 text-indigo-100",
  Shipped: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  Arrived: "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  Cancelled: "border-zinc-500/40 bg-zinc-500/10 text-zinc-300",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

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

function statusCount(rows: PurchaseRequestTrackerRow[], status: PurchaseRequestStatus): number {
  return rows.filter((row) => row.purchase_status === status).length;
}

export function PurchaseRequestTracker() {
  const supabase = getSupabaseClient();
  const canEdit = canEditStaffData(getStaffSession()?.role);

  const [rows, setRows] = useState<PurchaseRequestTrackerRow[]>([]);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [form, setForm] = useState<TrackerForm>(() => newForm());
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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
    if (!query) return rows;
    return rows.filter((row) =>
      [
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
        .includes(query),
    );
  }, [rows, search]);

  const selectedIngredient = ingredients.find((item) => item.id === form.ingredient_id) ?? null;
  const selectedSupplier = suppliers.find((item) => item.id === form.supplier_id) ?? null;
  const estimatedTotal = parseNumber(form.qty) * parseNumber(form.unit_price);

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

  const handleCreate = async () => {
    const staff = getStaffSession();
    const qty = parseNumber(form.qty);
    const unitPrice = parseNumber(form.unit_price);

    if (!canEdit) {
      setError("Akun ini tidak punya akses membuat PO tracker.");
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

    const { error: insertError } = await supabase.from("purchase_request_tracker").insert({
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
      pic_request_staff_id: staff?.id ?? null,
      pic_request_name: staff?.name ?? "",
      estimated_arrival_date: form.estimated_arrival_date || null,
      note: form.note.trim(),
    });

    if (insertError) {
      setError(insertError.message);
      setIsSaving(false);
      return;
    }

    setForm(newForm());
    setSuccess("Request PO berhasil dicatat.");
    await loadData();
    setIsSaving(false);
  };

  const updateRow = async (
    row: PurchaseRequestTrackerRow,
    patch: PurchaseRequestUpdate,
  ) => {
    if (!canEdit) {
      setError("Akun ini tidak punya akses mengubah PO tracker.");
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

    const { error: updateError } = await supabase
      .from("purchase_request_tracker")
      .update(nextPatch)
      .eq("id", row.id);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setSuccess(
      patch.purchase_status === "Arrived"
        ? `${row.item_name} diterima dan stok master otomatis ditambah.`
        : "PO tracker berhasil diperbarui.",
    );
    await loadData();
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-emerald-300" />
            <h3 className="text-base font-semibold text-zinc-100">PO Tracker</h3>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Barang yang statusnya Arrived langsung menambah stok master jika terhubung ke bahan persediaan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {PURCHASE_STATUSES.map((status) => (
          <div key={status} className={`rounded-lg border px-3 py-2 ${STATUS_STYLE[status]}`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">{status}</p>
            <p className="mt-1 text-xl font-bold">{statusCount(rows, status)}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="grid gap-3 lg:grid-cols-12">
          <label className="lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Tanggal
            </span>
            <input
              type="date"
              value={form.request_date}
              onChange={(event) => setForm((prev) => ({ ...prev, request_date: event.target.value }))}
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
            />
          </label>

          <label className="lg:col-span-4">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Bahan Persediaan
            </span>
            <select
              value={form.ingredient_id}
              onChange={(event) => handleIngredientChange(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
            >
              <option value="">Manual / belum terhubung</option>
              {ingredients.map((ingredient) => (
                <option key={ingredient.id} value={ingredient.id}>
                  {ingredient.name} - {ingredient.department}
                </option>
              ))}
            </select>
          </label>

          <label className="lg:col-span-4">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Nama Barang
            </span>
            <input
              value={form.item_name}
              onChange={(event) => setForm((prev) => ({ ...prev, item_name: event.target.value }))}
              placeholder="Iceland Vodka"
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-400"
            />
          </label>

          <label className="lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Department
            </span>
            <select
              value={form.department}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  department: event.target.value as PurchaseRequestDepartment,
                }))
              }
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
            >
              <option value="bar">Bar</option>
              <option value="kitchen">Kitchen</option>
              <option value="general">General</option>
            </select>
          </label>

          <label className="lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Qty
            </span>
            <input
              inputMode="decimal"
              value={form.qty}
              onChange={(event) => setForm((prev) => ({ ...prev, qty: event.target.value }))}
              placeholder="2"
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-400"
            />
          </label>

          <label className="lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Satuan
            </span>
            <input
              value={form.unit}
              onChange={(event) => setForm((prev) => ({ ...prev, unit: event.target.value }))}
              placeholder="Bottle / Kg"
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-400"
            />
          </label>

          <label className="lg:col-span-4">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Supplier
            </span>
            <select
              value={form.supplier_id}
              onChange={(event) => handleSupplierChange(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
            >
              <option value="">Isi manual / belum ada supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>

          <label className="lg:col-span-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Contact Supplier
            </span>
            <input
              value={form.supplier_contact}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, supplier_contact: event.target.value }))
              }
              placeholder="0812..."
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-400"
            />
          </label>

          <label className="lg:col-span-3">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Supplier Manual
            </span>
            <input
              value={form.supplier_name}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, supplier_name: event.target.value }))
              }
              placeholder="Pasar Modern BSD"
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-400"
            />
          </label>

          <label className="lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Harga Satuan
            </span>
            <input
              inputMode="decimal"
              value={form.unit_price}
              onChange={(event) => setForm((prev) => ({ ...prev, unit_price: event.target.value }))}
              placeholder="250000"
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-400"
            />
          </label>

          <label className="lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Metode
            </span>
            <select
              value={form.purchase_method}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  purchase_method: event.target.value as PurchaseRequestMethod,
                }))
              }
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
            >
              <option value="Online">Online</option>
              <option value="Offline">Offline</option>
            </select>
          </label>

          <label className="lg:col-span-4">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Link / Toko
            </span>
            <input
              value={form.purchase_link}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, purchase_link: event.target.value }))
              }
              placeholder="Tokopedia / Indoguna / alamat toko"
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-400"
            />
          </label>

          <label className="lg:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Estimasi Datang
            </span>
            <input
              type="date"
              value={form.estimated_arrival_date}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, estimated_arrival_date: event.target.value }))
              }
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-emerald-400"
            />
          </label>

          <label className="lg:col-span-6">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Keterangan
            </span>
            <input
              value={form.note}
              onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
              placeholder="Menunggu pengiriman / barang kosong / sudah diterima lengkap"
              className="mt-1 min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-400"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-col gap-2 border-t border-zinc-800 pt-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-zinc-400">
            Total: <span className="font-semibold text-zinc-100">{formatRupiah(estimatedTotal)}</span>
            {selectedIngredient ? (
              <span className="ml-2 text-zinc-500">
                Masuk stok dengan konversi {Number(selectedIngredient.purchase_to_stock_factor) || 1}x.
              </span>
            ) : null}
          </div>
          <button
            type="button"
            disabled={isSaving || !canEdit}
            onClick={() => void handleCreate()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-4 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Simpan Request
          </button>
        </div>
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

      <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="relative md:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari barang, supplier, status, PIC..."
            className="min-h-10 w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-emerald-400"
          />
        </div>
        <p className="text-sm text-zinc-500">{filteredRows.length} request tampil</p>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-zinc-800">
        <table className="min-w-[1320px] w-full text-left text-sm">
          <thead className="bg-zinc-950 text-xs uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              <th className="px-3 py-3">No</th>
              <th className="px-3 py-3">Request</th>
              <th className="px-3 py-3">Barang</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Supplier</th>
              <th className="px-3 py-3">Harga</th>
              <th className="px-3 py-3">PO</th>
              <th className="px-3 py-3">Pembelian</th>
              <th className="px-3 py-3">Datang</th>
              <th className="px-3 py-3">PIC</th>
              <th className="px-3 py-3">Ket.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {isLoading ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-zinc-500">
                  <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                  Memuat PO tracker...
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-zinc-500">
                  Belum ada request pembelian.
                </td>
              </tr>
            ) : (
              filteredRows.map((row, index) => (
                <tr key={row.id} className="bg-zinc-950/30 align-top text-zinc-300">
                  <td className="px-3 py-3 text-zinc-500">{index + 1}</td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-zinc-100">{row.request_date}</div>
                    <div className="mt-1 text-xs capitalize text-zinc-500">{row.department}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-zinc-100">{row.item_name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {row.ingredient_id ? "Terhubung ke stok master" : "Manual, belum auto stok"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold text-zinc-100">
                      {Number(row.qty).toLocaleString("id-ID")} {row.unit}
                    </div>
                    {row.stock_applied_at ? (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100">
                        <PackageCheck className="h-3.5 w-3.5" />
                        +{Number(row.stock_applied_qty).toLocaleString("id-ID")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-zinc-100">{row.supplier_name || "-"}</div>
                    <div className="mt-1 text-xs text-zinc-500">{row.supplier_contact || "No contact"}</div>
                    {row.purchase_link ? (
                      <a
                        href={row.purchase_link.startsWith("http") ? row.purchase_link : undefined}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-sky-300"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {row.purchase_method}
                      </a>
                    ) : (
                      <div className="mt-1 text-xs text-zinc-600">{row.purchase_method}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div>{formatRupiah(Number(row.unit_price))}</div>
                    <div className="mt-1 font-semibold text-zinc-100">
                      {formatRupiah(Number(row.total_price))}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={row.po_status}
                      disabled={!canEdit}
                      onChange={(event) =>
                        void updateRow(row, {
                          po_status: event.target.value as PurchaseRequestPoStatus,
                        })
                      }
                      className="min-h-9 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-emerald-400"
                    >
                      {PO_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <div className="mt-1 text-xs text-zinc-500">
                      {row.approved_by_name || "Belum approve"}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={row.purchase_status}
                      disabled={!canEdit}
                      onChange={(event) =>
                        void updateRow(row, {
                          purchase_status: event.target.value as PurchaseRequestStatus,
                        })
                      }
                      className={`min-h-9 rounded-lg border px-2 text-sm font-semibold outline-none ${STATUS_STYLE[row.purchase_status]}`}
                    >
                      {PURCHASE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    {row.purchase_status === "Arrived" ? (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-200">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Stok terkoreksi
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-xs text-zinc-500">ETA {row.estimated_arrival_date || "-"}</div>
                    <input
                      type="date"
                      value={row.arrival_date ?? ""}
                      disabled={!canEdit || row.stock_applied_at !== null}
                      onChange={(event) =>
                        void updateRow(row, {
                          arrival_date: event.target.value || null,
                        })
                      }
                      className="mt-1 min-h-9 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-100 outline-none focus:border-emerald-400 disabled:opacity-60"
                    />
                    <div className="mt-1 text-xs text-zinc-500">
                      Selisih {row.arrival_day_diff ?? "-"} hari
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-zinc-100">{row.pic_request_name || "-"}</div>
                    <div className="mt-1 text-xs text-zinc-500">{row.approved_by_name || "-"}</div>
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-zinc-400">{row.note || "-"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-zinc-100">Supplier List</p>
          <p className="text-xs text-zinc-500">{suppliers.length} supplier aktif</p>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.slice(0, 9).map((supplier) => (
            <div key={supplier.id} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">{supplier.name}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {supplier.category || "General"} - PIC {supplier.pic_name || "-"}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-zinc-500">
                  {supplier.phone_number && supplier.phone_number !== "62" ? supplier.phone_number : "-"}
                </p>
              </div>
              {supplier.link_url ? (
                <p className="mt-1 truncate text-xs text-sky-300">{supplier.link_url}</p>
              ) : null}
            </div>
          ))}
          {suppliers.length === 0 ? (
            <p className="text-sm text-zinc-500">Belum ada supplier aktif.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
