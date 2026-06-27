"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Loader2, Plus, UserRound, X } from "lucide-react";
import { resolveBusinessDate } from "@/lib/utils/dateHelper";
import type { ActivityLogEntry, AddStaffMode, AddStaffPayload, StaffOption } from "../types";

type AddStaffModalProps = {
  open: boolean;
  mode: AddStaffMode;
  canCreate: boolean;
  staffOptions: StaffOption[];
  isSaving: boolean;
  onClose: () => void;
  onSubmit: (payload: AddStaffPayload) => Promise<void>;
};

function todayIso(): string {
  return resolveBusinessDate();
}

function parseNumberInput(value: string): number {
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function buildActivityLog(raw: string): ActivityLogEntry[] {
  const now = new Date().toISOString();
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((note, index) => ({
      id: `${Date.now()}-${index}`,
      timestamp: now,
      note,
    }));
}

export function AddStaffModal({
  open,
  mode,
  canCreate,
  staffOptions,
  isSaving,
  onClose,
  onSubmit,
}: AddStaffModalProps) {
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(todayIso);
  const [hourlyRate, setHourlyRate] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [workDays, setWorkDays] = useState("1");
  const [activityLog, setActivityLog] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const selectedStaff = staffOptions.find((staff) => staff.id === selectedStaffId) ?? null;
  const normalizedHourlyRate = parseNumberInput(hourlyRate);
  const normalizedTotalHours = parseNumberInput(totalHours);
  const normalizedDailyRate = parseNumberInput(dailyRate);
  const normalizedWorkDays = Math.max(1, parseNumberInput(workDays));
  const computedTotal = useMemo(() => {
    if (mode === "daily_worker") {
      return normalizedDailyRate * normalizedWorkDays + normalizedHourlyRate * normalizedTotalHours;
    }
    return normalizedHourlyRate * normalizedTotalHours;
  }, [mode, normalizedDailyRate, normalizedHourlyRate, normalizedTotalHours, normalizedWorkDays]);

  useEffect(() => {
    if (!open) return;
    setSelectedStaffId("");
    setName("");
    setDate(todayIso());
    setHourlyRate("");
    setTotalHours("");
    setDailyRate("");
    setWorkDays("1");
    setActivityLog("");
    setFormError(null);
  }, [open, mode]);

  useEffect(() => {
    if (mode === "overtime") setName(selectedStaff?.name ?? "");
  }, [mode, selectedStaff]);

  if (!open) return null;

  const title = mode === "overtime" ? "Input Lembur Staff" : "Create Daily Worker";
  const description =
    mode === "overtime"
      ? "Catat jam lembur, nominal per jam, dan aktivitas yang dikerjakan."
      : "Buat nama DW, catat hari kerja, lembur, dan detail aktivitas secara transparan.";

  const submit = async () => {
    if (!canCreate) {
      setFormError("Hanya Master Admin atau Manager Operasional yang bisa membuat record.");
      return;
    }
    if (!date) {
      setFormError("Tanggal wajib diisi.");
      return;
    }
    if (!name.trim()) {
      setFormError(mode === "overtime" ? "Pilih staff lembur dulu." : "Nama DW wajib diisi.");
      return;
    }
    if (mode === "daily_worker" && normalizedDailyRate <= 0) {
      setFormError("Upah harian DW wajib lebih dari 0.");
      return;
    }
    if (mode === "overtime" && (normalizedHourlyRate <= 0 || normalizedTotalHours <= 0)) {
      setFormError("Nominal per jam dan total jam lembur wajib lebih dari 0.");
      return;
    }
    if (buildActivityLog(activityLog).length === 0) {
      setFormError("Catatan aktivitas wajib diisi minimal 1 baris.");
      return;
    }

    await onSubmit({
      record_type: mode,
      staff_id: mode === "overtime" ? selectedStaffId || null : null,
      name: name.trim(),
      date,
      hourly_rate: normalizedHourlyRate,
      total_hours: normalizedTotalHours,
      daily_rate: mode === "daily_worker" ? normalizedDailyRate : 0,
      work_days: mode === "daily_worker" ? normalizedWorkDays : 0,
      activity_log: buildActivityLog(activityLog),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white px-4 py-6 backdrop-blur-sm">
      <section className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">
              Operational Tracker
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-700"
            aria-label="Tutup modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid max-h-[76vh] gap-4 overflow-y-auto px-5 py-5 scrollbar-thin">
          {!canCreate ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Akun ini tidak punya akses untuk membuat record overtime atau DW.
            </p>
          ) : null}
          {formError ? (
            <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {formError}
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            {mode === "overtime" ? (
              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <UserRound className="h-4 w-4" />
                  Staff lembur
                </span>
                <select
                  value={selectedStaffId}
                  disabled={!canCreate || isSaving}
                  onChange={(event) => setSelectedStaffId(event.target.value)}
                  className="min-h-11 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="">Pilih staff</option>
                  {staffOptions.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block">
                <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <UserRound className="h-4 w-4" />
                  Nama Daily Worker
                </span>
                <input
                  value={name}
                  disabled={!canCreate || isSaving}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Contoh: Raka DW"
                  className="min-h-11 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </label>
            )}

            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
                <CalendarDays className="h-4 w-4" />
                Tanggal kerja
              </span>
              <input
                type="date"
                value={date}
                disabled={!canCreate || isSaving}
                onChange={(event) => setDate(event.target.value)}
                className="min-h-11 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
          </div>

          {mode === "daily_worker" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 text-xs font-semibold text-slate-600">Upah harian</span>
                <input
                  inputMode="decimal"
                  value={dailyRate}
                  disabled={!canCreate || isSaving}
                  onChange={(event) => setDailyRate(event.target.value)}
                  placeholder="Contoh: 150000"
                  className="min-h-11 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </label>
              <label className="block">
                <span className="mb-1 text-xs font-semibold text-slate-600">Jumlah hari kerja</span>
                <input
                  inputMode="decimal"
                  value={workDays}
                  disabled={!canCreate || isSaving}
                  onChange={(event) => setWorkDays(event.target.value)}
                  placeholder="Contoh: 1"
                  className="min-h-11 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500"
                />
              </label>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 text-xs font-semibold text-slate-600">
                {mode === "daily_worker" ? "Rate lembur per jam" : "Nominal per jam"}
              </span>
              <input
                inputMode="decimal"
                value={hourlyRate}
                disabled={!canCreate || isSaving}
                onChange={(event) => setHourlyRate(event.target.value)}
                placeholder="Contoh: 25000"
                className="min-h-11 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-600">
                <Clock3 className="h-4 w-4" />
                {mode === "daily_worker" ? "Jam lembur" : "Total jam lembur"}
              </span>
              <input
                inputMode="decimal"
                value={totalHours}
                disabled={!canCreate || isSaving}
                onChange={(event) => setTotalHours(event.target.value)}
                placeholder="Contoh: 2,5"
                className="min-h-11 w-full rounded-md border border-slate-200/80 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 text-xs font-semibold text-slate-600">Catatan aktivitas kronologis</span>
            <textarea
              rows={5}
              value={activityLog}
              disabled={!canCreate || isSaving}
              onChange={(event) => setActivityLog(event.target.value)}
              placeholder={"Satu baris untuk satu aktivitas.\nContoh: Closing inventory bar\nContoh: Deep cleaning area kitchen"}
              className="w-full rounded-md border border-slate-200/80 bg-white px-3 py-3 text-sm font-medium leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </label>

          <div className="rounded-md border border-slate-200/80 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-600">Total bayaran realtime</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{formatRupiah(computedTotal)}</p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200/80 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-200/80 bg-white px-4 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canCreate || isSaving}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-medium text-white transition-all hover:bg-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Record
          </button>
        </div>
      </section>
    </div>
  );
}
