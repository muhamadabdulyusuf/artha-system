import type { StaffRole } from "@/lib/types/database";

export const ROLE_ACCESS_PROFILE: Record<
  StaffRole,
  {
    label: string;
    scope: string;
    detail: string;
  }
> = {
  master_admin: {
    label: "Master Admin",
    scope: "Full system",
    detail: "Akses penuh: account, master data, PO, inventory, monitoring, dan AI.",
  },
  admin: {
    label: "Admin",
    scope: "Admin operasional",
    detail: "Kelola dashboard, PO, inventory, master data, menu, supplier, dan AI tanpa mengatur role.",
  },
  op_manager: {
    label: "Manager Operasional",
    scope: "Operational command",
    detail: "Kelola operasi harian: dashboard, PO, inventory, menu, supplier, dan closing.",
  },
  bar_staff: {
    label: "Staff Bar",
    scope: "Inventory Bar",
    detail: "Akses khusus operasional Bar.",
  },
  kitchen_staff: {
    label: "Staff Kitchen",
    scope: "Inventory Kitchen",
    detail: "Akses khusus operasional Kitchen.",
  },
  viewer: {
    label: "Viewer",
    scope: "Read-only",
    detail: "Akses baca dashboard tanpa aksi edit dan tanpa AI chat.",
  },
};

export function getRoleLabel(role: StaffRole | null | undefined): string {
  return role ? ROLE_ACCESS_PROFILE[role]?.label ?? role : "-";
}

export function getRoleScope(role: StaffRole | null | undefined): string {
  return role ? ROLE_ACCESS_PROFILE[role]?.scope ?? "-" : "-";
}

export function getRoleDetail(role: StaffRole | null | undefined): string {
  return role ? ROLE_ACCESS_PROFILE[role]?.detail ?? "-" : "-";
}

/** Role penonton: hanya baca data, tanpa aksi tulis di UI. */
export function isViewerRole(role: StaffRole | null | undefined): boolean {
  return role === "viewer";
}

export function isMasterAdminRole(role: StaffRole | null | undefined): boolean {
  return role === "master_admin";
}

export function isOperationalManagerRole(role: StaffRole | null | undefined): boolean {
  return role === "op_manager";
}

export function isDepartmentStaffRole(role: StaffRole | null | undefined): boolean {
  return role === "bar_staff" || role === "kitchen_staff";
}

/** Boleh menampilkan tombol tambah / simpan / hapus / submit. */
export function canEditStaffData(role: StaffRole | null | undefined): boolean {
  return role != null && !isViewerRole(role);
}

/** Hanya Master Admin yang boleh membuat, reset, dan menonaktifkan akun. */
export function canManageStaffAccounts(role: StaffRole | null | undefined): boolean {
  return isMasterAdminRole(role);
}

/** AI chat hanya untuk role pengambil keputusan, bukan akun operasional staff. */
export function canUseAiAssistant(role: StaffRole | null | undefined): boolean {
  return isMasterAdminRole(role) || role === "admin" || isOperationalManagerRole(role);
}
