import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClosingStatus, Database, Department } from "@/lib/types/database";

type Supabase = SupabaseClient<Database>;

export type FinalWorksheetStatus = "LOCKED" | "SUBMITTED" | "PENDING_APPROVAL_ADMIN";

/**
 * Menandai worksheet_session sebagai terkirim dengan staff dari sesi login.
 */
export async function finalizeWorksheetSession(params: {
  supabase: Supabase;
  sessionId: string;
  businessDate?: string;
  department?: Department;
  staffId: string;
  submittedAt: string;
  status: FinalWorksheetStatus;
}): Promise<void> {
  const { supabase, sessionId, businessDate, department, staffId, submittedAt, status } = params;

  if (!staffId.trim()) {
    throw new Error("ID staff penanggung jawab tidak valid. Silakan logout dan login ulang.");
  }

  let request = supabase
    .from("worksheet_session")
    .update({
      status,
      submitted_at: submittedAt,
      submitted_by_staff_id: staffId,
      locked_at: status === "LOCKED" ? submittedAt : null,
      locked_by_staff_id: status === "LOCKED" ? staffId : null,
    })
    .eq("id", sessionId);

  if (businessDate) {
    request = request.eq("business_date", businessDate);
  }
  if (department) {
    request = request.eq("department", department);
  }

  const { error } = await request;

  if (error) {
    throw error;
  }
}

export function isSubmittedClosingStatus(status: ClosingStatus | null | undefined): boolean {
  return (
    status === "SUBMITTED" ||
    status === "ADJUSTED" ||
    status === "LOCKED" ||
    status === "PENDING_APPROVAL_ADMIN"
  );
}
