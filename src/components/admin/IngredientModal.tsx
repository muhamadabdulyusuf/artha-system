"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getSupabaseClient } from "@/lib/supabase/client";

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
  department: IngredientDepartment;
  minimum_stock: number;
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
  department: IngredientDepartment;
  minimum_stock: string;
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
  department: "bar",
  minimum_stock: "",
};

function parseMinimumStock(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return null;
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (ingredient) {
      setFormData({
        name: ingredient.name,
        unit: ingredient.unit,
        department: ingredient.department,
        minimum_stock: String(ingredient.minimum_stock ?? 0),
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

    setIsSubmitting(true);

    try {
      if (isEditing && ingredient) {
        const { error } = await supabase
          .from("ingredient")
          .update({
            name: trimmedName,
            unit: formData.unit,
            department: formData.department,
            minimum_stock,
          })
          .eq("id", ingredient.id);

        if (error) throw error;
        onSuccess("Bahan baku berhasil diperbarui.");
      } else {
        const { error } = await supabase.from("ingredient").insert([
          {
            name: trimmedName,
            unit: formData.unit,
            department: formData.department,
            minimum_stock,
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
          <span className="mb-1.5 block text-sm font-medium text-zinc-400">Satuan Unit</span>
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
