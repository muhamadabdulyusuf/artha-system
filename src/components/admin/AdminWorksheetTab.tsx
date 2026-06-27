"use client";

import { useRef, useState } from "react";
import { Building2, ClipboardList, Loader2, Package, Save, ShieldCheck } from "lucide-react";
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
  scope: string;
  checkpoints: string[];
  icon: typeof Building2;
}[] = [
  {
    id: "bar",
    label: "Worksheet Bar",
    title: "Inventory Bar",
    description: "Stok minuman, garnish, premix, remake, dan menu sold.",
    scope: "Bar station",
    checkpoints: ["Receive", "Out Stock", "Opname", "Premix", "Remake", "Menu"],
    icon: Building2,
  },
  {
    id: "kitchen",
    label: "Worksheet Kitchen",
    title: "Inventory Kitchen",
    description: "Bahan kitchen, produksi, remake, spoil, dan stock opname.",
    scope: "Kitchen station",
    checkpoints: ["Receive", "Out Stock", "Opname", "Premix", "Remake", "Menu"],
    icon: ClipboardList,
  },
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
      throw new Error("Inventory Bar dan Kitchen belum siap. Tunggu sebentar lalu coba lagi.");
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
        message: err instanceof Error ? err.message : "Gagal memuat preview inventory.",
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
      setSaveNotice({ message: "Inventory Bar dan Kitchen tersimpan.", variant: "success" });
    } catch (err) {
      setSaveNotice({
        message: err instanceof Error ? err.message : "Gagal menyimpan Inventory Bar dan Kitchen.",
        variant: "error",
      });
    } finally {
      setIsSavingAllDepartments(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]">
        <div className="border-b border-slate-200/80 bg-white px-4 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
                <Package className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Inventory Workspace</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-900">Inventory Bar & Kitchen</h2>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                  Pusat kontrol stok harian untuk receive, out stock, opname, premix, remake, dan sales menu.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isSavingAllDepartments}
              onClick={openSaveAllPreview}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-medium text-white transition-all hover:bg-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSavingAllDepartments ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              <span>{isSavingAllDepartments ? "Menyimpan..." : "Simpan Bar + Kitchen"}</span>
            </button>
          </div>
        </div>

        {saveNotice ? (
          <div
            className={`mx-4 mt-4 rounded-lg border px-3 py-2 text-sm ${
              saveNotice.variant === "success"
                ? "border-teal-200 bg-teal-50 text-teal-800"
                : "border-rose-200 bg-rose-50 text-rose-700"
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

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
          <aside className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 lg:sticky lg:top-6 lg:col-span-3 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto lg:scrollbar-thin">
            <div className="mb-3 px-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Departemen</p>
              <p className="mt-1 text-sm text-slate-600">Pilih area inventory yang mau dicek atau dikerjakan.</p>
            </div>

            <div className="grid gap-2">
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
                    className={`min-h-[116px] rounded-lg border p-3 text-left transition ${
                      active
                        ? "border-teal-600 bg-teal-600 text-white shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]"
                        : "border-slate-200/80 bg-white text-slate-800 hover:border-teal-200 hover:bg-teal-50"
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          active ? "bg-white text-teal-700" : "bg-slate-50 text-slate-700"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">{item.title}</span>
                        <span className={`mt-0.5 block text-xs font-semibold ${active ? "text-teal-50" : "text-slate-600"}`}>
                          {item.scope}
                        </span>
                        <span className={`mt-2 block text-xs leading-5 ${active ? "text-white" : "text-slate-600"}`}>
                          {item.description}
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 rounded-lg border border-slate-200/80 bg-white p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-teal-700" />
                Standar closing
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.checkpoints.map((checkpoint) => (
                  <span
                    key={checkpoint}
                    className="rounded-md border border-slate-200/80 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600"
                  >
                    {checkpoint}
                  </span>
                ))}
              </div>
            </div>
          </aside>

          <section className="min-w-0 rounded-xl border border-slate-200/80 bg-white lg:col-span-9 lg:h-[calc(100vh-6rem)] lg:overflow-y-auto lg:scrollbar-thin">
            <div className="border-b border-slate-200/80 px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50 text-teal-700">
                    <SelectedIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{selected.label}</p>
                    <h3 className="truncate text-lg font-semibold text-slate-900">{selected.title}</h3>
                  </div>
                </div>
                <span className="inline-flex w-fit items-center rounded-md border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                  {selected.scope}
                </span>
              </div>
            </div>

            <div className={activeWorkspace === "bar" ? "" : "hidden"}>
              <WorksheetClosing ref={barWorksheetRef} department="bar" title="Inventory Bar" embedded />
            </div>
            <div className={activeWorkspace === "kitchen" ? "" : "hidden"}>
              <WorksheetClosing ref={kitchenWorksheetRef} department="kitchen" title="Inventory Kitchen" embedded />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
