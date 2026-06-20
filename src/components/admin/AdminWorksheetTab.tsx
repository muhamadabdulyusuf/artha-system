"use client";

import { useRef, useState } from "react";
import { Building2, ClipboardList, Loader2, Save } from "lucide-react";
import { WorksheetClosing, type WorksheetClosingHandle } from "@/components/staff/WorksheetClosing";
import { TypoConfirmModal } from "@/components/worksheet/TypoConfirmModal";
import type { TypoGuardPreviewEntry } from "@/lib/worksheet/typoGuard";
import type { Department } from "@/lib/types/database";

type AdminWorksheetWorkspace = Department;

const WORKSPACES: {
  id: AdminWorksheetWorkspace;
  label: string;
  title: string;
  description: string;
  icon: typeof Building2;
}[] = [
  { id: "bar", label: "Worksheet Bar", title: "Worksheet Bar", description: "Receive, out stock, sales menu Bar", icon: Building2 },
  { id: "kitchen", label: "Worksheet Kitchen", title: "Worksheet Kitchen", description: "Receive, out stock, sales menu Kitchen", icon: ClipboardList },
];

export function AdminWorksheetTab() {
  const [activeWorkspace, setActiveWorkspace] = useState<AdminWorksheetWorkspace>("bar");
  const [isSavingAllDepartments, setIsSavingAllDepartments] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [combinedPreviewEntries, setCombinedPreviewEntries] = useState<TypoGuardPreviewEntry[]>([]);
  const barWorksheetRef = useRef<WorksheetClosingHandle>(null);
  const kitchenWorksheetRef = useRef<WorksheetClosingHandle>(null);
  const selected = WORKSPACES.find((item) => item.id === activeWorkspace) ?? WORKSPACES[0];
  const SelectedIcon = selected.icon;

  const buildCombinedPreviewEntries = () => {
    if (!barWorksheetRef.current || !kitchenWorksheetRef.current) {
      throw new Error("Worksheet Bar dan Kitchen belum siap. Tunggu sebentar lalu coba lagi.");
    }
    const barEntries = barWorksheetRef.current?.buildPreviewEntries() ?? [];
    const kitchenEntries = kitchenWorksheetRef.current?.buildPreviewEntries() ?? [];
    return [
      ...barEntries.map((entry) => ({
        ...entry,
        ingredientId: `bar-${entry.ingredientId}`,
        ingredientName: `[Bar] ${entry.ingredientName}`,
      })),
      ...kitchenEntries.map((entry) => ({
        ...entry,
        ingredientId: `kitchen-${entry.ingredientId}`,
        ingredientName: `[Kitchen] ${entry.ingredientName}`,
      })),
    ];
  };

  const openSaveAllPreview = () => {
    try {
      setCombinedPreviewEntries(buildCombinedPreviewEntries());
      setPreviewOpen(true);
      setSaveNotice(null);
    } catch (err) {
      setSaveNotice({
        message: err instanceof Error ? err.message : "Gagal memuat preview worksheet.",
        variant: "error",
      });
    }
  };

  const handleSaveAllDepartments = async () => {
    if (isSavingAllDepartments) return;

    setIsSavingAllDepartments(true);
    setSaveNotice(null);
    try {
      await barWorksheetRef.current?.saveAllProgress();
      await kitchenWorksheetRef.current?.saveAllProgress();
      setSaveNotice({ message: "Worksheet Bar dan Kitchen tersimpan.", variant: "success" });
    } catch (err) {
      setSaveNotice({
        message: err instanceof Error ? err.message : "Gagal menyimpan worksheet Bar dan Kitchen.",
        variant: "error",
      });
    } finally {
      setIsSavingAllDepartments(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400 text-zinc-950">
            <SelectedIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-zinc-100">{selected.title}</h2>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:min-w-[220px]">
          <button
            type="button"
            disabled={isSavingAllDepartments}
            onClick={openSaveAllPreview}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 text-sm font-bold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSavingAllDepartments ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>{isSavingAllDepartments ? "Menyimpan…" : "Simpan Bar + Kitchen"}</span>
          </button>

          <div className="grid gap-1 rounded-lg border border-zinc-800 bg-zinc-900/70 p-1">
            {WORKSPACES.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeWorkspace;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkspace(item.id);
                    setSaveNotice(null);
                  }}
                  className={`flex min-h-10 items-center justify-start gap-2 rounded-md px-3 text-sm font-semibold transition ${
                    active
                      ? "bg-emerald-400 text-zinc-950"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="min-w-0 text-left">
                    <span className="block truncate">{item.label}</span>
                    <span className={`block truncate text-[11px] ${active ? "text-zinc-800" : "text-zinc-500"}`}>
                      {item.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {saveNotice ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            saveNotice.variant === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
              : "border-red-500/40 bg-red-500/10 text-red-100"
          }`}
        >
          {saveNotice.message}
        </div>
      ) : null}

      <TypoConfirmModal
        open={previewOpen}
        warnings={[]}
        previewEntries={combinedPreviewEntries}
        onCancel={() => setPreviewOpen(false)}
        onConfirm={() => {
          setPreviewOpen(false);
          void handleSaveAllDepartments();
        }}
      />

      <div className="space-y-4">
        <div className={activeWorkspace === "bar" ? "" : "hidden"}>
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/20">
            <WorksheetClosing ref={barWorksheetRef} department="bar" title="Worksheet Bar" embedded />
          </div>
        </div>
        <div className={activeWorkspace === "kitchen" ? "" : "hidden"}>
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/20">
            <WorksheetClosing ref={kitchenWorksheetRef} department="kitchen" title="Worksheet Kitchen" embedded />
          </div>
        </div>
      </div>
    </div>
  );
}
