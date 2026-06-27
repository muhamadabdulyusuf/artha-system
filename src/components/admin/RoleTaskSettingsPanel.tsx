"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, Lock, RefreshCw, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { ROLE_ACCESS_PROFILE, canManageStaffAccounts } from "@/lib/auth/permissions";
import {
  ROLE_TASKS,
  getDefaultRoleTaskMap,
  mergeRoleTaskSettings,
  type RoleTaskDefinition,
  type RoleTaskId,
  type RoleTaskSettingMap,
} from "@/lib/auth/roleTasks";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { RoleTaskSettingRow, StaffRole } from "@/lib/types/database";

const MATRIX_ROLES: StaffRole[] = [
  "master_admin",
  "admin",
  "op_manager",
  "bar_staff",
  "kitchen_staff",
  "viewer",
];

const ACCESS_SECTIONS: { group: RoleTaskDefinition["group"]; title: string; description: string }[] = [
  {
    group: "Dashboard",
    title: "Dashboard & Monitoring",
    description: "Hak lihat ringkasan performa operasional, stock alert, sales, dan audit harian.",
  },
  {
    group: "Purchasing",
    title: "Purchase Order",
    description: "Hak membuat, import, approval, dan monitoring PO supplier.",
  },
  {
    group: "Master Data",
    title: "Master Data",
    description: "Hak mengelola bahan, resep, menu, supplier, dan katalog harga.",
  },
  {
    group: "Inventory",
    title: "Inventory Operasional",
    description: "Hak input worksheet Bar/Kitchen, receive, outstock, opname, premix, dan remake.",
  },
  {
    group: "System",
    title: "System Control",
    description: "Hak konfigurasi akun, role, dan batas akses.",
  },
];

type RoleSettingsByRole = Record<StaffRole, RoleTaskSettingMap>;
type AccessSection = (typeof ACCESS_SECTIONS)[number] & { tasks: RoleTaskDefinition[] };
type ChangedRoleTask = {
  role: StaffRole;
  taskId: RoleTaskId;
  isEnabled: boolean;
};

function buildDefaultSettings(): RoleSettingsByRole {
  return {
    master_admin: getDefaultRoleTaskMap("master_admin"),
    admin: getDefaultRoleTaskMap("admin"),
    op_manager: getDefaultRoleTaskMap("op_manager"),
    bar_staff: getDefaultRoleTaskMap("bar_staff"),
    kitchen_staff: getDefaultRoleTaskMap("kitchen_staff"),
    viewer: getDefaultRoleTaskMap("viewer"),
  };
}

function getTaskSections(): AccessSection[] {
  return ACCESS_SECTIONS.map((section) => ({
    ...section,
    tasks: ROLE_TASKS.filter((task) => task.group === section.group),
  })).filter((section) => section.tasks.length > 0);
}

function roleSupportsTask(role: StaffRole, task: RoleTaskDefinition): boolean {
  return task.roles.includes(role);
}

function isLockedForRole(role: StaffRole, task: RoleTaskDefinition): boolean {
  return task.lockedFor?.includes(role) ?? false;
}

function getTaskState(settings: RoleSettingsByRole, role: StaffRole, task: RoleTaskDefinition): boolean {
  if (!roleSupportsTask(role, task)) return false;
  if (isLockedForRole(role, task)) return true;
  return Boolean(settings[role][task.id]);
}

function countEnabledTasks(role: StaffRole, tasks: RoleTaskDefinition[], settings: RoleSettingsByRole): number {
  return tasks.filter((task) => roleSupportsTask(role, task) && getTaskState(settings, role, task)).length;
}

function countAvailableTasks(role: StaffRole, tasks: RoleTaskDefinition[]): number {
  return tasks.filter((task) => roleSupportsTask(role, task)).length;
}

export function RoleTaskSettingsPanel() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const session = getStaffSession();
  const canManageTasks = canManageStaffAccounts(session?.role);

  const [settings, setSettings] = useState<RoleSettingsByRole>(() => buildDefaultSettings());
  const [savedSettings, setSavedSettings] = useState<RoleSettingsByRole>(() => buildDefaultSettings());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  const taskSections = useMemo(() => getTaskSections(), []);

  const changedTasks = useMemo<ChangedRoleTask[]>(() => {
    const changes: ChangedRoleTask[] = [];

    for (const role of MATRIX_ROLES) {
      for (const task of ROLE_TASKS) {
        if (!roleSupportsTask(role, task) || isLockedForRole(role, task)) continue;

        const current = getTaskState(settings, role, task);
        const saved = getTaskState(savedSettings, role, task);

        if (current !== saved) {
          changes.push({ role, taskId: task.id, isEnabled: current });
        }
      }
    }

    return changes;
  }, [savedSettings, settings]);

  const summary = useMemo(() => {
    let totalTasks = 0;
    let enabledTasks = 0;

    for (const role of MATRIX_ROLES) {
      totalTasks += countAvailableTasks(role, ROLE_TASKS);
      enabledTasks += countEnabledTasks(role, ROLE_TASKS, settings);
    }

    return {
      roles: MATRIX_ROLES.length,
      enabledTasks,
      disabledTasks: totalTasks - enabledTasks,
      totalTasks,
      pendingChanges: changedTasks.length,
    };
  }, [changedTasks.length, settings]);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);

    const { data, error } = await supabase
      .from("role_task_setting")
      .select("role, task_id, is_enabled, updated_at")
      .order("role", { ascending: true })
      .order("task_id", { ascending: true });

    if (error) {
      const fallback = buildDefaultSettings();
      setSettings(fallback);
      setSavedSettings(fallback);
      setNotice({
        message: `Gagal memuat access control: ${error.message}`,
        variant: "error",
      });
      setIsLoading(false);
      return;
    }

    const rows = (data ?? []) as RoleTaskSettingRow[];
    const grouped = new Map<StaffRole, RoleTaskSettingRow[]>();

    for (const row of rows) {
      grouped.set(row.role, [...(grouped.get(row.role) ?? []), row]);
    }

    const mergedSettings: RoleSettingsByRole = {
      master_admin: mergeRoleTaskSettings("master_admin", grouped.get("master_admin") ?? []),
      admin: mergeRoleTaskSettings("admin", grouped.get("admin") ?? []),
      op_manager: mergeRoleTaskSettings("op_manager", grouped.get("op_manager") ?? []),
      bar_staff: mergeRoleTaskSettings("bar_staff", grouped.get("bar_staff") ?? []),
      kitchen_staff: mergeRoleTaskSettings("kitchen_staff", grouped.get("kitchen_staff") ?? []),
      viewer: mergeRoleTaskSettings("viewer", grouped.get("viewer") ?? []),
    };

    setSettings(mergedSettings);
    setSavedSettings(mergedSettings);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const toggleTask = (role: StaffRole, task: RoleTaskDefinition) => {
    if (!canManageTasks) {
      setNotice({ message: "Hanya Master Admin yang bisa mengatur access control.", variant: "error" });
      return;
    }

    if (!roleSupportsTask(role, task)) return;

    if (isLockedForRole(role, task)) {
      setNotice({ message: "Akses inti Master Admin dikunci agar sistem tetap aman.", variant: "error" });
      return;
    }

    setNotice(null);
    setSettings((current) => ({
      ...current,
      [role]: {
        ...current[role],
        [task.id]: !getTaskState(current, role, task),
      },
    }));
  };

  const resetChanges = () => {
    setSettings(savedSettings);
    setNotice({ message: "Perubahan lokal dibatalkan. Matrix kembali ke data tersimpan.", variant: "success" });
  };

  const saveChanges = async () => {
    if (!canManageTasks) {
      setNotice({ message: "Hanya Master Admin yang bisa menyimpan access control.", variant: "error" });
      return;
    }

    if (changedTasks.length === 0) {
      setNotice({ message: "Tidak ada perubahan akses yang perlu disimpan.", variant: "success" });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    const updatedAt = new Date().toISOString();
    const rows = changedTasks.map((change) => ({
      role: change.role,
      task_id: change.taskId,
      is_enabled: change.isEnabled,
      updated_at: updatedAt,
    }));

    const { error } = await supabase.from("role_task_setting").upsert(rows, {
      onConflict: "role,task_id",
    });

    if (error) {
      setNotice({ message: `Gagal menyimpan access control: ${error.message}`, variant: "error" });
    } else {
      setSavedSettings(settings);
      setNotice({
        message: "Perubahan access control tersimpan. Role terkait otomatis mengikuti batas baru.",
        variant: "success",
      });
    }

    setIsSaving(false);
  };

  return (
    <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900">Pengaturan Akses</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Role Task Matrix untuk mengontrol fitur yang boleh aktif pada setiap role operasional.
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            Master Admin tampil sebagai referensi full-access dan akses intinya dikunci. Perubahan role lain
            dikumpulkan dulu, lalu disimpan sekaligus agar audit akses lebih jelas.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadSettings()}
            disabled={isLoading || isSaving}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          <button
            type="button"
            onClick={resetChanges}
            disabled={isLoading || isSaving || changedTasks.length === 0}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Role Matrix</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.roles}</p>
        </div>
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Akses Aktif</p>
          <p className="mt-2 text-2xl font-bold text-teal-700">
            {summary.enabledTasks}
            <span className="text-sm font-semibold text-teal-700">/{summary.totalTasks}</span>
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Akses Dibatasi</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.disabledTasks}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-900">Belum Disimpan</p>
          <p className="mt-2 text-2xl font-bold text-amber-900">{summary.pendingChanges}</p>
        </div>
      </div>

      {!canManageTasks ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Akun kamu bukan Master Admin, jadi matrix akses ini tampil read-only.
        </p>
      ) : null}

      {notice ? (
        <p
          className={`rounded-lg border px-4 py-3 text-sm font-medium ${
            notice.variant === "success"
              ? "border-teal-200 bg-teal-50 text-teal-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex min-h-72 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
          Memuat Role Task Matrix...
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="w-[340px] px-4 py-3.5 text-sm font-semibold text-slate-800">
                    Task & Fungsi
                  </th>
                  {MATRIX_ROLES.map((role) => {
                    const profile = ROLE_ACCESS_PROFILE[role];
                    const enabledCount = countEnabledTasks(role, ROLE_TASKS, settings);
                    const availableCount = countAvailableTasks(role, ROLE_TASKS);

                    return (
                      <th key={role} className="px-3 py-3.5 text-center text-sm font-semibold text-slate-800">
                        <span className="block">{profile.label}</span>
                        <span className="mt-1 block font-mono text-[11px] font-semibold text-slate-600">{role}</span>
                        <span className="mt-1 block text-[11px] font-medium text-slate-600">
                          {enabledCount}/{availableCount} aktif
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white">
                {taskSections.map((section) => (
                  <Fragment key={section.group}>
                    <tr key={`${section.group}:heading`} className="border-y border-slate-200 bg-slate-50/80">
                      <td colSpan={MATRIX_ROLES.length + 1} className="px-4 py-3">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{section.title}</p>
                            <p className="mt-0.5 text-xs text-slate-600">{section.description}</p>
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
                            {section.group}
                          </span>
                        </div>
                      </td>
                    </tr>

                    {section.tasks.map((task) => (
                      <tr
                        key={task.id}
                        className="border-b border-slate-100 transition-colors hover:bg-slate-50/50"
                      >
                        <td className="px-4 py-3.5 align-middle">
                          <p className="text-sm font-medium text-slate-900">{task.label}</p>
                          <p className="mt-1 text-xs leading-5 text-slate-600">{task.description}</p>
                        </td>

                        {MATRIX_ROLES.map((role) => {
                          const supported = roleSupportsTask(role, task);
                          const checked = getTaskState(settings, role, task);
                          const locked = isLockedForRole(role, task);
                          const saved = getTaskState(savedSettings, role, task);
                          const changed = supported && !locked && checked !== saved;
                          const profile = ROLE_ACCESS_PROFILE[role];

                          return (
                            <td key={`${task.id}:${role}`} className="px-3 py-3.5 text-center align-middle">
                              {!supported ? (
                                <span className="mx-auto flex h-8 w-14 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                                  -
                                </span>
                              ) : (
                                <div className="flex flex-col items-center gap-1.5">
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={checked}
                                    aria-label={`${checked ? "Matikan" : "Aktifkan"} ${task.label} untuk ${profile.label}`}
                                    disabled={!canManageTasks || locked || isSaving}
                                    onClick={() => toggleTask(role, task)}
                                    className={`relative inline-flex h-8 w-14 items-center rounded-full border px-1 transition-all focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-70 ${
                                      checked
                                        ? "accent-teal-600 border-teal-500 bg-teal-50 text-teal-600 focus:ring-teal-500"
                                        : "border-slate-300 bg-white text-slate-400 focus:ring-slate-200"
                                    } ${changed ? "ring-2 ring-amber-200" : ""}`}
                                  >
                                    <span
                                      className={`flex h-6 w-6 items-center justify-center rounded-full shadow-sm transition-transform ${
                                        checked
                                          ? "translate-x-6 bg-teal-600 text-white"
                                          : "translate-x-0 bg-slate-100 text-slate-500"
                                      }`}
                                    >
                                      {locked ? (
                                        <Lock className="h-3.5 w-3.5" />
                                      ) : checked ? (
                                        <Check className="h-3.5 w-3.5" />
                                      ) : null}
                                    </span>
                                  </button>
                                  <span
                                    className={`text-[10px] font-semibold ${
                                      changed
                                        ? "text-amber-900"
                                        : checked
                                          ? "text-teal-700"
                                          : "text-slate-600"
                                    }`}
                                  >
                                    {locked ? "Locked" : changed ? "Changed" : checked ? "Aktif" : "Mati"}
                                  </span>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-6 text-slate-600">
          {changedTasks.length > 0
            ? `${changedTasks.length} perubahan akses siap disimpan.`
            : "Belum ada perubahan akses."}
        </p>
        <button
          type="button"
          onClick={() => void saveChanges()}
          disabled={!canManageTasks || isLoading || isSaving || changedTasks.length === 0}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-white"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Simpan Perubahan
        </button>
      </div>
    </section>
  );
}
