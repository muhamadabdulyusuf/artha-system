"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { IngredientKind, SupplierRow } from "@/lib/types/database";

export type IngredientUnit =
  | "gr"
  | "kg"
  | "ml"
  | "liter"
  | "pcs"
  | "biji"
  | "butir"
  | "botol"
  | "kaleng"
  | "pack"
  | "box"
  | "dus"
  | "karton"
  | "pouch"
  | "slop"
  | "bungkus"
  | "sak"
  | "pail"
  | "porsi"
  | "ikat";

export type IngredientDepartment = "bar" | "kitchen";

export type IngredientRecord = {
  id: string;
  name: string;
  unit: IngredientUnit;
  purchase_unit: IngredientUnit | null;
  purchase_to_stock_factor: number;
  department: IngredientDepartment;
  minimum_stock: number;
  kind: IngredientKind;
  is_stock_tracked: boolean;
  primary_supplier_id: string | null;
  is_active: boolean;
};

type IngredientModalProps = {
  open: boolean;
  ingredient: IngredientRecord | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

type FormData = {
  name: string;
  unit: IngredientUnit;
  purchase_unit: "" | IngredientUnit;
  purchase_to_stock_factor: string;
  department: IngredientDepartment;
  minimum_stock: string;
  kind: IngredientKind;
  is_stock_tracked: boolean;
  primary_supplier_id: string;
};

const FORM_UNITS: IngredientUnit[] = [
  "gr",
  "kg",
  "ml",
  "liter",
  "pcs",
  "biji",
  "butir",
  "botol",
  "kaleng",
  "pack",
  "box",
  "dus",
  "karton",
  "pouch",
  "slop",
  "bungkus",
  "sak",
  "pail",
  "porsi",
  "ikat",
];

const DEPARTMENTS: { value: IngredientDepartment; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "kitchen", label: "Kitchen" },
];

const SELECT_CLASS =
  "min-h-12 w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 text-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";

const INPUT_CLASS =
  "min-h-12 w-full rounded-xl border border-zinc-600 bg-zinc-950 px-4 text-white placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";

const EMPTY_FORM: FormData = {
  name: "",
  unit: "gr",
  purchase_unit: "",
  purchase_to_stock_factor: "1",
  department: "bar",
  minimum_stock: "",
  kind: "raw",
  is_stock_tracked: true,
  primary_supplier_id: "",
};

function parseMinimumStock(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function parseConversionFactor(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return 1;
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function IngredientModal({
  open,
  ingredient,
  onClose,
  onSaved,
  onError,
  onSuccess,
}: IngredientModalProps) {
  const supabase = getSupabaseClient();
  const isEditing = ingredient !== null;

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [suppliers, setSuppliers] = useState<Pick<SupplierRow, "id" | "name">[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    void supabase
      .from("supplier")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (!error) setSuppliers(data ?? []);
      });

    if (ingredient) {
      setFormData({
        name: ingredient.name,
        unit: ingredient.unit,
        purchase_unit: ingredient.purchase_unit ?? "",
        purchase_to_stock_factor: String(ingredient.purchase_to_stock_factor ?? 1),
        department: ingredient.department,
        minimum_stock: String(ingredient.minimum_stock ?? 0),
        kind: ingredient.kind ?? "raw",
        is_stock_tracked: ingredient.is_stock_tracked ?? true,
        primary_supplier_id: ingredient.primary_supplier_id ?? "",
      });
    } else {
      setFormData(EMPTY_FORM);
    }
  }, [open, ingredient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      onError("Nama bahan baku wajib diisi.");
      return;
    }

    const minimum_stock = parseMinimumStock(formData.minimum_stock);
    if (minimum_stock === null) {
      onError("Batas stok minimum harus berupa angka ≥ 0.");
      return;
    }

    const purchase_to_stock_factor = parseConversionFactor(formData.purchase_to_stock_factor);
    if (purchase_to_stock_factor === null) {
      onError("Isi per satuan beli harus angka lebih dari 0.");
      return;
    }

    const purchase_unit = formData.purchase_unit || null;

    setIsSubmitting(true);

    try {
      if (isEditing && ingredient) {
        const { error } = await supabase
          .from("ingredient")
          .update({
            name: trimmedName,
            unit: formData.unit,
            purchase_unit,
            purchase_to_stock_factor,
            department: formData.department,
            minimum_stock,
            kind: formData.kind,
            is_stock_tracked: formData.is_stock_tracked,
            primary_supplier_id: formData.primary_supplier_id || null,
          })
          .eq("id", ingredient.id);

        if (error) throw error;
        onSuccess("Bahan baku berhasil diperbarui.");
      } else {
        const { error } = await supabase.from("ingredient").insert([
          {
            name: trimmedName,
            unit: formData.unit,
            purchase_unit,
            purchase_to_stock_factor,
            department: formData.department,
            minimum_stock,
            kind: formData.kind,
            is_stock_tracked: formData.is_stock_tracked,
            primary_supplier_id: formData.primary_supplier_id || null,
            is_active: true,
          },
        ]);

        if (error) throw error;
        onSuccess("Bahan baku berhasil ditambahkan.");
      }

      onClose();
      await onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan bahan baku.";
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={isEditing ? "Edit Bahan Baku" : "Tambah Bahan Baku"}
      onClose={onClose}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-400">Nama Bahan Baku</span>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Contoh: Espresso Beans, Susu UHT, Jeruk Nipis…"
            className={INPUT_CLASS}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-400">
            Satuan Stok
          </span>
          <select
            value={formData.unit}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, unit: e.target.value as IngredientUnit }))
            }
            className={SELECT_CLASS}
          >
            {FORM_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Dipakai untuk resep, out stock, opname, dan ledger stok.
          </p>
        </label>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-400">
              Satuan Beli / Receive
            </span>
            <select
              value={formData.purchase_unit}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  purchase_unit: e.target.value as "" | IngredientUnit,
                }))
              }
              className={SELECT_CLASS}
            >
              <option value="">Sama dengan stok</option>
              {FORM_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-zinc-400">
              Isi per Satuan Beli
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0.0001}
              step="any"
              value={formData.purchase_to_stock_factor}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  purchase_to_stock_factor: e.target.value,
                }))
              }
              placeholder="Contoh: 50"
              className={INPUT_CLASS}
            />
          </label>
        </div>
        <p className="-mt-2 text-xs text-zinc-500">
          Contoh: stok pcs, receive pack, isi 50 berarti 1 pack masuk sebagai 50 pcs.
        </p>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-400">Jenis Bahan</span>
          <select
            value={formData.kind}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, kind: e.target.value as IngredientKind }))
            }
            className={SELECT_CLASS}
          >
            <option value="raw">Bahan Baku (Raw)</option>
            <option value="premix">Premix / WIP (bisa punya resep produksi)</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Premix diproduksi di dapur/bar dan bisa dipakai sebagai komponen menu atau premix lain.
          </p>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-400">Departemen</span>
          <select
            value={formData.department}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                department: e.target.value as IngredientDepartment,
              }))
            }
            className={SELECT_CLASS}
          >
            {DEPARTMENTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-400">Supplier Utama</span>
          <select
            value={formData.primary_supplier_id}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, primary_supplier_id: e.target.value }))
            }
            className={SELECT_CLASS}
          >
            <option value="">Belum ditentukan</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Dipakai untuk mengelompokkan list order low stock ke purchasing.
          </p>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-400">
            Batas Stok Minimum (Warning Low Stock)
          </span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={formData.minimum_stock}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, minimum_stock: e.target.value }))
            }
            placeholder="Contoh: 1000"
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-zinc-700 bg-zinc-950/60 p-3">
          <input
            type="checkbox"
            checked={formData.is_stock_tracked}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, is_stock_tracked: e.target.checked }))
            }
            className="mt-1 h-4 w-4 rounded border-zinc-600 bg-zinc-950 text-indigo-600 focus:ring-indigo-500"
          />
          <span>
            <span className="block text-sm font-medium text-zinc-200">
              Dilacak sebagai stok
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-zinc-500">
              Matikan untuk bahan unlimited/non-inventory seperti air keran. Bahan tetap bisa
              dipakai di resep, tapi tidak muncul di worksheet, ledger, low stock, atau adjustment.
            </span>
          </span>
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Menyimpan ke Supabase…
            </>
          ) : isEditing ? (
            "Simpan Perubahan"
          ) : (
            "Simpan Bahan Baku"
          )}
        </button>
      </form>
    </Modal>
  );
}
