import type { StaffSession } from "@/lib/auth/session";
import type { Department } from "@/lib/types/database";

export function canAccessWorksheet(staff: StaffSession, department: Department): boolean {
  if (staff.role === "admin" || staff.role === "op_manager") return true;
  if (department === "bar" && staff.role === "bar_staff") return true;
  if (department === "kitchen" && staff.role === "kitchen_staff") return true;
  return false;
}
