"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getRouteForRole,
  getStaffSession,
  setStaffSession,
  type StaffSession,
} from "@/lib/auth/session";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
import type { StaffRole } from "@/lib/types/database";

const PIN_LENGTH = 6;

type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "C" | "⌫";

const KEYPAD: KeypadKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["C", "0", "⌫"],
];

export function PinGate() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    const existing = getStaffSession();
    if (existing) {
      router.replace(getRouteForRole(existing.role));
    }
  }, [router]);

  const clearPin = useCallback(() => setPin(""), []);

  const showError = useCallback(
    (message: string) => {
      setError(message);
      setShake(true);
      setPin("");
      window.setTimeout(() => setShake(false), 450);
    },
    []
  );

  const verifyPin = useCallback(
    async (code: string) => {
      const supabase = getSupabaseClientOrNull();
      if (!supabase) {
        showError("Koneksi database belum siap.");
        return;
      }

      setChecking(true);
      setError(null);

      const { data, error: queryError } = await supabase
        .from("staff")
        .select("id, name, role, department")
        .eq("pin_code", code)
        .eq("is_active", true)
        .maybeSingle();

      setChecking(false);

      if (queryError) {
        showError("Gagal memverifikasi PIN. Coba lagi.");
        return;
      }

      if (!data) {
        showError("PIN salah atau staf nonaktif.");
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
    },
    [router, showError]
  );

  useEffect(() => {
    if (pin.length !== PIN_LENGTH || checking) return;
    void verifyPin(pin);
  }, [pin, checking, verifyPin]);

  const handleKey = (key: KeypadKey) => {
    if (checking) return;
    setError(null);

    if (key === "C") {
      clearPin();
      return;
    }
    if (key === "⌫") {
      setPin((prev) => prev.slice(0, -1));
      return;
    }
    if (pin.length >= PIN_LENGTH) return;
    setPin((prev) => prev + key);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4 py-8">
      <header className="mb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">
          Abdul Company
        </p>
        <h1 className="mt-2 text-3xl font-bold text-white">Artha System</h1>
        <p className="mt-2 text-sm text-slate-400">Masukkan PIN 6 digit staf</p>
      </header>

      <div
        className={`mb-8 flex gap-3 ${shake ? "animate-shake" : ""}`}
        aria-label={`PIN ${pin.length} dari ${PIN_LENGTH}`}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${
              i < pin.length
                ? "border-amber-400 bg-amber-400"
                : "border-slate-500 bg-transparent"
            }`}
          />
        ))}
      </div>

      {error && (
        <p className="mb-6 text-center text-sm font-medium text-red-400" role="alert">
          {error}
        </p>
      )}

      {checking && (
        <p className="mb-4 text-center text-sm text-slate-400">Memverifikasi…</p>
      )}

      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {KEYPAD.flat().map((key) => (
          <button
            key={key}
            type="button"
            disabled={checking}
            onClick={() => handleKey(key)}
            className={`flex min-h-[4.25rem] items-center justify-center rounded-2xl text-2xl font-semibold transition active:scale-95 disabled:opacity-50 ${
              key === "C" || key === "⌫"
                ? "bg-slate-700 text-slate-200"
                : "bg-slate-800 text-white ring-1 ring-slate-600"
            }`}
            aria-label={key === "C" ? "Hapus semua" : key === "⌫" ? "Hapus satu" : `Angka ${key}`}
          >
            {key}
          </button>
        ))}
      </div>

      <p className="mt-10 text-center text-xs text-slate-500">
        Gunakan keypad di layar — bukan keyboard HP
      </p>
    </main>
  );
}
