"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { canEditStaffData } from "@/lib/auth/permissions";
import { getStaffSession } from "@/lib/auth/session";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, WorksheetOpnamePendingRow } from "@/lib/types/database";
import { applyAdminStockAdjustment } from "@/lib/worksheet/stockAdjustment";
import { formatBusinessDateLabel } from "@/lib/utils/dateHelper";

type PendingWithIngredient = WorksheetOpnamePendingRow & {
  ingredient: { name: string; unit: string; department: Department };
};

export function OpnameApprovalPanel() {
  const supabase = getSupabaseClient();
  const canEdit = canEditStaffData(getStaffSession()?.role);
  const [pending, setPending] = useState<PendingWithIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: fetchErr } = await supabase
      .from("worksheet_opname_pending")
      .select(
        `
        *,
        ingredient:ingredient_id ( name, unit, department )
      `
      )
      .eq("status", "PENDING_APPROVAL_ADMIN")
      .order("created_at", { ascending: false });

    if (fetchErr) {
      setError(fetchErr.message);
      setPending([]);
    } else {
      setPending((data ?? []) as PendingWithIngredient[]);
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const handleReview = async (
    row: PendingWithIngredient,
    decision: "APPROVED" | "REJECTED"
  ) => {
    const session = getStaffSession();
    if (!session) {
      setError("Sesi admin tidak ditemukan.");
      return;
    }

    setActingId(row.id);
    setError(null);

    try {
      const { error: updateErr } = await supabase
        .from("worksheet_opname_pending")
        .update({
          status: decision,
          reviewed_by_staff_id: session.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (updateErr) throw new Error(updateErr.message);

      if (decision === "APPROVED") {
        await applyAdminStockAdjustment({
          supabase,
          ingredientId: row.ingredient_id,
          ingredientName: row.ingredient.name,
          qtyBefore: Number(row.system_stock),
          qtyAfter: Number(row.physical_stock),
          reason: `Persetujuan opname selisih besar (${formatBusinessDateLabel(row.business_date)})`,
          adminStaffId: session.id,
          adminName: session.name,
          businessDate: row.business_date,
        });

        const { data: remaining } = await supabase
          .from("worksheet_opname_pending")
          .select("id")
          .eq("session_id", row.session_id)
          .eq("status", "PENDING_APPROVAL_ADMIN");

        if ((remaining ?? []).length === 0) {
          const lockedAt = new Date().toISOString();
          await supabase
            .from("worksheet_session")
            .update({
              status: "LOCKED",
              locked_at: lockedAt,
              locked_by_staff_id: session.id,
            })
            .eq("id", row.session_id);

          await supabase
            .from("business_day")
            .update({ status: "LOCKED" })
            .eq("business_date", row.business_date);
        }
      }

      setToast(
        decision === "APPROVED"
          ? `Opname ${row.ingredient.name} disetujui — stok diperbarui.`
          : `Opname ${row.ingredient.name} ditolak — stok sistem tidak diubah.`
      );
      await loadPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memproses persetujuan.");
    } finally {
      setActingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat antrian persetujuan opname…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-700">
          Persetujuan Opname (Selisih Besar)
        </h3>
        <p className="mt-1 text-xs text-slate-600">
          Transaksi dengan selisih lebih dari 15% dari stok sistem ditahan di sini sebelum stok
          permanen diperbarui.
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {toast ? (
        <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-700">
          {toast}
        </p>
      ) : null}

      {pending.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-600">
          Tidak ada opname menunggu persetujuan.
        </p>
      ) : (
        <ul className="space-y-3">
          {pending.map((row) => {
            const pct = (Number(row.variance_pct) * 100).toFixed(1);
            return (
              <li
                key={row.id}
                className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{row.ingredient.name}</p>
                    <p className="text-xs text-slate-600">
                      {formatBusinessDateLabel(row.business_date)} · {row.ingredient.department}
                    </p>
                  </div>
                  <p className="text-xs font-medium text-amber-900">Selisih {pct}%</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>
                    <dt>Stok sistem</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {Number(row.system_stock).toLocaleString("id-ID")} {row.ingredient.unit}
                    </dd>
                  </div>
                  <div>
                    <dt>Stok fisik (staff)</dt>
                    <dd className="font-semibold tabular-nums text-slate-900">
                      {Number(row.physical_stock).toLocaleString("id-ID")} {row.ingredient.unit}
                    </dd>
                  </div>
                </dl>
                {canEdit ? (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={actingId === row.id}
                      onClick={() => void handleReview(row, "APPROVED")}
                      className="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg bg-teal-600 text-sm font-bold text-white transition hover:bg-teal-700 disabled:opacity-50"
                    >
                      {actingId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Setujui
                    </button>
                    <button
                      type="button"
                      disabled={actingId === row.id}
                      onClick={() => void handleReview(row, "REJECTED")}
                      className="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-lg border border-red-500/50 bg-red-500/10 text-sm font-bold text-red-700 disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                      Tolak
                    </button>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-slate-600">Mode penonton: tidak dapat menyetujui atau menolak.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
