import type { StaffRole } from "@/lib/types/database";

/** Role penonton: hanya baca data, tanpa aksi tulis di UI. */
export function isViewerRole(role: StaffRole | null | undefined): boolean {
  return role === "viewer";
}

/** Boleh menampilkan tombol tambah / simpan / hapus / submit. */
export function canEditStaffData(role: StaffRole | null | undefined): boolean {
  return role != null && !isViewerRole(role);
}
