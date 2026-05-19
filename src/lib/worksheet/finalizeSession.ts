import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClosingStatus, Database } from "@/lib/types/database";

type Supabase = SupabaseClient<Database>;

export type FinalWorksheetStatus = "SUBMITTED" | "PENDING_APPROVAL_ADMIN";

/**
 * Menandai worksheet_session sebagai terkirim dengan staff dari sesi PIN.
 */
export async function finalizeWorksheetSession(params: {
  supabase: Supabase;
  sessionId: string;
  staffId: string;
  submittedAt: string;
  status: FinalWorksheetStatus;
}): Promise<void> {
  const { supabase, sessionId, staffId, submittedAt, status } = params;

  if (!staffId.trim()) {
    throw new Error("ID staff penanggung jawab tidak valid. Silakan logout dan login PIN ulang.");
  }

  const { error } = await supabase
    .from("worksheet_session")
    .update({
      status,
      submitted_at: submittedAt,
      submitted_by_staff_id: staffId,
    })
    .eq("id", sessionId);

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
