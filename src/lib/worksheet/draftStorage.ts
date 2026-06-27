import type { Department } from "@/lib/types/database";

type DraftLossResponsibilityScope = "general" | "unknown" | "staff";

export type WorksheetDraftPayload = {
  lines: Record<
    string,
    {
      inQty: string;
      inUnitPrice?: string;
      closingStock: string;
      outQty: string;
      outNote: string;
      outflowType?: "operational" | "spoil";
      outResponsibilityScope?: DraftLossResponsibilityScope;
      outResponsibleStaffId?: string;
      outPhotoUrl?: string;
      outPhotoPublicId?: string;
    }
  >;
  soldItems: Record<string, string>;
  premixQuantities?: Record<string, string>;
  menuIssues?: Record<
    string,
    {
      quantity: string;
      reason: string;
      note: string;
      lossResponsibilityScope?: DraftLossResponsibilityScope;
      responsibleStaffId?: string;
      photoUrl?: string;
      photoPublicId?: string;
    }
  >;
  activeTab: "receive" | "outstock" | "opname" | "premix" | "issue" | "sold";
  savedAt: string;
};

const DRAFT_PREFIX = "artha:worksheet:draft";

export function worksheetDraftKey(department: Department, businessDate: string): string {
  return `${DRAFT_PREFIX}:${department}:${businessDate}`;
}

export function loadWorksheetDraft(
  department: Department,
  businessDate: string
): WorksheetDraftPayload | null {
  if (typeof window === "undefined" || !businessDate) return null;

  try {
    const raw = localStorage.getItem(worksheetDraftKey(department, businessDate));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorksheetDraftPayload;
    if (!parsed?.lines || typeof parsed.lines !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveWorksheetDraft(
  department: Department,
  businessDate: string,
  payload: Omit<WorksheetDraftPayload, "savedAt">
): void {
  if (typeof window === "undefined" || !businessDate) return;

  const full: WorksheetDraftPayload = {
    ...payload,
    savedAt: new Date().toISOString(),
  };

  try {
    localStorage.setItem(worksheetDraftKey(department, businessDate), JSON.stringify(full));
  } catch {
    // Quota exceeded or private mode — ignore silently
  }
}

export function clearWorksheetDraft(department: Department, businessDate: string): void {
  if (typeof window === "undefined" || !businessDate) return;
  try {
    localStorage.removeItem(worksheetDraftKey(department, businessDate));
  } catch {
    // ignore
  }
}
