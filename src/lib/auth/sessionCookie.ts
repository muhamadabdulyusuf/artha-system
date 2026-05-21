import { SESSION_COOKIE, type StaffSession } from "@/lib/auth/session";
import { z } from "zod";

export { SESSION_COOKIE };

const staffSessionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(["admin", "op_manager", "bar_staff", "kitchen_staff", "viewer"]),
  department: z.enum(["bar", "kitchen"]).nullable(),
});

/** Parse session JSON from cookie value (Edge-safe, no js-cookie). */
export function parseStaffSessionCookie(
  raw: string | undefined,
): StaffSession | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(decodeURIComponent(raw));
    const result = staffSessionSchema.safeParse(data);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
