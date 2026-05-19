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
  "min-h-11 w-full min-w-0 rounded-xl border border-zinc-700 bg-zinc-900 py-2.5 pl-10 pr-10 text-sm text-slate-100 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

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
        <div className="flex items-center gap-2 text-slate-300">
          <Truck className="h-5 w-5 text-indigo-400" />
          <p className="text-sm">
            Kelola profil supplier, nomor WhatsApp operasional, dan batas
            minimum order.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
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
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 transition hover:text-zinc-200"
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
              className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 font-semibold text-white transition hover:bg-indigo-500"
            >
              <Plus className="h-4 w-4" />
              Tambah Supplier
            </button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          Memuat supplier dari Supabase…
        </div>
      ) : suppliers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 py-16 text-center text-sm text-slate-400">
          Belum ada supplier. Klik &quot;Tambah Supplier&quot; untuk mulai.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-700 bg-zinc-900/40">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-zinc-800 text-zinc-400">
              <tr>
                <th className="w-14 px-4 py-3 font-medium">No</th>
                <th className="px-4 py-3 font-medium">Nama Supplier</th>
                <th className="px-4 py-3 font-medium">WhatsApp</th>
                <th className="px-4 py-3 font-medium">Min. Order</th>
                <th className="px-4 py-3 text-right font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-700/80">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td
                    colSpan={TABLE_COL_COUNT}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    {emptyTableMessage}
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`bg-zinc-900/60 ${!item.is_active ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3 tabular-nums text-zinc-500">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-100">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-slate-300">
                      {formatWhatsAppDisplay(item.phone_number)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-300">
                      {formatRupiah(Number(item.min_order_amount))}
                    </td>
                    <td className="px-4 py-3">
                      {canEdit ? (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            disabled={!item.is_active}
                            className="flex min-h-9 min-w-9 items-center justify-center rounded-lg text-indigo-400 ring-1 ring-zinc-600 transition hover:bg-indigo-600/10 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={`Edit ${item.name}`}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="block text-right text-xs text-zinc-500">—</span>
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
