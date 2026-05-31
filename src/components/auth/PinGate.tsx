"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, Lock, UserRound } from "lucide-react";
import {
  getRouteForRole,
  getStaffSession,
  setStaffSession,
  type StaffSession,
} from "@/lib/auth/session";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
import type { Department, StaffRole } from "@/lib/types/database";

type LoginStaffOption = {
  id: string;
  name: string;
  role: StaffRole;
  department: Department | null;
};

export function PinGate() {
  const router = useRouter();
  const [staffOptions, setStaffOptions] = useState<LoginStaffOption[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const existing = getStaffSession();
    if (existing) {
      router.replace(getRouteForRole(existing.role));
    }
  }, [router]);

  useEffect(() => {
    const supabase = getSupabaseClientOrNull();
    if (!supabase) {
      setError("Koneksi database belum siap.");
      setLoadingStaff(false);
      return;
    }
    const client = supabase;

    let cancelled = false;

    async function loadStaff() {
      setLoadingStaff(true);
      setError(null);

      const { data, error: staffErr } = await client.rpc("list_active_login_staff");

      if (cancelled) return;

      if (staffErr) {
        setError("Gagal mengambil daftar staff.");
        setStaffOptions([]);
      } else {
        const rows = (data ?? []) as LoginStaffOption[];
        setStaffOptions(rows);
        setSelectedName((current) => current || rows[0]?.name || "");
      }

      setLoadingStaff(false);
    }

    void loadStaff();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedStaff = useMemo(
    () => staffOptions.find((staff) => staff.name === selectedName) ?? null,
    [selectedName, staffOptions]
  );

  const verifyPassword = useCallback(async () => {
    const name = selectedName.trim();
    const rawPassword = password.trim();

    if (!name) {
      setError("Pilih nama staff dulu.");
      return;
    }
    if (!rawPassword) {
      setError("Password wajib diisi.");
      return;
    }

    const supabase = getSupabaseClientOrNull();
    if (!supabase) {
      setError("Koneksi database belum siap.");
      return;
    }

    setChecking(true);
    setError(null);

    const { data: matches, error: queryError } = await supabase.rpc("verify_staff_password", {
      p_name: name,
      p_password: rawPassword,
    });

    setChecking(false);

    if (queryError) {
      setError("Gagal memverifikasi password. Coba lagi.");
      return;
    }

    const data = matches?.[0] ?? null;
    if (!data) {
      setError("Nama atau password salah.");
      setPassword("");
      return;
    }

    const session: StaffSession = {
      id: data.id,
      name: data.name,
      role: data.role as StaffRole,
      department: data.department,
    };

    setStaffSession(session);
    router.replace(getRouteForRole(session.role));
  }, [password, router, selectedName]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-8">
      <header className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
          Abdul Company
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">Artha System</h1>
        <p className="mt-2 text-sm text-slate-400">Login staff dengan nama dan password</p>
      </header>

      <form
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800/70 p-4 shadow-2xl shadow-slate-950/40"
        onSubmit={(event) => {
          event.preventDefault();
          if (!checking && !loadingStaff) void verifyPassword();
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Nama staff</span>
          <div className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 focus-within:border-amber-400">
            <UserRound className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <select
              value={selectedName}
              onChange={(event) => {
                setSelectedName(event.target.value);
                setPassword("");
                setError(null);
              }}
              disabled={loadingStaff || checking}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none disabled:opacity-60"
            >
              {loadingStaff ? (
                <option value="">Memuat staff...</option>
              ) : staffOptions.length === 0 ? (
                <option value="">Belum ada staff aktif</option>
              ) : (
                staffOptions.map((staff) => (
                  <option key={staff.id} value={staff.name}>
                    {staff.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-medium text-slate-400">Password</span>
          <div className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 focus-within:border-amber-400">
            <Lock className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setError(null);
              }}
              disabled={loadingStaff || checking || !selectedStaff}
              autoComplete="current-password"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-slate-600 disabled:opacity-60"
              placeholder="Masukkan password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </label>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loadingStaff || checking || !selectedStaff || !password.trim()}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {checking ? "Memverifikasi..." : "Masuk"}
        </button>
      </form>

      <p className="mt-6 max-w-sm text-center text-xs text-slate-500">
        Password awal mengikuti PIN lama sampai admin menggantinya.
      </p>
    </main>
  );
}
