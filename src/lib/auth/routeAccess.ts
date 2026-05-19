import type { Department, StaffRole } from "@/lib/types/database";

export const ADMIN_ROLES: StaffRole[] = ["admin", "op_manager", "viewer"];
export const OPS_ROLES: StaffRole[] = ["bar_staff", "kitchen_staff"];

export function isAdminPath(pathname: string): boolean {
  return pathname.startsWith("/admin");
}

export function isOpsPath(pathname: string): boolean {
  return pathname.startsWith("/ops");
}

export function isLegacyWorksheetPath(pathname: string): boolean {
  return pathname.startsWith("/worksheet");
}

export function parseOpsDepartment(pathname: string): Department | null {
  const segment = pathname.split("/")[2];
  if (segment === "bar" || segment === "kitchen") return segment;
  return null;
}

export function canAccessAdminRoute(role: StaffRole | null | undefined): boolean {
  return role != null && ADMIN_ROLES.includes(role);
}

export function canAccessOpsRoute(
  role: StaffRole | null | undefined,
  department: Department | null | undefined,
  opsDepartment: Department
): boolean {
  if (role == null) return false;
  if (role === "admin" || role === "op_manager") return true;
  if (role === "bar_staff") return opsDepartment === "bar" && department === "bar";
  if (role === "kitchen_staff") return opsDepartment === "kitchen" && department === "kitchen";
  return false;
}

export function getOpsHomeForRole(
  role: StaffRole,
  department: Department | null
): string | null {
  if (role === "bar_staff" && department === "bar") return "/ops/bar";
  if (role === "kitchen_staff" && department === "kitchen") return "/ops/kitchen";
  return null;
}

export function getRouteForRole(role: StaffRole): string {
  switch (role) {
    case "admin":
    case "op_manager":
    case "viewer":
      return "/admin/master-data";
    case "bar_staff":
      return "/ops/bar";
    case "kitchen_staff":
      return "/ops/kitchen";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}
