"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  BriefcaseBusiness,
  Clock3,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { getStaffSession, type StaffSession } from "@/lib/auth/session";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
import type { StaffRole } from "@/lib/types/database";
import { ActivityLogDrawer } from "./components/ActivityLogDrawer";
import { AddStaffModal } from "./components/AddStaffModal";
import { OvertimeTable } from "./components/OvertimeTable";
import type {
  AddStaffMode,
  AddStaffPayload,
  OperationalTrackerDbRow,
  OperationalTrackerRecord,
  StaffOption,
} from "./types";

const TRACKER_ROLES: StaffRole[] = ["master_admin", "op_manager"];

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function resolveCreatorName(value: OperationalTrackerDbRow["creator"]): string | null {
  if (Array.isArray(value)) return value[0]?.name ?? null;
  return value?.name ?? null;
}

function normalizeActivityLog(value: OperationalTrackerDbRow["activity_log"]) {
  return Array.isArray(value) ? value : [];
}

function mapDbRow(row: OperationalTrackerDbRow): OperationalTrackerRecord {
  const common = {
    id: row.id,
    staff_id: row.staff_id,
    name: row.name,
    date: row.date,
    hourly_rate: Number(row.hourly_rate ?? 0),
    total_hours: Number(row.total_hours ?? 0),
    activity_log: normalizeActivityLog(row.activity_log),
    total_pay: Number(row.total_pay ?? 0),
    status: row.status,
    created_by: row.created_by,
    created_by_name: resolveCreatorName(row.creator),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  if (row.record_type === "daily_worker") {
    return {
      ...common,
      record_type: "daily_worker",
      staff_id: null,
      daily_rate: Number(row.daily_rate ?? 0),
      work_days: Number(row.work_days ?? 0),
      total_daily_wage: Number(row.total_daily_wage ?? 0),
    };
  }

  return {
    ...common,
    record_type: "overtime",
  };
}

function SummaryCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Clock3;
  tone?: "slate" | "teal";
}) {
  const toneClass = {
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    teal: "bg-teal-50 text-teal-700 ring-teal-100",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1 ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function OperationalTrackerContent() {
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const [session, setSession] = useState<StaffSession | null>(() => getStaffSession());
  const [records, setRecords] = useState<OperationalTrackerRecord[]>([]);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [modalMode, setModalMode] = useState<AddStaffMode | null>(null);
  const [activityRecord, setActivityRecord] = useState<OperationalTrackerRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ variant: "success" | "error"; message: string } | null>(null);

  const canCreate = session?.role === "master_admin" || session?.role === "op_manager";

  const summary = useMemo(() => {
    const overtimeRows = records.filter((record) => record.record_type === "overtime");
    const dailyWorkerRows = records.filter((record) => record.record_type === "daily_worker");
    return {
      totalRecords: records.length,
      totalHours: records.reduce((sum, record) => sum + record.total_hours, 0),
      totalPay: records.reduce((sum, record) => sum + record.total_pay, 0),
      paidCount: records.filter((record) => record.status === "paid").length,
      overtimeCount: overtimeRows.length,
      dailyWorkerCount: dailyWorkerRows.length,
    };
  }, [records]);

  const loadTracker = useCallback(async () => {
    if (!supabase) {
      setNotice({ variant: "error", message: "Supabase belum dikonfigurasi." });
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setNotice(null);

    const [recordResult, staffResult] = await Promise.all([
      supabase
        .from("operational_tracker_record")
        .select("*, creator:created_by ( name )")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("staff")
        .select("id, name, role")
        .eq("is_active", true)
        .in("role", ["bar_staff", "kitchen_staff", "admin", "op_manager"])
        .order("name", { ascending: true }),
    ]);

    const firstError = recordResult.error ?? staffResult.error;
    if (firstError) {
      setRecords([]);
      setStaffOptions([]);
      setNotice({
        variant: "error",
        message: `Gagal memuat operational tracker. Pastikan migration 051 sudah dijalankan. Detail: ${firstError.message}`,
      });
      setIsLoading(false);
      return;
    }

    setRecords(((recordResult.data ?? []) as OperationalTrackerDbRow[]).map(mapDbRow));
    setStaffOptions((staffResult.data ?? []) as StaffOption[]);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    setSession(getStaffSession());
    void loadTracker();
  }, [loadTracker]);

  const createRecord = async (payload: AddStaffPayload) => {
    if (!supabase || !session) {
      setNotice({ variant: "error", message: "Session atau Supabase belum siap." });
      return;
    }
    if (!canCreate) {
      setNotice({ variant: "error", message: "Hanya Master Admin atau Manager Operasional yang bisa membuat record." });
      return;
    }

    const totalDailyWage = payload.record_type === "daily_worker" ? payload.daily_rate * payload.work_days : 0;
    const overtimePay = payload.hourly_rate * payload.total_hours;
    const totalPay = totalDailyWage + overtimePay;

    setIsSaving(true);
    setNotice(null);

    const { error } = await supabase.from("operational_tracker_record").insert({
      record_type: payload.record_type,
      staff_id: payload.record_type === "overtime" ? payload.staff_id : null,
      name: payload.name,
      date: payload.date,
      hourly_rate: payload.hourly_rate,
      total_hours: payload.total_hours,
      daily_rate: payload.record_type === "daily_worker" ? payload.daily_rate : 0,
      work_days: payload.record_type === "daily_worker" ? payload.work_days : 0,
      total_daily_wage: totalDailyWage,
      activity_log: payload.activity_log,
      total_pay: totalPay,
      status: "draft",
      created_by: session.id,
    });

    if (error) {
      setNotice({
        variant: "error",
        message: `Gagal membuat record operational tracker. Pastikan migration 051 sudah dijalankan. Detail: ${error.message}`,
      });
      setIsSaving(false);
      return;
    }

    setModalMode(null);
    setNotice({ variant: "success", message: "Record operational tracker berhasil dibuat." });
    setIsSaving(false);
    await loadTracker();
  };

  const markPaid = async (record: OperationalTrackerRecord) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("operational_tracker_record")
      .update({ status: "paid", updated_at: new Date().toISOString() })
      .eq("id", record.id);

    if (error) {
      setNotice({ variant: "error", message: `Gagal update status paid: ${error.message}` });
      return;
    }

    setRecords((current) =>
      current.map((item) => (item.id === record.id ? { ...item, status: "paid", updated_at: new Date().toISOString() } : item))
    );
    setNotice({ variant: "success", message: `${record.name} ditandai Paid.` });
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6 lg:p-8">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link
              href="/admin/master-data"
              className="mb-5 inline-flex items-center gap-2 rounded-md border border-slate-200/80 bg-white px-3 py-2 text-sm font-semibold text-slate-600 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard Admin
            </Link>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]">
                <BriefcaseBusiness className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  Operational Staff & Overtime Tracker
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  Kelola lembur staff dan Daily Worker dengan catatan aktivitas yang transparan, terukur, dan siap diaudit.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void loadTracker()}
              disabled={isLoading}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-200/80 bg-white px-4 text-sm font-medium text-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setModalMode("overtime")}
              disabled={!canCreate}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-teal-200 bg-white px-4 text-sm font-medium text-teal-700 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:bg-teal-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-500"
            >
              <Plus className="h-4 w-4" />
              Add Overtime
            </button>
            <button
              type="button"
              onClick={() => setModalMode("daily_worker")}
              disabled={!canCreate}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-teal-600 px-4 text-sm font-medium text-white shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:bg-teal-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Plus className="h-4 w-4" />
              Add DW
            </button>
          </div>
        </header>

        {notice ? (
          <p
            className={`rounded-lg border px-4 py-3 text-sm shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] ${
              notice.variant === "success"
                ? "border-teal-200 bg-teal-50 text-teal-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {notice.message}
          </p>
        ) : null}

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 md:gap-6">
          <SummaryCard
            label="Total Bayaran"
            value={formatRupiah(summary.totalPay)}
            detail={`${summary.totalRecords.toLocaleString("id-ID")} record operational`}
            icon={Banknote}
            tone="teal"
          />
          <SummaryCard
            label="Total Jam"
            value={`${summary.totalHours.toLocaleString("id-ID")} jam`}
            detail="Gabungan overtime dan DW overtime"
            icon={Clock3}
          />
          <SummaryCard
            label="Daily Worker"
            value={summary.dailyWorkerCount.toLocaleString("id-ID")}
            detail="Record DW dalam ledger"
            icon={UsersRound}
            tone="teal"
          />
          <SummaryCard
            label="Paid"
            value={summary.paidCount.toLocaleString("id-ID")}
            detail={`${summary.overtimeCount.toLocaleString("id-ID")} record lembur`}
            icon={ShieldCheck}
            tone="teal"
          />
        </section>

        <OvertimeTable
          records={records}
          loading={isLoading}
          onViewActivity={setActivityRecord}
          onMarkPaid={(record) => void markPaid(record)}
        />
      </div>

      <AddStaffModal
        open={modalMode !== null}
        mode={modalMode ?? "overtime"}
        canCreate={canCreate}
        staffOptions={staffOptions}
        isSaving={isSaving}
        onClose={() => setModalMode(null)}
        onSubmit={createRecord}
      />

      <ActivityLogDrawer record={activityRecord} onClose={() => setActivityRecord(null)} />
    </main>
  );
}

export default function OperationalTrackerPage() {
  return (
    <ProtectedRoute allowedRoles={TRACKER_ROLES}>
      <OperationalTrackerContent />
    </ProtectedRoute>
  );
}
