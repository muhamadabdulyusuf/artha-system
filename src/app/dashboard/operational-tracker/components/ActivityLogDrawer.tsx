"use client";

import { ClipboardList, X } from "lucide-react";
import type { OperationalTrackerRecord } from "../types";

type ActivityLogDrawerProps = {
  record: OperationalTrackerRecord | null;
  onClose: () => void;
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

export function ActivityLogDrawer({ record, onClose }: ActivityLogDrawerProps) {
  if (!record) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-white backdrop-blur-sm">
      <aside className="flex h-full w-full max-w-md flex-col border-l border-slate-200/80 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">Activity Log</p>
            <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-slate-950">{record.name}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {record.record_type === "daily_worker" ? "Daily Worker" : "Overtime"} · {record.date}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-700"
            aria-label="Tutup catatan aktivitas"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 border-b border-slate-200/80 bg-slate-50 px-5 py-4">
          <div className="rounded-md border border-slate-200/80 bg-white px-3 py-2">
            <p className="text-xs font-medium text-slate-600">Total Jam</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">
              {record.total_hours.toLocaleString("id-ID")} jam
            </p>
          </div>
          <div className="rounded-md border border-slate-200/80 bg-white px-3 py-2">
            <p className="text-xs font-medium text-slate-600">Total Bayaran</p>
            <p className="mt-1 text-lg font-semibold text-slate-950">{formatRupiah(record.total_pay)}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 scrollbar-thin">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-teal-600" />
            <p className="text-sm font-semibold text-slate-900">Catatan kerja kronologis</p>
          </div>

          {record.activity_log.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200/80 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              Belum ada catatan aktivitas.
            </p>
          ) : (
            <ol className="space-y-3">
              {record.activity_log.map((log, index) => (
                <li key={log.id} className="relative rounded-lg border border-slate-200/80 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)]">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700 ring-1 ring-teal-100">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-6 text-slate-900">{log.note}</p>
                      <p className="mt-1 text-xs text-slate-600">{formatDateTime(log.timestamp)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="border-t border-slate-200/80 bg-slate-50 px-5 py-4">
          <p className="text-xs leading-5 text-slate-600">
            Dibuat oleh {record.created_by_name ?? "unknown"} pada {formatDateTime(record.created_at)}.
          </p>
        </div>
      </aside>
    </div>
  );
}
