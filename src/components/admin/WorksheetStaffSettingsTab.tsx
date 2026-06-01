"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Settings2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, WorksheetStaffSettingRow } from "@/lib/types/database";

type WorksheetTabId = "receive" | "outstock" | "opname" | "premix" | "issue" | "sold";

const WORKSHEET_SETTING_TABS: { id: WorksheetTabId; label: string; detail: string }[] = [
  { id: "receive", label: "Receive", detail: "Barang masuk dari supplier." },
  { id: "outstock", label: "Out Stock", detail: "Barang keluar/rusak/basi." },
  { id: "opname", label: "Opname", detail: "Input stok fisik staff." },
  { id: "premix", label: "Premix / WIP", detail: "Laporan produksi premix sederhana." },
  { id: "issue", label: "Remake", detail: "Complaint/remake dan bukti kualitas." },
  { id: "sold", label: "Menu Sales", detail: "Input sales menu manual." },
];

const DEPARTMENTS: { id: Department; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "kitchen", label: "Kitchen" },
];

const DEFAULT_ENABLED = Object.fromEntries(
  WORKSHEET_SETTING_TABS.map((tab) => [tab.id, true])
) as Record<WorksheetTabId, boolean>;

function normalizeSettings(
  rows: WorksheetStaffSettingRow[]
): Record<Department, Record<WorksheetTabId, boolean>> {
  const next: Record<Department, Record<WorksheetTabId, boolean>> = {
    bar: { ...DEFAULT_ENABLED },
    kitchen: { ...DEFAULT_ENABLED },
  };

  for (const row of rows) {
    if (row.department !== "bar" && row.department !== "kitchen") continue;
    if (!WORKSHEET_SETTING_TABS.some((tab) => tab.id === row.tab_id)) continue;
    next[row.department][row.tab_id as WorksheetTabId] = row.is_enabled;
  }

  return next;
}

export function WorksheetStaffSettingsTab() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [settings, setSettings] = useState<Record<Department, Record<WorksheetTabId, boolean>>>({
    bar: { ...DEFAULT_ENABLED },
    kitchen: { ...DEFAULT_ENABLED },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    const { data, error } = await supabase
      .from("worksheet_staff_setting")
      .select("department, tab_id, is_enabled, updated_at")
      .order("department", { ascending: true })
      .order("tab_id", { ascending: true });

    if (error) {
      setNotice({
        message: `Gagal memuat setting worksheet staff: ${error.message}`,
        variant: "error",
      });
      setIsLoading(false);
      return;
    }

    setSettings(normalizeSettings((data ?? []) as WorksheetStaffSettingRow[]));
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const updateSetting = async (
    department: Department,
    tabId: WorksheetTabId,
    isEnabled: boolean
  ) => {
    const key = `${department}:${tabId}`;
    setSavingKey(key);
    setNotice(null);

    setSettings((prev) => ({
      ...prev,
      [department]: {
        ...prev[department],
        [tabId]: isEnabled,
      },
    }));

    const { error } = await supabase
      .from("worksheet_staff_setting")
      .upsert(
        {
          department,
          tab_id: tabId,
          is_enabled: isEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "department,tab_id" }
      );

    if (error) {
      setNotice({
        message: `Gagal menyimpan ${tabId} ${department}: ${error.message}`,
        variant: "error",
      });
      await loadSettings();
    } else {
      setNotice({
        message: "Setting worksheet staff tersimpan.",
        variant: "success",
      });
    }

    setSavingKey(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-zinc-50">Worksheet Staff Settings</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-zinc-400">
            Atur kamar worksheet yang muncul di akun staff tanpa ubah kode. Fitur yang dimatikan
            tidak hilang, hanya disembunyikan sampai SDM siap dipakai lagi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSettings()}
          disabled={isLoading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3 text-sm font-semibold text-zinc-200 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {notice ? (
        <p
          className={`rounded-lg border px-3 py-2 text-sm ${
            notice.variant === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
              : "border-red-500/40 bg-red-500/10 text-red-200"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          Memuat setting worksheet staff...
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {DEPARTMENTS.map((department) => {
            const enabledCount = WORKSHEET_SETTING_TABS.filter(
              (tab) => settings[department.id][tab.id]
            ).length;

            return (
              <section
                key={department.id}
                className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-zinc-50">{department.label}</h3>
                    <p className="text-xs text-zinc-500">{enabledCount} fitur aktif</p>
                  </div>
                  <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-400">
                    /ops/{department.id}
                  </span>
                </div>

                <div className="space-y-2">
                  {WORKSHEET_SETTING_TABS.map((tab) => {
                    const enabled = settings[department.id][tab.id];
                    const key = `${department.id}:${tab.id}`;

                    return (
                      <label
                        key={tab.id}
                        className="flex min-h-16 items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-zinc-100">{tab.label}</span>
                          <span className="block text-xs leading-snug text-zinc-500">{tab.detail}</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={enabled}
                          disabled={savingKey === key}
                          onChange={(event) =>
                            void updateSetting(department.id, tab.id, event.target.checked)
                          }
                          className="h-5 w-5 shrink-0 accent-indigo-500 disabled:opacity-50"
                        />
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
