"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { SupplierRow } from "@/lib/types/database";

export type SupplierRecord = Pick<
  SupplierRow,
  "id" | "name" | "phone_number" | "min_order_amount" | "is_active"
>;

type SupplierFormData = {
  name: string;
  phone_number: string;
  min_order_amount: string;
};

type SupplierModalProps = {
  open: boolean;
  supplier: SupplierRecord | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
};

const INITIAL_FORM_DATA: SupplierFormData = {
  name: "",
  phone_number: "",
  min_order_amount: "0",
};

const INPUT_CLASS =
  "min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-slate-100 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40";

const NOTE_CLASS = "mt-1.5 text-xs text-zinc-500";

function sanitizeWhatsAppPhoneInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

function isValidWhatsAppPhone(phone: string): boolean {
  if (!phone.startsWith("62")) return false;
  if (phone.length < 11) return false;
  if (phone === "62") return false;
  return true;
}

function parseMinOrderAmount(value: string): number {
  const parsed = parseFloat(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

export function SupplierModal({
  open,
  supplier,
  onClose,
  onSaved,
  onError,
  onSuccess,
}: SupplierModalProps) {
  const supabase = getSupabaseClient();
  const isEditing = supplier !== null;
  const supplierId = supplier?.id ?? null;

  const [formData, setFormData] = useState<SupplierFormData>(INITIAL_FORM_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    if (supplier) {
      setFormData({
        name: supplier.name,
        phone_number:
          supplier.phone_number && supplier.phone_number !== "62"
            ? supplier.phone_number
            : "",
        min_order_amount: String(Number(supplier.min_order_amount) || 0),
      });
    } else {
      setFormData(INITIAL_FORM_DATA);
    }
  }, [open, supplier]);

  const updateFormField = <K extends keyof SupplierFormData>(field: K, value: SupplierFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePhoneChange = (value: string) => {
    updateFormField("phone_number", sanitizeWhatsAppPhoneInput(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      onError("Nama supplier wajib diisi.");
      return;
    }

    const phoneNumber = sanitizeWhatsAppPhoneInput(formData.phone_number);
    if (!isValidWhatsAppPhone(phoneNumber)) {
      onError(
        "Nomor WhatsApp tidak valid. Gunakan format 62xxxxxxxxxx tanpa tanda + atau angka 0 di depan."
      );
      return;
    }

    const minOrderAmount = parseMinOrderAmount(formData.min_order_amount);

    setIsSubmitting(true);

    try {
      if (isEditing && supplierId) {
        const { error } = await supabase
          .from("supplier")
          .update({
            name: trimmedName,
            phone_number: phoneNumber,
            min_order_amount: minOrderAmount,
          })
          .eq("id", supplierId);

        if (error) throw error;
        onSuccess("Supplier berhasil diperbarui.");
      } else {
        const { error } = await supabase.from("supplier").insert([
          {
            name: trimmedName,
            phone_number: phoneNumber,
            min_order_amount: minOrderAmount,
            is_active: true,
          },
        ]);

        if (error) throw error;
        onSuccess("Supplier berhasil ditambahkan.");
      }

      onClose();
      await onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal menyimpan supplier.";
      onError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={isEditing ? "Edit Supplier" : "Tambah Supplier"}
      onClose={onClose}
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-300">Nama Supplier</span>
          <input
            type="text"
            name="supplier_name"
            required
            value={formData.name}
            onChange={(e) => updateFormField("name", e.target.value)}
            placeholder="Contoh: PT Sumber Bahan Segar"
            autoComplete="organization"
            className={INPUT_CLASS}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-300">Nomor WhatsApp</span>
          <input
            type="text"
            name="phone_number"
            required
            inputMode="tel"
            value={formData.phone_number}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="628123456789"
            autoComplete="tel"
            className={INPUT_CLASS}
          />
          <p className={NOTE_CLASS}>
            Wajib diawali kode negara 62 tanpa tanda + atau angka 0 di depan
          </p>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-300">Minimal Order (Rp)</span>
          <input
            type="number"
            name="min_order_amount"
            required
            min={0}
            step={1}
            inputMode="decimal"
            value={formData.min_order_amount}
            onChange={(e) => updateFormField("min_order_amount", e.target.value)}
            placeholder="0"
            className={INPUT_CLASS}
          />
        </label>

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 font-semibold text-slate-300 transition hover:border-zinc-600 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Menyimpan…
              </>
            ) : (
              "Simpan Supplier"
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
