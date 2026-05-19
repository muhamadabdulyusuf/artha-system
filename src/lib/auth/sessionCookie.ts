import type { Department, StaffRole } from "@/lib/types/database";
import { SESSION_COOKIE, type StaffSession } from "@/lib/auth/session";

export { SESSION_COOKIE };

const STAFF_ROLES: StaffRole[] = [
  "admin",
  "op_manager",
  "bar_staff",
  "kitchen_staff",
  "viewer",
];

function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && STAFF_ROLES.includes(value as StaffRole);
}

function isDepartment(value: unknown): value is Department {
  return value === "bar" || value === "kitchen";
}

/** Parse session JSON from cookie value (Edge-safe, no js-cookie). */
export function parseStaffSessionCookie(raw: string | undefined): StaffSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (
      typeof data === "object" &&
      data !== null &&
      "id" in data &&
      "name" in data &&
      "role" in data &&
      typeof (data as StaffSession).id === "string" &&
      typeof (data as StaffSession).name === "string" &&
      isStaffRole((data as StaffSession).role)
    ) {
      const department = (data as StaffSession).department;
      return {
        id: (data as StaffSession).id,
        name: (data as StaffSession).name,
        role: (data as StaffSession).role,
        department:
          department === null ? null : isDepartment(department) ? department : null,
      };
    }
  } catch {
    return null;
  }
  return null;
}
