"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, Plus, RefreshCw, Save, ShieldCheck, UserCog } from "lucide-react";
import {
  ROLE_ACCESS_PROFILE,
  canManageStaffAccounts,
  getRoleDetail,
  getRoleLabel,
  getRoleScope,
} from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, StaffRole, StaffRow } from "@/lib/types/database";

type StaffAccountRow = Pick<StaffRow, "id" | "name" | "role" | "department" | "is_active" | "created_at" | "updated_at">;

type StaffFormState = {
  id: string | null;
  name: string;
  role: StaffRole;
  department: "" | Department;
  password: string;
  isActive: boolean;
};

const ROLE_OPTIONS: { id: StaffRole; label: string; detail: string; scope: string }[] = [
  {
    id: "master_admin",
    label: ROLE_ACCESS_PROFILE.master_admin.label,
    detail: ROLE_ACCESS_PROFILE.master_admin.detail,
    scope: ROLE_ACCESS_PROFILE.master_admin.scope,
  },
  {
    id: "admin",
    label: ROLE_ACCESS_PROFILE.admin.label,
    detail: ROLE_ACCESS_PROFILE.admin.detail,
    scope: ROLE_ACCESS_PROFILE.admin.scope,
  },
  {
    id: "op_manager",
    label: ROLE_ACCESS_PROFILE.op_manager.label,
    detail: ROLE_ACCESS_PROFILE.op_manager.detail,
    scope: ROLE_ACCESS_PROFILE.op_manager.scope,
  },
  {
    id: "bar_staff",
    label: ROLE_ACCESS_PROFILE.bar_staff.label,
    detail: ROLE_ACCESS_PROFILE.bar_staff.detail,
    scope: ROLE_ACCESS_PROFILE.bar_staff.scope,
  },
  {
    id: "kitchen_staff",
    label: ROLE_ACCESS_PROFILE.kitchen_staff.label,
    detail: ROLE_ACCESS_PROFILE.kitchen_staff.detail,
    scope: ROLE_ACCESS_PROFILE.kitchen_staff.scope,
  },
  {
    id: "viewer",
    label: ROLE_ACCESS_PROFILE.viewer.label,
    detail: ROLE_ACCESS_PROFILE.viewer.detail,
    scope: ROLE_ACCESS_PROFILE.viewer.scope,
  },
];

const DEPARTMENT_OPTIONS: { id: Department; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "kitchen", label: "Kitchen" },
];

const EMPTY_FORM: StaffFormState = {
  id: null,
  name: "",
  role: "bar_staff",
  department: "bar",
  password: "",
  isActive: true,
};

function roleLabel(role: StaffRole): string {
  return getRoleLabel(role);
}

function normalizeDepartment(role: StaffRole, department: "" | Department): Department | null {
  if (role === "bar_staff") return "bar";
  if (role === "kitchen_staff") return "kitchen";
  if (role === "master_admin" || role === "admin" || role === "op_manager" || role === "viewer") return null;
  return department || null;
}

function nextDepartmentForRole(role: StaffRole, current: "" | Department): "" | Department {
  if (role === "bar_staff") return "bar";
  if (role === "kitchen_staff") return "kitchen";
  if (role === "master_admin" || role === "admin" || role === "op_manager" || role === "viewer") return "";
  return current;
}

export function StaffAccountsPanel() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const session = getStaffSession();
  const canManageStaff = canManageStaffAccounts(session?.role);
  const [rows, setRows] = useState<StaffAccountRow[]>([]);
  const [form, setForm] = useState<StaffFormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ variant: "success" | "error"; message: string } | null>(null);

  const loadStaff = useCallback(async () => {
    setIsLoading(true);
    setNotice(null);
    const { data, error } = await supabase
      .from("staff")
      .select("id, name, role, department, is_active, created_at, updated_at")
      .order("is_active", { ascending: false })
      .order("role", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      setNotice({ variant: "error", message: `Gagal memuat akun staff: ${error.message}` });
      setIsLoading(false);
      return;
    }

    setRows((data ?? []) as StaffAccountRow[]);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setNotice(null);
  };

  const editRow = (row: StaffAccountRow) => {
    setForm({
      id: row.id,
      name: row.name,
      role: row.role,
      department: row.department ?? "",
      password: "",
      isActive: row.is_active,
    });
    setNotice(null);
  };

  const saveStaff = async () => {
    if (!canManageStaff) {
      setNotice({ variant: "error", message: "Hanya Master Admin yang bisa mengubah akun staff." });
      return;
    }

    const name = form.name.trim();
    const password = form.password.trim();
    const department = normalizeDepartment(form.role, form.department);
    if (!name) {
      setNotice({ variant: "error", message: "Nama staff wajib diisi." });
      return;
    }
    if (!form.id && password.length < 4) {
      setNotice({ variant: "error", message: "Password/PIN awal minimal 4 karakter." });
      return;
    }
    if (form.id && password.length > 0 && password.length < 4) {
      setNotice({ variant: "error", message: "Password/PIN reset minimal 4 karakter." });
      return;
    }

    setIsSaving(true);
    setNotice(null);

    const basePayload = {
      name,
      role: form.role,
      department,
      is_active: form.isActive,
    };
    const payload = password ? { ...basePayload, pin_code: password } : basePayload;
    const result = form.id
      ? await supabase.from("staff").update(payload).eq("id", form.id)
      : await supabase.from("staff").insert({ ...payload, pin_code: password });

    if (result.error) {
      setNotice({ variant: "error", message: `Gagal menyimpan akun staff: ${result.error.message}` });
      setIsSaving(false);
      return;
    }

    setNotice({
      variant: "success",
      message: form.id ? "Akun staff berhasil diperbarui." : "Akun staff baru berhasil dibuat.",
    });
    setForm(EMPTY_FORM);
    await loadStaff();
    setIsSaving(false);
  };

  const activeCount = rows.filter((row) => row.is_active).length;
  const inactiveCount = rows.length - activeCount;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <UserCog className="h-5 w-5 text-teal-700" />
            <h2 className="text-lg font-bold text-slate-900">Account Role Control</h2>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            Pisahkan akun sebagai Master Admin, Admin, Manager Operasional, Staff per department, dan Viewer.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadStaff()}
          disabled={isLoading}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-teal-200 disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Total Staff</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{rows.length}</p>
        </div>
        <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">Aktif</p>
          <p className="mt-2 text-2xl font-bold text-teal-700">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Nonaktif</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{inactiveCount}</p>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {ROLE_OPTIONS.map((role) => {
          const count = rows.filter((row) => row.role === role.id).length;
          return (
            <div key={role.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{role.label}</p>
                  <p className="mt-0.5 truncate text-xs text-teal-700">{role.scope}</p>
                </div>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900">
                  {count}
                </span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-snug text-slate-600">{role.detail}</p>
            </div>
          );
        })}
      </div>

      {!canManageStaff ? (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900">
          Akun kamu bukan Master Admin, jadi panel account ini read-only.
        </p>
      ) : null}

      {notice ? (
        <p
          className={`rounded-xl border px-4 py-3 text-sm ${
            notice.variant === "success"
              ? "border-teal-200 bg-teal-50 text-teal-700"
              : "border-red-500/40 bg-red-500/10 text-red-700"
          }`}
        >
          {notice.message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveStaff();
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">{form.id ? "Edit Staff" : "Tambah Staff"}</h3>
              <p className="mt-0.5 text-xs text-slate-600">
                Password lama tidak ditampilkan. Isi password hanya saat reset.
              </p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50/80"
            >
              <Plus className="h-3.5 w-3.5" />
              Baru
            </button>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Nama</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                disabled={!canManageStaff}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 disabled:opacity-60"
                placeholder="Nama staff"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Role</span>
              <select
                value={form.role}
                onChange={(event) => {
                  const role = event.target.value as StaffRole;
                  setForm((current) => ({
                    ...current,
                    role,
                    department: nextDepartmentForRole(role, current.department),
                  }));
                }}
                disabled={!canManageStaff}
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 disabled:opacity-60"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-600">
                {getRoleDetail(form.role)}
              </span>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600">Department</span>
              <select
                value={form.department}
                onChange={(event) =>
                  setForm((current) => ({ ...current, department: event.target.value as "" | Department }))
                }
                disabled={
                  !canManageStaff ||
                  form.role === "master_admin" ||
                  form.role === "admin" ||
                  form.role === "op_manager" ||
                  form.role === "viewer"
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 disabled:opacity-60"
              >
                <option value="">Tidak ada</option>
                {DEPARTMENT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold text-slate-600">
                {form.id ? "Reset Password/PIN" : "Password/PIN Awal"}
              </span>
              <div className="relative mt-1">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  disabled={!canManageStaff}
                  className="min-h-11 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-teal-500 disabled:opacity-60"
                  placeholder={form.id ? "Kosongkan jika tidak reset" : "Minimal 4 karakter"}
                />
              </div>
            </label>

            <label className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3">
              <span className="text-sm font-semibold text-slate-700">Akun aktif</span>
              <input
                type="checkbox"
                checked={form.isActive}
                disabled={!canManageStaff}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                className="h-5 w-5 accent-cyan-400 disabled:opacity-60"
              />
            </label>

            <button
              type="submit"
              disabled={!canManageStaff || isSaving}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Simpan Akun
            </button>
          </div>
        </form>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white lg:col-span-8">
          {isLoading ? (
            <div className="flex min-h-72 items-center justify-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-5 w-5 animate-spin text-teal-700" />
              Memuat akun staff...
            </div>
          ) : (
            <div className="overflow-auto scrollbar-thin">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-[0.12em] text-slate-600">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Staff</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Dept</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 transition-colors last:border-b-0 hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-700">
                            <ShieldCheck className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="font-semibold text-slate-900">{row.name}</p>
                            <p className="text-xs text-slate-600">Updated {new Date(row.updated_at).toLocaleDateString("id-ID")}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-slate-700">{roleLabel(row.role)}</span>
                        <span className="block text-xs text-slate-600">{getRoleScope(row.role)}</span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.department ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                            row.is_active
                              ? "bg-teal-50 text-teal-700"
                              : "bg-slate-50 text-slate-600"
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {row.is_active ? "Aktif" : "Nonaktif"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => editRow(row)}
                          className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:border-teal-200 hover:text-teal-700"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
