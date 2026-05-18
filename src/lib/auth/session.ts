import Cookies from "js-cookie";
import type { Department, StaffRole } from "@/lib/types/database";

export const SESSION_COOKIE = "artha_session";

/** 12 jam — cukup untuk satu shift operasional outlet */
const SESSION_EXPIRES_DAYS = 0.5;

export type StaffSession = {
  id: string;
  name: string;
  role: StaffRole;
  department: Department | null;
};

const STAFF_ROLES: StaffRole[] = ["admin", "op_manager", "bar_staff", "kitchen_staff"];

function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && STAFF_ROLES.includes(value as StaffRole);
}

function isDepartment(value: unknown): value is Department {
  return value === "bar" || value === "kitchen";
}

function parseSession(raw: string | undefined): StaffSession | null {
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
        department: department === null ? null : isDepartment(department) ? department : null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function setStaffSession(session: StaffSession): void {
  Cookies.set(SESSION_COOKIE, JSON.stringify(session), {
    expires: SESSION_EXPIRES_DAYS,
    sameSite: "lax",
    secure: typeof window !== "undefined" && window.location.protocol === "https:",
    path: "/",
  });
}

export function getStaffSession(): StaffSession | null {
  return parseSession(Cookies.get(SESSION_COOKIE));
}

export function clearStaffSession(): void {
  Cookies.remove(SESSION_COOKIE, { path: "/" });
}

export function getRouteForRole(role: StaffRole): string {
  switch (role) {
    case "admin":
    case "op_manager":
      return "/admin/master-data";
    case "bar_staff":
      return "/worksheet/bar";
    case "kitchen_staff":
      return "/worksheet/kitchen";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}
