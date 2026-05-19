"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Package } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { Department, IngredientRow } from "@/lib/types/database";

const LOW_MOVING_DAYS = 7;

type IngredientHealthRow = IngredientRow & {
  lastMovementAt: string | null;
  daysSinceMovement: number | null;
  isLowMoving: boolean;
};

export function InventoryHealthPanel() {
  const supabase = getSupabaseClient();
  const [rows, setRows] = useState<IngredientHealthRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState<Department | "all">("all");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    const { data: ingredients, error: ingErr } = await supabase
      .from("ingredient")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (ingErr) {
      setError(ingErr.message);
      setIsLoading(false);
      return;
    }

    const { data: logs, error: logErr } = await supabase
      .from("stock_log")
      .select("ingredient_id, created_at")
      .order("created_at", { ascending: false });

    if (logErr) {
      setError(logErr.message);
      setIsLoading(false);
      return;
    }

    const lastByIngredient = new Map<string, string>();
    for (const log of logs ?? []) {
      if (!lastByIngredient.has(log.ingredient_id)) {
        lastByIngredient.set(log.ingredient_id, log.created_at);
      }
    }

    const now = Date.now();
    const msPerDay = 86_400_000;

    const enriched: IngredientHealthRow[] = (ingredients ?? []).map((ing) => {
      const lastMovementAt = lastByIngredient.get(ing.id) ?? null;
      let daysSinceMovement: number | null = null;
      let isLowMoving = false;

      if (lastMovementAt) {
        daysSinceMovement = Math.floor((now - new Date(lastMovementAt).getTime()) / msPerDay);
        isLowMoving = daysSinceMovement > LOW_MOVING_DAYS;
      } else {
        isLowMoving = true;
      }

      return {
        ...ing,
        lastMovementAt,
        daysSinceMovement,
        isLowMoving,
      };
    });

    setRows(enriched);
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (departmentFilter === "all") return rows;
    return rows.filter((r) => r.department === departmentFilter);
  }, [departmentFilter, rows]);

  const lowMovingCount = filtered.filter((r) => r.isLowMoving).length;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Memuat kesehatan inventori…
      </div>
    );
  }

  if (error) {
    return (
      <p className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-300">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600/15 ring-1 ring-amber-500/30">
            <Package className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Inventory Health</h3>
            <p className="text-xs text-zinc-500">
              Low moving: tidak ada pergerakan stok &gt; {LOW_MOVING_DAYS} hari (
              {lowMovingCount} item)
            </p>
          </div>
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value as Department | "all")}
          className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white"
        >
          <option value="all">Semua dept</option>
          <option value="bar">Bar</option>
          <option value="kitchen">Kitchen</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Bahan</th>
              <th className="px-3 py-2">Dept</th>
              <th className="px-3 py-2">Jenis</th>
              <th className="px-3 py-2 text-right">Stok</th>
              <th className="px-3 py-2">Terakhir gerak</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {filtered.map((row) => (
              <tr
                key={row.id}
                className={row.isLowMoving ? "bg-amber-950/20" : undefined}
              >
                <td className="px-3 py-2 font-medium text-zinc-200">{row.name}</td>
                <td className="px-3 py-2 capitalize text-zinc-400">{row.department}</td>
                <td className="px-3 py-2 capitalize text-zinc-400">{row.kind ?? "raw"}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                  {Number(row.current_stock).toLocaleString("id-ID")} {row.unit}
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  {row.lastMovementAt
                    ? new Date(row.lastMovementAt).toLocaleDateString("id-ID")
                    : "—"}
                  {row.daysSinceMovement != null && (
                    <span className="ml-1 text-xs text-zinc-600">
                      ({row.daysSinceMovement} hari)
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.isLowMoving ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-300">
                      <AlertTriangle className="h-3 w-3" />
                      Low moving
                    </span>
                  ) : (
                    <span className="text-xs text-emerald-400">Aktif</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
