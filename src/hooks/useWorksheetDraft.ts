"use client";

import { useEffect, useRef } from "react";
import type { Department } from "@/lib/types/database";
import {
  loadWorksheetDraft,
  saveWorksheetDraft,
  type WorksheetDraftPayload,
} from "@/lib/worksheet/draftStorage";

type WorksheetTab = WorksheetDraftPayload["activeTab"];

type UseWorksheetDraftParams = {
  department: Department;
  businessDate: string;
  isLoading: boolean;
  locked: boolean;
  lines: WorksheetDraftPayload["lines"];
  soldItems: Record<string, string>;
  premixQuantities: Record<string, string>;
  activeTab: WorksheetTab;
  onRestore: (draft: WorksheetDraftPayload) => void;
};

export function useWorksheetDraft({
  department,
  businessDate,
  isLoading,
  locked,
  lines,
  soldItems,
  premixQuantities,
  activeTab,
  onRestore,
}: UseWorksheetDraftParams): void {
  const restoredKeyRef = useRef<string | null>(null);
  const skipNextSaveRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    if (isLoading || !businessDate || locked) return;

    const restoreKey = `${department}:${businessDate}`;
    if (restoredKeyRef.current === restoreKey) return;

    const draft = loadWorksheetDraft(department, businessDate);
    if (draft) {
      skipNextSaveRef.current = true;
      onRestoreRef.current(draft);
    }
    restoredKeyRef.current = restoreKey;
  }, [businessDate, department, isLoading, locked]);

  useEffect(() => {
    if (isLoading || !businessDate || locked) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    saveWorksheetDraft(department, businessDate, {
      lines,
      soldItems,
      premixQuantities,
      activeTab,
    });
  }, [activeTab, businessDate, department, isLoading, lines, locked, premixQuantities, soldItems]);
}
