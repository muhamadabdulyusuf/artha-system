import type { StaffRole } from "@/lib/types/database";

/** Role penonton: hanya baca data, tanpa aksi tulis di UI. */
export function isViewerRole(role: StaffRole | null | undefined): boolean {
  return role === "viewer";
}

/** Boleh menampilkan tombol tambah / simpan / hapus / submit. */
export function canEditStaffData(role: StaffRole | null | undefined): boolean {
  return role != null && !isViewerRole(role);
}

/** AI chat hanya untuk role pengambil keputusan, bukan akun operasional staff. */
export function canUseAiAssistant(role: StaffRole | null | undefined): boolean {
  return role === "admin" || role === "op_manager";
}
