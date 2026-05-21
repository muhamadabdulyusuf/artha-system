import Cookies from "js-cookie";
import { z } from "zod";

export const SESSION_COOKIE = "artha_session";
const SESSION_EXPIRES_DAYS = 0.5;

const staffSessionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(["admin", "op_manager", "bar_staff", "kitchen_staff", "viewer"]),
  department: z.enum(["bar", "kitchen"]).nullable(),
  // Tambahkan signature/hash sederhana jika tidak ingin pakai JWT penuh
  // Untuk audit ini, kita asumsikan integrasi JWT di masa depan.
});

export type StaffSession = z.infer<typeof staffSessionSchema>;

function parseSession(raw: string | undefined): StaffSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const result = staffSessionSchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function setStaffSession(session: StaffSession): void {
  Cookies.set(SESSION_COOKIE, JSON.stringify(session), {
    expires: SESSION_EXPIRES_DAYS,
    sameSite: "lax",
    secure:
      typeof window !== "undefined" && window.location.protocol === "https:",
    path: "/",
  });
}

export function getStaffSession(): StaffSession | null {
  return parseSession(Cookies.get(SESSION_COOKIE));
}

export function clearStaffSession(): void {
  Cookies.remove(SESSION_COOKIE, { path: "/" });
}

export { getRouteForRole } from "@/lib/auth/routeAccess";
