"use client";

import {
  SupplierModal,
  type SupplierRecord,
} from "@/components/admin/SupplierModal";
import { Toast } from "@/components/ui/Toast";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SupplierRow } from "@/lib/types/database";
import { Edit, Loader2, Plus, Search, Truck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type SupplierListItem = SupplierRow;

const SEARCH_INPUT_CLASS =
  "min-h-11 w-full min-w-0 rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-500";

const TABLE_COL_COUNT = 5;

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatWhatsAppDisplay(phone: string): string {
  if (!phone || phone === "62") return "—";
  return phone;
}

function toModalRecord(item: SupplierListItem): SupplierRecord {
  return {
    id: item.id,
    name: item.name,
    phone_number: item.phone_number,
    min_order_amount: item.min_order_amount,
    is_active: item.is_active,
  };
}

export function SuppliersTab() {
  const supabase = getSupabaseClient();
  const canEdit = canEditStaffData(getStaffSession()?.role);

  const [suppliers, setSuppliers] = useState<SupplierListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRecord | null>(
    null,
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  const fetchSuppliers = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from("supplier")
        .select(
          "id, name, phone_number, min_order_amount, is_active, created_at, updated_at",
        )
        .order("name", { ascending: true });

      if (error) throw error;

      setSuppliers((data ?? []) as SupplierListItem[]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Gagal memuat data supplier.";
      setToast({ message, variant: "error" });
      setSuppliers([]);
    }

    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void fetchSuppliers();
  }, [fetchSuppliers]);

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredSuppliers = useMemo(() => {
    return suppliers.filter((item) => {
      if (!normalizedSearch) return true;
      const haystack = `${item.name} ${item.phone_number}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [suppliers, normalizedSearch]);

  const openCreateModal = () => {
    setEditingSupplier(null);
    setIsModalOpen(true);
  };

  const openEditModal = (item: SupplierListItem) => {
    setEditingSupplier(toModalRecord(item));
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
  };

  const emptyTableMessage = normalizedSearch
    ? `Supplier dengan kata kunci '${searchTerm.trim()}' tidak ditemukan.`
    : "Belum ada supplier terdaftar.";

  return (
    <div className="space-y-4">
      <Toast
        message={toast?.message ?? null}
        variant={toast?.variant ?? "success"}
        onDismiss={() => setToast(null)}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-slate-600">
          <Truck className="h-5 w-5 text-teal-700" />
          <p className="text-sm font-medium leading-6">
            Kelola profil supplier, nomor WhatsApp operasional, dan batas
            minimum order.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari nama atau nomor WA…"
              autoCorrect="off"
              spellCheck={false}
              className={SEARCH_INPUT_CLASS}
              aria-label="Cari supplier"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                aria-label="Hapus pencarian"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          {canEdit ? (
            <button
              type="button"
              onClick={openCreateModal}
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 font-semibold text-white transition hover:bg-teal-600"
            >
              <Plus className="h-4 w-4" />
              Tambah Supplier
            </button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
          Memuat supplier dari Supabase…
        </div>
      ) : suppliers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm font-medium text-slate-600">
          Belum ada supplier. Klik &quot;Tambah Supplier&quot; untuk mulai.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-600">
              <tr>
                <th className="w-14 px-4 py-3.5 font-semibold">No</th>
                <th className="px-4 py-3.5 font-semibold">Nama Supplier</th>
                <th className="px-4 py-3.5 font-semibold">WhatsApp</th>
                <th className="px-4 py-3.5 font-semibold">Min. Order</th>
                <th className="px-4 py-3.5 text-right font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td
                    colSpan={TABLE_COL_COUNT}
                    className="px-4 py-12 text-center text-sm font-medium text-slate-600"
                  >
                    {emptyTableMessage}
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`border-b border-slate-100 bg-white transition-colors last:border-b-0 hover:bg-slate-50/80 ${!item.is_active ? "opacity-60" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium tabular-nums text-slate-900">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm font-medium text-slate-900">
                      {formatWhatsAppDisplay(item.phone_number)}
                    </td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-slate-900">
                      {formatRupiah(Number(item.min_order_amount))}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            disabled={!item.is_active}
                            className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-teal-700 ring-1 ring-slate-200 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Edit ${item.name}`}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="block text-right text-xs font-medium text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <SupplierModal
        open={isModalOpen}
        supplier={editingSupplier}
        onClose={closeModal}
        onSaved={fetchSuppliers}
        onSuccess={(message) => setToast({ message, variant: "success" })}
        onError={(message) => setToast({ message, variant: "error" })}
      />
    </div>
  );
}
