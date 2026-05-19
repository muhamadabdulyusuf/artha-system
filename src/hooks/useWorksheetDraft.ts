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
  activeTab,
  onRestore,
}: UseWorksheetDraftParams): void {
  const restoredRef = useRef(false);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  useEffect(() => {
    if (isLoading || !businessDate || locked || restoredRef.current) return;

    const draft = loadWorksheetDraft(department, businessDate);
    if (draft) {
      onRestoreRef.current(draft);
    }
    restoredRef.current = true;
  }, [businessDate, department, isLoading, locked]);

  useEffect(() => {
    if (isLoading || !businessDate || locked) return;

    saveWorksheetDraft(department, businessDate, {
      lines,
      soldItems,
      activeTab,
    });
  }, [activeTab, businessDate, department, isLoading, lines, locked, soldItems]);
}
