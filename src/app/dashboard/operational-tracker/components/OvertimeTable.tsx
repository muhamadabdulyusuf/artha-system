"use client";

import { CheckCircle2, ClipboardList, Eye, Loader2 } from "lucide-react";
import type { OperationalTrackerRecord } from "../types";

type OvertimeTableProps = {
  records: OperationalTrackerRecord[];
  loading: boolean;
  onViewActivity: (record: OperationalTrackerRecord) => void;
  onMarkPaid: (record: OperationalTrackerRecord) => void;
};

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

function recordTypeLabel(record: OperationalTrackerRecord): string {
  return record.record_type === "daily_worker" ? "Daily Worker" : "Overtime";
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, index) => (
        <tr key={index} className="animate-pulse">
          <td className="px-5 py-4">
            <div className="h-4 w-36 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-20 rounded bg-slate-100" />
          </td>
          <td className="px-5 py-4">
            <div className="h-4 w-24 rounded bg-slate-200" />
          </td>
          <td className="px-5 py-4">
            <div className="h-4 w-20 rounded bg-slate-200" />
          </td>
          <td className="px-5 py-4">
            <div className="h-4 w-28 rounded bg-slate-200" />
          </td>
          <td className="px-5 py-4">
            <div className="h-7 w-20 rounded-full bg-slate-200" />
          </td>
          <td className="px-5 py-4">
            <div className="h-9 w-32 rounded bg-slate-200" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function OvertimeTable({ records, loading, onViewActivity, onMarkPaid }: OvertimeTableProps) {
  return (
    <section className="flex h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02),0_1px_2px_rgba(0,0,0,0.04)] transition duration-200 hover:shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
      <div className="shrink-0 border-b border-slate-200/80 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-700">Operational Ledger</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-950">Overtime & Daily Worker berjalan</h2>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardList className="h-3.5 w-3.5" />}
          {records.length.toLocaleString("id-ID")} record
        </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">
        <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr>
              <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Staff / DW</th>
              <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Tanggal</th>
              <th className="whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-600">Total Jam</th>
              <th className="whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-600">Total Bayaran</th>
              <th className="whitespace-nowrap px-5 py-3 font-semibold text-slate-600">Status</th>
              <th className="whitespace-nowrap px-5 py-3 text-right font-semibold text-slate-600">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading ? <SkeletonRows /> : null}

            {!loading && records.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-14 text-center">
                  <p className="text-sm font-semibold text-slate-700">Belum ada record operational tracker.</p>
                  <p className="mt-1 text-sm text-slate-600">Buat lembur staff atau DW baru untuk mulai tracking.</p>
                </td>
              </tr>
            ) : null}

            {!loading
              ? records.map((record) => (
                  <tr key={record.id} className="transition hover:bg-teal-50/60">
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900">{record.name}</p>
                      <p className="mt-1 text-xs text-slate-600">{recordTypeLabel(record)}</p>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-900">{record.date}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums text-slate-900">
                      {record.total_hours.toLocaleString("id-ID")} jam
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums text-slate-900">
                      {formatRupiah(record.total_pay)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          record.status === "paid"
                            ? "bg-teal-50 text-teal-700 ring-1 ring-teal-100"
                            : "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
                        }`}
                      >
                        {record.status === "paid" ? "Paid" : "Draft"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onViewActivity(record)}
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-200/80 bg-white px-3 text-xs font-semibold text-slate-700 transition-all hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 active:scale-[0.98]"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Lihat Catatan Aktivitas
                        </button>
                        {record.status !== "paid" ? (
                          <button
                            type="button"
                            onClick={() => onMarkPaid(record)}
                            className="inline-flex min-h-9 items-center gap-2 rounded-md bg-teal-600 px-3 text-xs font-medium text-white transition-all hover:bg-teal-700 active:scale-[0.98]"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Paid
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
