export type WorksheetToastVariant = "error" | "warning";

export type TranslatedWorksheetError = {
  title: string;
  description: string;
  variant: WorksheetToastVariant;
};

function pickString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  return null;
}

/** Menggabungkan pesan dari Error, PostgrestError, atau object bebas. */
export function extractWorksheetErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;

  if (typeof err === "object" && err !== null) {
    const record = err as Record<string, unknown>;
    const direct =
      pickString(record.message) ??
      pickString(record.error_description) ??
      pickString(record.details);
    if (direct) return direct;

    if (record.error && typeof record.error === "object") {
      const nested = extractWorksheetErrorMessage(record.error);
      if (nested) return nested;
    }
  }

  if (typeof err === "string" && err.trim()) return err;
  return "Kesalahan tidak diketahui";
}

function includesConstraint(raw: string, constraintName: string): boolean {
  const lower = raw.toLowerCase();
  const needle = constraintName.toLowerCase();
  return (
    lower.includes(`violates check constraint "${needle}"`) ||
    lower.includes(needle)
  );
}

function isNetworkError(raw: string): boolean {
  const lower = raw.toLowerCase();
  return (
    lower.includes("network") ||
    lower.includes("fetch failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("timeout") ||
    lower.includes("networkerror")
  );
}

/**
 * Memetakan error Supabase/Postgres ke notifikasi Toast staff (Bahasa Indonesia).
 */
export function translateWorksheetSubmitError(err: unknown): TranslatedWorksheetError {
  const raw = extractWorksheetErrorMessage(err);

  if (includesConstraint(raw, "stock_ledger_closing_formula")) {
    return {
      title: "❌ Gagal Kirim: Selisih Opname Terlalu Gede!",
      description:
        "Angka fisik yang Anda masukkan tidak sinkron dengan hitungan sistem. Tolong hitung ulang kembali barang di rak bar, pastikan tidak ada salah ketik (typo seperti kurang angka nol), lalu coba submit lagi.",
      variant: "error",
    };
  }

  if (includesConstraint(raw, "worksheet_session_submitted_requires_staff")) {
    const needsMigration =
      raw.toLowerCase().includes("pending_approval_admin") ||
      raw.toLowerCase().includes("invalid input value for enum");

    if (needsMigration) {
      return {
        title: "❌ Gagal Kirim: Database Perlu Diperbarui",
        description:
          "Status PENDING_APPROVAL_ADMIN belum aktif di Supabase. Minta Admin menjalankan migrasi 007_worksheet_opname_approval_stock_log.sql, lalu coba submit lagi.",
        variant: "error",
      };
    }

    return {
      title: "❌ Gagal Kirim: Sesi Staff Tidak Valid",
      description:
        "Penanggung jawab dari login PIN tidak tersimpan dengan benar. Silakan logout, login ulang dengan PIN Anda, lalu klik Submit Report Closing sekali lagi.",
      variant: "error",
    };
  }

  if (isNetworkError(raw)) {
    return {
      title: "⚠️ Koneksi Internet Terputus!",
      description:
        "Aplikasi gagal terhubung ke server Supabase. Pastikan Wi-Fi bar atau paket data HP Anda aktif dan stabil, lalu silakan klik tombol Submit kembali.",
      variant: "warning",
    };
  }

  return {
    title: "❌ Gagal Menyimpan Data",
    description: `Terjadi kendala sistem: ${raw}. Silakan screenshot layar ini dan langsung laporkan ke Admin/Owner.`,
    variant: "error",
  };
}
