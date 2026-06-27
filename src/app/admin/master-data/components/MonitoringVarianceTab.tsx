"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Lock,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClientOrNull } from "@/lib/supabase/client";
import type {
  ClosingStatus,
  Department,
  IngredientRow,
  StockLedgerRow,
  WorksheetSessionRow,
} from "@/lib/types/database";
import { formatBusinessDateLabel, resolveBusinessDate } from "@/lib/utils/dateHelper";

type LedgerDisplayRow = {
  ingredient: IngredientRow;
  ledger: StockLedgerRow;
};

const DEPARTMENTS: Department[] = ["bar", "kitchen"];

function StatusBadge({ status }: { status: ClosingStatus | "NONE" }) {
  const config: Record<
    ClosingStatus | "NONE",
    { label: string; className: string; Icon: typeof CircleDashed }
  > = {
    NONE: {
      label: "Belum Ada Session",
      className: "bg-slate-50 text-slate-600 ring-slate-200",
      Icon: CircleDashed,
    },
    DRAFT: {
      label: "Draft",
      className: "bg-slate-100 text-slate-700 ring-slate-200",
      Icon: CircleDashed,
    },
    SUBMITTED: {
      label: "Submitted",
      className: "bg-amber-500/20 text-amber-900 ring-amber-500/40",
      Icon: Send,
    },
    PENDING_APPROVAL_ADMIN: {
      label: "Pending Admin",
      className: "bg-rose-50 text-rose-700 ring-rose-200",
      Icon: AlertTriangle,
    },
    ADJUSTED: {
      label: "Adjusted",
      className: "bg-orange-50 text-orange-700 ring-orange-200",
      Icon: AlertTriangle,
    },
    LOCKED: {
      label: "Locked",
      className: "bg-teal-50 text-teal-700 ring-teal-200",
      Icon: Lock,
    },
  };

  const item = config[status];
  const Icon = item.Icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${item.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {item.label}
    </span>
  );
}

function DepartmentPanel({
  department,
  session,
  businessDate,
  businessLabel,
  onRefresh,
}: {
  department: Department;
  session: WorksheetSessionRow | null;
  businessDate: string;
  businessLabel: string;
  onRefresh: () => void;
}) {
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const [ledgerRows, setLedgerRows] = useState<LedgerDisplayRow[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status: ClosingStatus | "NONE" = session?.status ?? "NONE";
  const showLedger = status === "SUBMITTED" || status === "ADJUSTED" || status === "LOCKED";
  const canLock = status === "SUBMITTED";

  const loadLedger = useCallback(async () => {
    if (!supabase || !showLedger) {
      setLedgerRows([]);
      return;
    }

    setLoadingLedger(true);
    setError(null);

    const { data: ingredients, error: ingErr } = await supabase
      .from("ingredient")
      .select("*")
      .eq("department", department)
      .order("name");

    if (ingErr) {
      setError(ingErr.message);
      setLoadingLedger(false);
      return;
    }

    const { data: ledgers, error: ledErr } = await supabase
      .from("stock_ledger")
      .select("*")
      .eq("business_date", businessDate)
      .in("ingredient_id", (ingredients ?? []).map((i) => i.id));

    if (ledErr) {
      setError(ledErr.message);
      setLoadingLedger(false);
      return;
    }

    const ledgerMap = new Map((ledgers ?? []).map((l) => [l.ingredient_id, l]));
    const merged: LedgerDisplayRow[] = [];

    for (const ing of ingredients ?? []) {
      const ledger = ledgerMap.get(ing.id);
      if (ledger) merged.push({ ingredient: ing, ledger });
    }

    setLedgerRows(merged);
    setLoadingLedger(false);
  }, [businessDate, department, showLedger, supabase]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  const handleLock = async () => {
    if (!supabase || !session) return;

    const staff = getStaffSession();
    if (!staff) {
      setError("Session admin tidak ditemukan.");
      return;
    }

    const confirmed = window.confirm(
      `Kunci data operasional ${department.toUpperCase()} untuk ${businessLabel}? Tindakan ini final.`
    );
    if (!confirmed) return;

    setLocking(true);
    setError(null);

    const lockedAt = new Date().toISOString();

    const { error: lockErr } = await supabase
      .from("worksheet_session")
      .update({
        status: "LOCKED",
        locked_at: lockedAt,
        locked_by_staff_id: staff.id,
      })
      .eq("id", session.id);

    if (lockErr) {
      setError(lockErr.message);
      setLocking(false);
      return;
    }

    setLocking(false);
    onRefresh();
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold capitalize text-slate-900">{department}</h3>
          <p className="text-xs text-slate-500">Hari bisnis: {businessLabel}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {canLock && (
        <button
          type="button"
          disabled={locking}
          onClick={() => void handleLock()}
          className="mb-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 font-bold text-white hover:bg-red-500 disabled:opacity-50 sm:w-auto sm:px-6"
        >
          {locking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
          LOCK DATA OPERASIONAL
        </button>
      )}

      {status === "LOCKED" && (
        <p className="mb-3 flex items-center gap-2 text-sm text-teal-700">
          <CheckCircle2 className="h-4 w-4" />
          Data terkunci — tidak dapat diubah staf.
        </p>
      )}

      {showLedger ? (
        loadingLedger ? (
          <p className="py-6 text-center text-slate-500">Memuat ledger…</p>
        ) : ledgerRows.length === 0 ? (
          <p className="py-6 text-center text-slate-500">Belum ada data stock_ledger hari ini.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Nama Bahan</th>
                  <th className="px-3 py-2 font-medium text-right">Opening</th>
                  <th className="px-3 py-2 font-medium text-right">In</th>
                  <th className="px-3 py-2 font-medium text-right">Actual</th>
                  <th className="px-3 py-2 font-medium text-right">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerRows.map(({ ingredient, ledger }) => (
                  <tr key={ledger.id}>
                    <td className="px-3 py-2 text-slate-900">
                      {ingredient.name}
                      <span className="ml-1 text-xs text-slate-500">({ingredient.unit})</span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                      {Number(ledger.opening_stock)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                      {Number(ledger.in_qty)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-teal-700">
                      {Number(ledger.closing_stock)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-medium ${
                        Number(ledger.adjustment_qty) !== 0
                          ? "text-amber-700"
                          : "text-slate-500"
                      }`}
                    >
                      {Number(ledger.adjustment_qty)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <p className="text-sm text-slate-500">
          {status === "DRAFT" || status === "NONE"
            ? "Menunggu staf submit closing untuk menampilkan variance."
            : null}
        </p>
      )}
    </section>
  );
}

export function MonitoringVarianceTab() {
  const supabase = useMemo(() => getSupabaseClientOrNull(), []);
  const [businessDate, setBusinessDate] = useState("");
  const [sessions, setSessions] = useState<Record<Department, WorksheetSessionRow | null>>({
    bar: null,
    kitchen: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const businessLabel = useMemo(
    () => (businessDate ? formatBusinessDateLabel(businessDate) : ""),
    [businessDate]
  );

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Supabase belum dikonfigurasi.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const date = resolveBusinessDate();
    setBusinessDate(date);

    const next: Record<Department, WorksheetSessionRow | null> = {
      bar: null,
      kitchen: null,
    };

    for (const dept of DEPARTMENTS) {
      const { data, error: err } = await supabase
        .from("worksheet_session")
        .select("*")
        .eq("business_date", date)
        .eq("department", dept)
        .maybeSingle();

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      next[dept] = data;
    }

    setSessions(next);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Monitoring Harian</h2>
          {businessLabel && (
            <p className="text-sm text-slate-600">
              Hari Bisnis: <span className="text-teal-700">{businessLabel}</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm text-slate-700 hover:border-teal-300 hover:text-teal-700"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          Memuat status operasional…
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {DEPARTMENTS.map((dept) => (
            <DepartmentPanel
              key={dept}
              department={dept}
              session={sessions[dept]}
              businessDate={businessDate}
              businessLabel={businessLabel}
              onRefresh={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}
